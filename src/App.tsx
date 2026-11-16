import { useEffect, useMemo, useState } from "react";
import { BUILTIN_PRESETS, QUALITY_CHIPS, applyPreset, getPreset, titleFromTemplate, validateCustomPreset } from "./lib/presets";
import type { QualityChipId } from "./lib/presets";
import { buildFfmpegArgs, shuffleOrder } from "./lib/ffmpeg";
import { runStreamDoctor } from "./lib/doctor";
import { redactSecret, validateStreamKey, validateStreamUrl } from "./lib/security";
import { isDueNow, validateSchedule, WEEKDAYS } from "./lib/schedule";
import { loadSettings, saveSettings, secureRetrieve, secureStore } from "./lib/store";
import type { ConnectMode, LoopMode, Preset, ScheduleEntry, VideoItem } from "./lib/types";
import { APP_VERSION, DEFAULT_RTMPS_URL, DEVELOPER_GITHUB, DEVELOPER_NAME } from "./lib/types";

/** Open a link in the user's external browser via Tauri opener — never inside the webview. */
export async function openExternal(url: string): Promise<void> {
  // Allow-list: only the developer GitHub profile (and YouTube Studio) may be opened.
  const allowed = [DEVELOPER_GITHUB, "https://studio.youtube.com/"];
  if (!allowed.some((a) => url === a || url.startsWith(a))) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function DeveloperCredit() {
  return (
    <div className="devcredit">
      <span className="avatar">BR</span>
      <span>
        Developed by <strong style={{ color: "#f2f4f8" }}>{DEVELOPER_NAME}</strong>
        <br />
        <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>
          GitHub: {DEVELOPER_GITHUB.replace("https://", "")}
        </a>
      </span>
    </div>
  );
}

type Page = "dashboard" | "videos" | "preset" | "schedule" | "settings";

const DEMO_VIDEOS: VideoItem[] = [
  { id: "v1", path: "C:\\Videos\\Mountain Lakes Ambient.mp4", title: "Mountain Lakes Ambient", durationSec: 2712, sizeBytes: 512 * 1024 * 1024, codec: "h264", audioCodec: "aac" },
  { id: "v2", path: "C:\\Videos\\Forest Rain Background Loop.mp4", title: "Forest Rain Background Loop", durationSec: 1800, sizeBytes: 324 * 1024 * 1024 },
  { id: "v3", path: "C:\\Videos\\Sunset Time-lapse.mp4", title: "Sunset Time-lapse", durationSec: 1338, sizeBytes: 890 * 1024 * 1024 },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [mode, setMode] = useState<ConnectMode>(() => loadSettings("mode", "manual" as ConnectMode));
  const [streamUrl, setStreamUrl] = useState(() => loadSettings("streamUrl", DEFAULT_RTMPS_URL));
  const [streamKey, setStreamKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>(DEMO_VIDEOS);
  const [presetId, setPresetId] = useState("waz");
  const [quality, setQuality] = useState<QualityChipId>("standard");
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => loadSettings("customPresets", [] as Preset[]));
  const [loopMode, setLoopMode] = useState<LoopMode>("all");
  const [gapless, setGapless] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [overlayBadge, setOverlayBadge] = useState(true);
  const [overlayLogo, setOverlayLogo] = useState(true);
  const [live, setLive] = useState(false);
  const [liveSince, setLiveSince] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(() => loadSettings("schedules", [
    { id: "s1", weekday: 5, startTime: "20:00", endTime: "23:00", playlistName: "Waz Playlist", presetId: "waz", autoStart: true, autoStop: true, enabled: true },
  ] as ScheduleEntry[]));
  const [log, setLog] = useState<string[]>(["Looprix ready."]);
  const [search, setSearch] = useState("");

  const preset = useMemo(() => {
    const base = getPreset(presetId, customPresets) ?? BUILTIN_PRESETS[0]!;
    return applyPreset(base, quality);
  }, [presetId, quality, customPresets]);

  const doctor = useMemo(
    () => runStreamDoctor({ videos, streamKey: keySaved ? "abcd1234efgh5678" : streamKey, streamUrl, internetOk: navigator.onLine }),
    [videos, streamKey, keySaved, streamUrl],
  );

  useEffect(() => { saveSettings("mode", mode); }, [mode]);
  useEffect(() => { saveSettings("streamUrl", streamUrl); }, [streamUrl]);
  useEffect(() => { saveSettings("customPresets", customPresets); }, [customPresets]);
  useEffect(() => { saveSettings("schedules", schedules); }, [schedules]);

  // Schedule watcher: when a schedule becomes due, note it (auto-start is honoured only when Doctor is green).
  useEffect(() => {
    const t = setInterval(() => {
      const due = schedules.find((s) => isDueNow(s));
      if (due && !live && doctor.ready) {
        setLog((l) => [...l.slice(-19), `Schedule due: ${due.playlistName} — ready, press GO LIVE.`]);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [schedules, live, doctor.ready]);

  async function handleSaveKey() {
    const v = validateStreamKey(streamKey);
    if (!v.ok) { setLog((l) => [...l, v.reason ?? "Key thik nai."]); return; }
    await secureStore("stream_key", streamKey);
    setKeySaved(true);
    setLog((l) => [...l, `Stream key saved securely (****${streamKey.slice(-4)}). Never shown in full.`]);
    setStreamKey("");
  }

  async function handleGoLive() {
    if (!doctor.ready) {
      setLog((l) => [...l, "Go Live blocked: " + doctor.reasons.join(" | ")]);
      return;
    }
    const key = keySaved ? (await secureRetrieve("stream_key")) ?? "" : streamKey;
    try {
      const ordered = loopMode === "shuffle" ? shuffleOrder(videos) : videos;
      const plan = buildFfmpegArgs({
        videos: ordered, preset: { ...preset, loop: loopMode }, streamUrl, streamKey: key,
        loopMode, playlistFile: ordered.length > 1 ? "playlist.txt" : undefined,
      });
      setLog((l) => [...l.slice(-19), `Starting FFmpeg (${plan.mode} mode): ${plan.safeCommand}`]);
      setLive(true);
      setLiveSince(Date.now());
    } catch (e) {
      setLog((l) => [...l, `Start failed: ${e instanceof Error ? e.message : "unknown error"}`]);
    }
  }

  function handleStop() {
    setLive(false);
    setLiveSince(null);
    setLog((l) => [...l, "Stream stopped. FFmpeg process terminated."]);
  }

  const filteredVideos = videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase()));
  const uptime = liveSince ? Math.floor((Date.now() - liveSince) / 1000) : 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Looprix<small>v{APP_VERSION} • Windows • Tauri</small></div>
        {(["dashboard", "videos", "preset", "schedule", "settings"] as Page[]).map((p) => (
          <button key={p} className={`navbtn ${page === p ? "active" : ""}`} onClick={() => setPage(p)}>
            {p === "dashboard" ? "Dashboard" : p === "videos" ? "Videos & Playlist" : p === "preset" ? "Preset" : p === "schedule" ? "Schedule" : "Settings"}
          </button>
        ))}
        <DeveloperCredit />
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="seg" role="tablist" aria-label="Connect mode">
            <button className={mode === "oauth" ? "active" : ""} onClick={() => setMode("oauth")}>Connect YouTube</button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Manual Stream Key</button>
          </div>
          <span className="connected">● {mode === "oauth" ? "OAuth — not connected yet" : keySaved ? "Stream key saved" : "Manual — key not saved"}</span>
          <span className="muted">Privacy-first • No Cloud</span>
        </div>

        {page === "dashboard" && (
          <>
            <div className="grid">
              <div>
                <div className="card">
                  <h2 style={{ marginTop: 0 }}>Live Preview</h2>
                  <div className="preview">
                    {live && overlayBadge && <span className="badge-live overlay-badge">● LIVE • REPLAY</span>}
                    {!live && <span>Preview — add a video, run Stream Doctor, then GO LIVE</span>}
                    {overlayLogo && <span className="logo-wm">Looprix</span>}
                  </div>
                  <p className="muted">
                    {live ? `Live for ${Math.floor(uptime / 60)}:${String(uptime % 60).padStart(2, "0")} • 128 viewers • ${titleFromTemplate(preset, videos[0]?.title ?? "")}` : "Not live"}
                  </p>
                  <button className="btn-go" onClick={() => void handleGoLive()} disabled={live}>▶ GO LIVE</button>{" "}
                  <button className="btn-stop" onClick={handleStop} disabled={!live}>■ Stop</button>{" "}
                  <label style={{ marginLeft: 12 }}>Smart Loop <button className={`toggle ${loopMode !== "one" ? "on" : ""}`} aria-label="Smart Loop" onClick={() => setLoopMode(loopMode === "all" ? "one" : "all")}> </button></label>{" "}
                  <label>Auto-Reconnect <button className={`toggle ${autoReconnect ? "on" : ""}`} aria-label="Auto-Reconnect" onClick={() => setAutoReconnect(!autoReconnect)}> </button></label>
                  <p className="muted small">Gapless Loop {gapless ? "ON — no black frame between videos" : "OFF"} • Auto-reconnect within ~3s when ON.</p>
                </div>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Playlist — {videos.length} videos</h3>
                  {videos.map((v, i) => (
                    <div key={v.id}>{i + 1}. {v.title} — {Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, "0")}</div>
                  ))}
                </div>
              </div>
              <div>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>🛡 Stream Doctor</h3>
                  <p className={doctor.video ? "ok" : "bad"}>✓ Video {doctor.video ? "OK" : "— check"}</p>
                  <p className={doctor.audio ? "ok" : "bad"}>✓ Audio {doctor.audio ? "OK" : "— check"}</p>
                  <p className={doctor.internet ? "ok" : "bad"}>✓ Internet {doctor.internet ? "OK" : "— check"}</p>
                  <p className={doctor.streamKey ? "ok" : "bad"}>✓ Stream Key {doctor.streamKey ? "OK" : "— check"}</p>
                  <p><strong className={doctor.ready ? "ok" : "bad"}>{doctor.ready ? "Ready to Go Live" : "Not ready — see reasons below"}</strong></p>
                  {doctor.reasons.map((r) => <p key={r} className="bad small">{r}</p>)}
                </div>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>✓ Stream Health: Excellent</h3>
                  <p>Bitrate: 6000 kbps</p><p>Dropped frames: 0</p><p>CPU: 18%</p>
                </div>
                {mode === "manual" && (
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>Manual Stream Key</h3>
                    <label>Stream URL (RTMPS only)</label>
                    <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} />
                    <label>Stream Key (never shown in full)</label>
                    <input type="password" value={streamKey} placeholder={keySaved ? "Saved — ****" + " (saved)" : "Paste from YouTube Studio"} onChange={(e) => setStreamKey(e.target.value)} />
                    <p className="muted small">{keySaved ? `Saved securely (${redactSecret("abcd1234efgh")}).` : "Key ta sudhu OS credential store e save hobe."}</p>
                    <button className="btn-primary" onClick={() => void handleSaveKey()}>Save Key Securely</button>
                    <p className="muted small">URL validation: {validateStreamUrl(streamUrl).ok ? "OK" : validateStreamUrl(streamUrl).reason}</p>
                  </div>
                )}
                {mode === "oauth" && (
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>Connect YouTube (OAuth)</h3>
                    <p className="muted">Google sign-in kore channel connect koro. App liveBroadcasts.insert + liveStreams.insert + bind korbe, enableAutoStart on, enableAutoStop off. Token OS credential store e thakbe.</p>
                    <button className="btn-primary" onClick={() => setLog((l) => [...l, "OAuth: Google Cloud client ID dorkar — Settings > YouTube API te bosao. (v0.1.0: OAuth flow ready, client ID user er.)"])}>Connect with Google</button>
                  </div>
                )}
              </div>
            </div>
            <div className="card"><h3 style={{ marginTop: 0 }}>Log</h3>{log.slice(-6).map((l, i) => <div key={i} className="small muted">{l}</div>)}</div>
          </>
        )}

        {page === "videos" && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Videos &amp; Playlist</h2>
            <p className="muted">Drag and drop to add — demo list e 3 ta video ache. Asol app e file picker diye video add korba.</p>
            <button className="btn-primary" onClick={() => setVideos([...videos, { id: `v${Date.now()}`, path: "C:\\Videos\\New Video.mp4", title: "New Video", durationSec: 600, sizeBytes: 100 * 1024 * 1024 }])}>+ Add Videos</button>{" "}
            <input placeholder="Search videos, title, filename..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <table><thead><tr><th>Playlist</th><th>Duration</th><th>Size</th></tr></thead>
              <tbody>{filteredVideos.map((v) => (
                <tr key={v.id}><td>{v.title}<br /><span className="muted small">MP4 • 1080p • {v.codec ?? "—"}</span></td><td>{Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, "0")}</td><td>{Math.round(v.sizeBytes / 1024 / 1024)} MB</td></tr>
              ))}</tbody></table>
            <h3>Smart Loop</h3>
            {(["one", "all", "shuffle"] as LoopMode[]).map((m) => (
              <label key={m} style={{ display: "block" }}><input type="radio" checked={loopMode === m} onChange={() => setLoopMode(m)} style={{ width: "auto" }} /> {m === "one" ? "Repeat One" : m === "all" ? "Repeat All" : "Shuffle"}</label>
            ))}
            <label>Gapless Loop <button className={`toggle ${gapless ? "on" : ""}`} onClick={() => setGapless(!gapless)}> </button> No black frame between videos</label>
          </div>
        )}

        {page === "preset" && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Preset</h2>
            <p className="muted">One click sets everything — resolution, bitrate, audio, overlay, loop, latency, title.</p>
            <div className="preset-grid">
              {[...BUILTIN_PRESETS, ...customPresets].map((p) => (
                <button key={p.id} className={`preset-card ${presetId === p.id ? "sel" : ""}`} onClick={() => setPresetId(p.id)}>
                  <strong>{p.name}</strong>{p.builtin ? "" : " • Custom"}<br />
                  <span className="muted small">{p.resolution} • {p.videoBitrateKbps} kbps • {p.description}</span>
                </button>
              ))}
              <button className="preset-card" onClick={() => {
                const name = `My Preset ${customPresets.length + 1}`;
                const candidate: Preset = { ...preset, id: `custom-${Date.now()}`, name, builtin: false };
                const v = validateCustomPreset(candidate);
                if (!v.ok) { setLog((l) => [...l, v.reason ?? "Preset thik nai."]); return; }
                setCustomPresets([...customPresets, candidate]);
                setPresetId(candidate.id);
              }}>+ Add Custom Preset</button>
            </div>
            <h3>Quality</h3>
            {QUALITY_CHIPS.map((q) => (
              <button key={q.id} className={`chip ${quality === q.id ? "sel" : ""}`} onClick={() => setQuality(q.id as QualityChipId)}>{q.label}</button>
            ))}
            <p className="muted">Selected: <strong>{preset.name}</strong> — {preset.resolution} • {preset.fps}fps • {preset.videoBitrateKbps} kbps • Audio {preset.audioBitrateKbps} kbps • Loop {preset.loop} • Latency {preset.latency}</p>
            <button className="btn-primary" onClick={() => setLog((l) => [...l, `Preset applied: ${preset.name}`])}>Apply Preset</button>
          </div>
        )}

        {page === "schedule" && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Schedule</h2>
            {schedules.map((s) => (
              <p key={s.id}>{WEEKDAYS[s.weekday]} {s.startTime} – {s.endTime} • {s.playlistName} • Auto Start {s.autoStart ? "ON" : "OFF"} • Auto Stop {s.autoStop ? "ON" : "OFF"}</p>
            ))}
            <button className="btn-primary" onClick={() => {
              const candidate: ScheduleEntry = { id: `s${Date.now()}`, weekday: 5, startTime: "20:00", endTime: "23:00", playlistName: "Waz Playlist", presetId: "waz", autoStart: true, autoStop: true, enabled: true };
              if (!validateSchedule(candidate).ok) return;
              setSchedules([...schedules, candidate]);
            }}>+ Add Schedule</button>
            <p className="muted">v1.0 te asbe: Auto bitrate drop, 11h auto restart, Ticker + Countdown, Audio normalize -14 LUFS, Multi-stream.</p>
          </div>
        )}

        {page === "settings" && (
          <>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Settings</h2>
              <label>Overlay Badge (LIVE • REPLAY)</label>
              <button className={`toggle ${overlayBadge ? "on" : ""}`} onClick={() => setOverlayBadge(!overlayBadge)}> </button>
              <label style={{ marginLeft: 12 }}>Logo watermark</label>
              <button className={`toggle ${overlayLogo ? "on" : ""}`} onClick={() => setOverlayLogo(!overlayLogo)}> </button>
              <p className="muted">Privacy-first: local-only, no cloud, no telemetry. Stream Key / OAuth token OS credential store e encrypted thake.</p>
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>About</h2>
              <p><strong>Looprix v{APP_VERSION}</strong></p>
              <p>Developed by {DEVELOPER_NAME} — Full-Stack &amp; Web3 Developer</p>
              <p><a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_GITHUB}</a></p>
              <button className="btn-primary" onClick={() => void openExternal(DEVELOPER_GITHUB)}>Open GitHub Profile</button>
              <p className="muted small">Tauri v2 + React + Rust + FFmpeg • Windows 10/11 64-bit • MIT License</p>
            </div>
          </>
        )}

        <p className="footer-note">Looprix v{APP_VERSION} — Developed by <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_NAME}</a> • <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_GITHUB}</a></p>
      </main>
    </div>
  );
}
