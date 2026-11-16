import { useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_PRESETS, QUALITY_CHIPS, applyPreset, getPreset, titleFromTemplate, validateCustomPreset } from "./lib/presets";
import type { QualityChipId } from "./lib/presets";
import { buildConcatFile, buildFfmpegArgs, shuffleOrder } from "./lib/ffmpeg";
import { probeVideoFile, videoItemFromProbe } from "./lib/probe";
import { runStreamDoctor } from "./lib/doctor";
import { buildGoogleAuthUrl, validateOAuthCode } from "./lib/oauth";
import { validateStreamKey, validateStreamUrl } from "./lib/security";
import { isDueNow, parseTimeToMinutes, validateSchedule, WEEKDAYS } from "./lib/schedule";
import { loadSettings, saveSettings, secureRetrieve, secureStore } from "./lib/store";
import type { ConnectMode, LoopMode, Preset, ScheduleEntry, VideoItem } from "./lib/types";
import { APP_VERSION, DEFAULT_RTMPS_URL, DEVELOPER_GITHUB, DEVELOPER_NAME } from "./lib/types";
import logoUrl from "./assets/logo.png";

/** Open a link in the user's external browser via Tauri opener — never inside the webview. */
export async function openExternal(url: string): Promise<void> {
  // Allow-list: only the developer GitHub profile, YouTube Studio and Google OAuth may be opened.
  const allowed = [DEVELOPER_GITHUB, "https://studio.youtube.com/", "https://accounts.google.com/"];
  if (!allowed.some((a) => url === a || url.startsWith(a))) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Small wrapper over the Tauri `invoke` API (falls back to an error in the plain browser). */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

interface BroadcastCreated {
  broadcast_id: string;
  ingestion_address: string;
  stream_name: string;
  stream_name_redacted: string;
}

interface StreamStatus {
  running: boolean;
  reconnects: number;
  last_log_line: string;
}

function DeveloperCredit() {
  return (
    <div className="devcredit">
      <span>
        Developed by <strong style={{ color: "#f2f4f8" }}>{DEVELOPER_NAME}</strong>
        <br />
        <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>
          {DEVELOPER_GITHUB.replace("https://", "")}
        </a>
      </span>
    </div>
  );
}

type Page = "dashboard" | "videos" | "preset" | "schedule" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [mode, setMode] = useState<ConnectMode>(() => loadSettings("mode", "manual" as ConnectMode));
  const [streamUrl, setStreamUrl] = useState(() => loadSettings("streamUrl", DEFAULT_RTMPS_URL));
  const [streamKey, setStreamKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [savedKeyTail, setSavedKeyTail] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>(() => loadSettings("videos", [] as VideoItem[]));
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
  const [streamRunning, setStreamRunning] = useState<boolean | null>(null);
  const [reconnects, setReconnects] = useState(0);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(() => loadSettings("schedules", [] as ScheduleEntry[]));
  const [log, setLog] = useState<string[]>(["Looprix ready."]);
  const [search, setSearch] = useState("");
  const [ffmpegVersion, setFfmpegVersion] = useState<string | null>(null);
  const [ffmpegChecked, setFfmpegChecked] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthChannel, setOauthChannel] = useState<string | null>(null);
  const [ytClientIdSaved, setYtClientIdSaved] = useState(false);
  const [ytClientId, setYtClientId] = useState("");
  const [ytClientSecret, setYtClientSecret] = useState("");
  const [oauthCode, setOauthCode] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthGuide, setOauthGuide] = useState(false);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [schedWeekday, setSchedWeekday] = useState(5);
  const [schedStart, setSchedStart] = useState("20:00");
  const [schedEnd, setSchedEnd] = useState("23:00");
  const [schedAutoStart, setSchedAutoStart] = useState(true);
  const [schedAutoStop, setSchedAutoStop] = useState(true);

  const autoStartedRef = useRef<string | null>(null);
  const reconnectTriedRef = useRef(false);
  const startingRef = useRef(false);
  const didReprobeRef = useRef(false);

  const pushLog = (line: string) => setLog((l) => [...l.slice(-19), line]);

  const preset = useMemo(() => {
    const base = getPreset(presetId, customPresets) ?? BUILTIN_PRESETS[0]!;
    return applyPreset(base, quality);
  }, [presetId, quality, customPresets]);

  const doctor = useMemo(
    () =>
      runStreamDoctor({
        videos,
        streamKey: keySaved ? "abcd1234efgh5678" : streamKey,
        streamUrl,
        internetOk: navigator.onLine,
        ffmpegOk: ffmpegChecked ? ffmpegVersion !== null : undefined,
        ffmpegVersion: ffmpegVersion ?? undefined,
        oauthConnected: mode === "oauth" ? oauthConnected : undefined,
      }),
    [videos, streamKey, keySaved, streamUrl, ffmpegChecked, ffmpegVersion, mode, oauthConnected],
  );

  useEffect(() => { saveSettings("mode", mode); }, [mode]);
  useEffect(() => { saveSettings("streamUrl", streamUrl); }, [streamUrl]);
  useEffect(() => { saveSettings("videos", videos); }, [videos]);
  useEffect(() => { saveSettings("customPresets", customPresets); }, [customPresets]);
  useEffect(() => { saveSettings("schedules", schedules); }, [schedules]);

  // Startup: check FFmpeg, restore saved-key / OAuth / Client-ID state, re-probe stored videos.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const v = await tauriInvoke<string>("check_ffmpeg");
        if (!cancelled) { setFfmpegVersion(v); setFfmpegChecked(true); }
      } catch {
        if (!cancelled) setFfmpegChecked(true);
      }
      const savedKey = await secureRetrieve("stream_key");
      if (!cancelled && savedKey) { setKeySaved(true); setSavedKeyTail(savedKey.slice(-4)); }
      const token = await secureRetrieve("oauth_access_token");
      if (!cancelled && token) setOauthConnected(true);
      const cid = await secureRetrieve("yt_client_id");
      if (!cancelled && cid) setYtClientIdSaved(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-probe playlist files loaded from storage (a file may have moved or been deleted).
  useEffect(() => {
    if (didReprobeRef.current || videos.length === 0) return;
    didReprobeRef.current = true;
    void (async () => {
      const next: VideoItem[] = [];
      for (const v of videos) {
        const p = await probeVideoFile(v.path);
        next.push({
          ...v,
          exists: p.exists,
          durationSec: p.durationSec || v.durationSec,
          sizeBytes: p.sizeBytes || v.sizeBytes,
          codec: p.codec ?? v.codec,
          audioCodec: p.audioCodec ?? v.audioCodec,
        });
      }
      setVideos(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The one real start path — used by GO LIVE, the schedule watcher and the auto-reconnect. */
  async function startStreamInternal(): Promise<boolean> {
    if (startingRef.current) return false;
    startingRef.current = true;
    try {
      let url = streamUrl;
      let key = keySaved ? (await secureRetrieve("stream_key")) ?? "" : streamKey;
      if (mode === "oauth" && oauthConnected) {
        const token = await secureRetrieve("oauth_access_token");
        if (!token) { pushLog("OAuth token pawa jay nai — abar Connect with Google koro."); return false; }
        try {
          const bc = await tauriInvoke<BroadcastCreated>("create_broadcast", {
            req: {
              access_token: token,
              title: titleFromTemplate(preset, videos[0]?.title ?? ""),
              description: `Looprix replay — ${preset.name}`,
              privacy: "unlisted",
              scheduled_start_time: null,
            },
          });
          url = bc.ingestion_address;
          key = bc.stream_name;
          pushLog(`YouTube broadcast toiri holo (unlisted) — ingest ready, key ****${bc.stream_name_redacted.slice(-4)}.`);
        } catch (e) {
          pushLog(`Broadcast toiri holo na: ${errText(e)} — Manual Stream Key diye try koro.`);
          return false;
        }
      }
      if (!key.trim()) { pushLog("Stream key khali — age key save koro ba OAuth connect koro."); return false; }
      const ordered = loopMode === "shuffle" ? shuffleOrder(videos) : videos;
      let playlistFile: string | undefined;
      if (ordered.length > 1) {
        playlistFile = await tauriInvoke<string>("write_playlist_file", { content: buildConcatFile(ordered) });
      }
      const plan = buildFfmpegArgs({
        videos: ordered, preset: { ...preset, loop: loopMode }, streamUrl: url, streamKey: key,
        loopMode, playlistFile,
      });
      pushLog(`Starting FFmpeg (${plan.mode} mode): ${plan.safeCommand}`);
      await tauriInvoke<string>("start_stream", { req: { args: plan.args, auto_reconnect: autoReconnect, max_retries: 5 } });
      reconnectTriedRef.current = false;
      setLive(true);
      setLiveSince(Date.now());
      setStreamRunning(true);
      pushLog("Live cholche.");
      return true;
    } catch (e) {
      pushLog(`Start failed: ${errText(e)}`);
      return false;
    } finally {
      startingRef.current = false;
    }
  }

  async function handleStop() {
    try {
      await tauriInvoke<string>("stop_stream");
    } catch (e) {
      pushLog(`Stop korte pari nai: ${errText(e)} — abar try koro.`);
      return;
    }
    autoStartedRef.current = null;
    setLive(false);
    setLiveSince(null);
    setStreamRunning(null);
    pushLog("Stream stopped. FFmpeg process terminated.");
  }

  const startRef = useRef(startStreamInternal);
  const stopRef = useRef(handleStop);
  useEffect(() => { startRef.current = startStreamInternal; stopRef.current = handleStop; });

  // While live, poll the real FFmpeg process state every 5s.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      void (async () => {
        try {
          const s = await tauriInvoke<StreamStatus>("stream_status");
          setStreamRunning(s.running);
          setReconnects(s.reconnects);
          if (!s.running) {
            if (autoReconnect && !reconnectTriedRef.current) {
              reconnectTriedRef.current = true;
              pushLog("Stream bondho hoye geche — ekbar auto-reconnect try korchi...");
              const ok = await startRef.current();
              if (!ok) setLive(false);
            } else {
              pushLog("Stream bondho hoye geche.");
              setLive(false);
            }
          }
        } catch {
          // status poll failing must never kill the UI — next tick retries
        }
      })();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, autoReconnect]);

  // Schedule watcher: auto-start when due, auto-stop at the end time.
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      if (live) {
        const startedKey = autoStartedRef.current;
        if (startedKey) {
          const [sid] = startedKey.split("@");
          const s = schedules.find((x) => x.id === sid);
          if (s && s.autoStop) {
            const end = parseTimeToMinutes(s.endTime);
            const mins = now.getHours() * 60 + now.getMinutes();
            if (end !== null && mins >= end) {
              pushLog(`Schedule sesh (${s.playlistName}) — auto stop korchi.`);
              void stopRef.current();
            }
          }
        }
        return;
      }
      const due = schedules.find((s) => isDueNow(s, now));
      if (due && doctor.ready) {
        const key = `${due.id}@${now.toDateString()}`;
        if (autoStartedRef.current === key) return;
        autoStartedRef.current = key;
        pushLog(`Schedule due: ${due.playlistName} — auto start korchi.`);
        void startRef.current();
      }
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, live, doctor.ready]);

  async function handleSaveKey() {
    const v = validateStreamKey(streamKey);
    if (!v.ok) { pushLog(v.reason ?? "Key thik nai."); return; }
    await secureStore("stream_key", streamKey);
    setKeySaved(true);
    setSavedKeyTail(streamKey.slice(-4));
    pushLog(`Stream key saved securely (****${streamKey.slice(-4)}). Never shown in full.`);
    setStreamKey("");
  }

  async function handleGoLive() {
    if (!doctor.ready) {
      pushLog("Go Live blocked: " + doctor.reasons.join(" | "));
      return;
    }
    await startStreamInternal();
  }

  async function handleAddVideos() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: true,
        filters: [{ name: "Video files", extensions: ["mp4", "mkv", "mov", "webm", "avi", "m4v"] }],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const fresh: VideoItem[] = [];
      for (const p of paths) {
        if (videos.some((v) => v.path.toLowerCase() === p.toLowerCase())) {
          pushLog(`Skip korlam (agei ache): ${p.split(/[\\/]/).pop()}`);
          continue;
        }
        fresh.push(videoItemFromProbe(await probeVideoFile(p)));
      }
      if (fresh.length > 0) {
        setVideos([...videos, ...fresh]);
        pushLog(`${fresh.length} ta video add holo.`);
      }
    } catch (e) {
      pushLog(`File picker khulte pari nai: ${errText(e)}`);
    }
  }

  function handleRemoveVideo(id: string) {
    setVideos(videos.filter((v) => v.id !== id));
  }

  async function handleSaveYouTubeApi() {
    if (!ytClientId.trim() || !ytClientSecret.trim()) {
      pushLog("Client ID ar Client Secret — duitai bosate hobe.");
      return;
    }
    await secureStore("yt_client_id", ytClientId.trim());
    await secureStore("yt_client_secret", ytClientSecret.trim());
    setYtClientIdSaved(true);
    setYtClientId("");
    setYtClientSecret("");
    pushLog("YouTube API Client ID / Secret save holo (OS credential store — kokhono file ba log e thake na).");
  }

  async function handleConnectGoogle() {
    const cid = await secureRetrieve("yt_client_id");
    if (!cid) {
      setOauthGuide(true);
      setPage("settings");
      pushLog("Age Google Client ID bosao — Settings > YouTube API.");
      return;
    }
    await openExternal(buildGoogleAuthUrl(cid));
    pushLog("Browser e Google sign-in khuleche — code ta copy kore Settings > YouTube API te paste koro.");
  }

  async function handleCompleteOAuth() {
    const v = validateOAuthCode(oauthCode);
    if (!v.ok) { pushLog(v.reason ?? "Code thik nai."); return; }
    const cid = await secureRetrieve("yt_client_id");
    const sec = await secureRetrieve("yt_client_secret");
    if (!cid || !sec) { pushLog("Client ID / Secret pawa jay nai — abar save koro."); return; }
    setOauthBusy(true);
    try {
      const r = await tauriInvoke<{ channelTitle?: string | null }>("exchange_oauth_code", {
        code: oauthCode.trim(),
        client_id: cid,
        client_secret: sec,
      });
      setOauthConnected(true);
      setOauthChannel(r.channelTitle ?? null);
      setOauthCode("");
      pushLog(`YouTube connected${r.channelTitle ? ` — channel: ${r.channelTitle}` : ""}.`);
    } catch (e) {
      pushLog(`OAuth sign-in holo na: ${errText(e)}`);
    } finally {
      setOauthBusy(false);
    }
  }

  function handleAddSchedule() {
    const candidate: ScheduleEntry = {
      id: `s${Date.now()}`,
      weekday: schedWeekday,
      startTime: schedStart,
      endTime: schedEnd,
      playlistName: `My Playlist (${videos.length} videos)`,
      presetId,
      autoStart: schedAutoStart,
      autoStop: schedAutoStop,
      enabled: true,
    };
    const v = validateSchedule(candidate);
    if (!v.ok) { pushLog(v.reason ?? "Schedule thik nai."); return; }
    setSchedules([...schedules, candidate]);
    pushLog(`Schedule add holo: ${WEEKDAYS[candidate.weekday]} ${candidate.startTime} – ${candidate.endTime}.`);
  }

  const filteredVideos = videos.filter((v) => v.title.toLowerCase().includes(search.toLowerCase()));
  const uptime = liveSince ? Math.floor((Date.now() - liveSince) / 1000) : 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logoUrl} className="brand-mark" alt="Looprix logo" />
          <div className="logo">Looprix<small>v{APP_VERSION} • Windows • Tauri</small></div>
        </div>
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
          <span className="connected">● {mode === "oauth" ? (oauthConnected ? `OAuth — connected${oauthChannel ? ` (${oauthChannel})` : ""}` : "OAuth — not connected yet") : keySaved ? "Stream key saved" : "Manual — key not saved"}</span>
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
                    {overlayLogo && <img src={logoUrl} className="logo-wm logo-wm-img" alt="Looprix" />}
                  </div>
                  <p className="muted">
                    {live ? `Live for ${Math.floor(uptime / 60)}:${String(uptime % 60).padStart(2, "0")} • ${titleFromTemplate(preset, videos[0]?.title ?? "")}` : "Not live"}
                  </p>
                  <button className="btn-go" onClick={() => void handleGoLive()} disabled={live}>▶ GO LIVE</button>{" "}
                  <button className="btn-stop" onClick={() => void handleStop()} disabled={!live}>■ Stop</button>{" "}
                  <label style={{ marginLeft: 12 }}>Smart Loop <button className={`toggle ${loopMode !== "one" ? "on" : ""}`} aria-label="Smart Loop" onClick={() => setLoopMode(loopMode === "all" ? "one" : "all")}> </button></label>{" "}
                  <label>Auto-Reconnect <button className={`toggle ${autoReconnect ? "on" : ""}`} aria-label="Auto-Reconnect" onClick={() => setAutoReconnect(!autoReconnect)}> </button></label>
                  <p className="muted small">Gapless Loop {gapless ? "ON — no black frame between videos" : "OFF"} • Auto-reconnect within ~3s when ON.</p>
                </div>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Playlist — {videos.length} videos</h3>
                  {videos.length === 0 && <p className="muted">Kono video add kora hoy nai — + Add Videos chap diye mp4/mkv file add koro.</p>}
                  {videos.map((v, i) => (
                    <div key={v.id}>{i + 1}. {v.title} — {fmtDuration(v.durationSec)}{v.exists === false ? ' — file pawa jay nai' : ''}</div>
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
                  <p className={doctor.ffmpeg === false ? "bad" : "ok"}>✓ FFmpeg {ffmpegChecked ? (ffmpegVersion ? `OK — ${ffmpegVersion}` : "— not found") : "— checking..."}</p>
                  <p><strong className={doctor.ready ? "ok" : "bad"}>{doctor.ready ? "Ready to Go Live" : "Not ready — see reasons below"}</strong></p>
                  {doctor.reasons.map((r) => <p key={r} className="bad small">{r}</p>)}
                </div>
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>✓ Stream Health: {live ? "Live" : "Not streaming"}</h3>
                  {live ? (
                    <>
                      <p>Target bitrate: {preset.videoBitrateKbps} kbps (target)</p>
                      <p>FFmpeg running: {streamRunning === null ? "checking..." : streamRunning ? "Yes" : "No"}</p>
                      <p>Reconnects: {reconnects}</p>
                      <p>Live for {Math.floor(uptime / 60)}:{String(uptime % 60).padStart(2, "0")}</p>
                    </>
                  ) : (
                    <>
                      <p>Bitrate: —</p>
                      <p>Dropped frames: —</p>
                      <p>CPU: —</p>
                    </>
                  )}
                </div>
                {mode === "manual" && (
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>Manual Stream Key</h3>
                    <label>Stream URL (RTMPS only)</label>
                    <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} />
                    <label>Stream Key (never shown in full)</label>
                    <input type="password" value={streamKey} placeholder={keySaved ? `Saved — ****${savedKeyTail}` : "Paste from YouTube Studio"} onChange={(e) => setStreamKey(e.target.value)} />
                    <p className="muted small">{keySaved ? `Saved securely (****${savedKeyTail}).` : "Key ta sudhu OS credential store e save hobe."}</p>
                    <button className="btn-primary" onClick={() => void handleSaveKey()}>Save Key Securely</button>
                    <p className="muted small">URL validation: {validateStreamUrl(streamUrl).ok ? "OK" : validateStreamUrl(streamUrl).reason}</p>
                  </div>
                )}
                {mode === "oauth" && (
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>Connect YouTube (OAuth)</h3>
                    {oauthConnected ? (
                      <p className="ok">Connected{oauthChannel ? ` — ${oauthChannel}` : ""}. GO LIVE chaple broadcast auto toiri hobe (unlisted).</p>
                    ) : (
                      <p className="muted">Google sign-in kore channel connect koro. Age Settings &gt; YouTube API te Client ID / Secret bosate hobe.</p>
                    )}
                    <button className="btn-primary" onClick={() => { setPage("settings"); setOauthGuide(true); }}>{oauthConnected ? "YouTube API Settings" : "Connect with Google"}</button>
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
            <p className="muted">Video file add koro — mp4 / mkv / mov / webm / avi / m4v. File gulo sudhu tomar PC te thake, kothao upload hoy na.</p>
            <button className="btn-primary" onClick={() => void handleAddVideos()}>+ Add Videos</button>{" "}
            <button className="btn-ghost" onClick={() => { setVideos([]); pushLog("Playlist khali kora holo."); }} disabled={videos.length === 0}>Clear playlist</button>{" "}
            <input placeholder="Search videos, title, filename..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {videos.length === 0 && <p className="muted">Kono video add kora hoy nai — + Add Videos chap diye mp4/mkv file add koro.</p>}
            <table><thead><tr><th>Playlist</th><th>Duration</th><th>Size</th><th></th></tr></thead>
              <tbody>{filteredVideos.map((v) => (
                <tr key={v.id}><td>{v.title}{v.exists === false ? ' — file pawa jay nai' : ''}<br /><span className="muted small">MP4 • 1080p • {v.codec ?? "—"}</span></td><td>{fmtDuration(v.durationSec)}</td><td>{fmtSize(v.sizeBytes)}</td><td><button className="mini-btn danger" onClick={() => handleRemoveVideo(v.id)}>Remove</button></td></tr>
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
                <div key={p.id} className={`preset-card ${presetId === p.id ? "sel" : ""}`}>
                  <button className="preset-pick" onClick={() => setPresetId(p.id)}>
                    <strong>{p.name}</strong>{p.builtin ? "" : " • Custom"}<br />
                    <span className="muted small">{p.resolution} • {p.videoBitrateKbps} kbps • {p.description}</span>
                  </button>
                  {!p.builtin && (
                    <div>
                      {renamingPresetId === p.id ? (
                        <>
                          <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Notun nam" />
                          <button className="mini-btn" onClick={() => {
                            const next = [...customPresets];
                            const found = next.find((x) => x.id === p.id);
                            if (found && renameValue.trim()) {
                              found.name = renameValue.trim();
                              const v = validateCustomPreset(found);
                              if (!v.ok) { pushLog(v.reason ?? "Preset thik nai."); return; }
                              setCustomPresets(next);
                              pushLog(`Preset rename holo: ${found.name}.`);
                            }
                            setRenamingPresetId(null);
                          }}>Save</button>{" "}
                          <button className="mini-btn" onClick={() => setRenamingPresetId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="mini-btn" onClick={() => { setRenamingPresetId(p.id); setRenameValue(p.name); }}>Rename</button>{" "}
                          <button className="mini-btn danger" onClick={() => {
                            setCustomPresets(customPresets.filter((x) => x.id !== p.id));
                            if (presetId === p.id) setPresetId("waz");
                            pushLog(`Preset delete holo: ${p.name}.`);
                          }}>Delete</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <button className="preset-card" onClick={() => {
                const name = `My Preset ${customPresets.length + 1}`;
                const candidate: Preset = { ...preset, id: `custom-${Date.now()}`, name, builtin: false };
                const v = validateCustomPreset(candidate);
                if (!v.ok) { pushLog(v.reason ?? "Preset thik nai."); return; }
                setCustomPresets([...customPresets, candidate]);
                setPresetId(candidate.id);
              }}>+ Add Custom Preset</button>
            </div>
            <h3>Quality</h3>
            {QUALITY_CHIPS.map((q) => (
              <button key={q.id} className={`chip ${quality === q.id ? "sel" : ""}`} onClick={() => setQuality(q.id as QualityChipId)}>{q.label}</button>
            ))}
            <p className="muted">Selected: <strong>{preset.name}</strong> — {preset.resolution} • {preset.fps}fps • {preset.videoBitrateKbps} kbps • Audio {preset.audioBitrateKbps} kbps • Loop {preset.loop} • Latency {preset.latency}</p>
            <button className="btn-primary" onClick={() => pushLog(`Preset applied: ${preset.name}`)}>Apply Preset</button>
          </div>
        )}

        {page === "schedule" && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Schedule</h2>
            {schedules.length === 0 && <p className="muted">Kono schedule nai — niche form diye notun schedule add koro.</p>}
            {schedules.map((s) => (
              <p key={s.id}>{WEEKDAYS[s.weekday]} {s.startTime} – {s.endTime} • {s.playlistName} • Auto Start {s.autoStart ? "ON" : "OFF"} • Auto Stop {s.autoStop ? "ON" : "OFF"}{" "}
                <button className="mini-btn danger" onClick={() => { setSchedules(schedules.filter((x) => x.id !== s.id)); pushLog(`Schedule delete holo: ${s.playlistName}.`); }}>Delete</button>
              </p>
            ))}
            <h3>Add Schedule</h3>
            <div className="form-row">
              <div>
                <label>Weekday</label>
                <select value={schedWeekday} onChange={(e) => setSchedWeekday(Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label>Start time</label>
                <input type="time" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} />
              </div>
              <div>
                <label>End time</label>
                <input type="time" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} />
              </div>
            </div>
            <label><input type="checkbox" checked={schedAutoStart} onChange={(e) => setSchedAutoStart(e.target.checked)} style={{ width: "auto" }} /> Auto Start</label>{" "}
            <label><input type="checkbox" checked={schedAutoStop} onChange={(e) => setSchedAutoStop(e.target.checked)} style={{ width: "auto" }} /> Auto Stop</label>
            <p className="muted small">Playlist: My Playlist ({videos.length} videos) • Preset: {preset.name}. Somoy hole ar Stream Doctor green thakle stream nije theke start hobe.</p>
            <button className="btn-primary" onClick={handleAddSchedule}>+ Add Schedule</button>
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
              <h2 style={{ marginTop: 0 }}>YouTube API (OAuth)</h2>
              <p className="muted">Google Client ID ar Client Secret sudhu OS credential store e save hoy — kokhono file, localStorage ba log e thake na.</p>
              <label>Google Client ID {ytClientIdSaved ? "(saved)" : ""}</label>
              <input value={ytClientId} placeholder={ytClientIdSaved ? "Saved — abar bosale replace hobe" : "Paste Client ID"} onChange={(e) => setYtClientId(e.target.value)} />
              <label>Google Client Secret {ytClientIdSaved ? "(saved)" : ""}</label>
              <input type="password" value={ytClientSecret} placeholder="Paste Client Secret" onChange={(e) => setYtClientSecret(e.target.value)} />
              <button className="btn-primary" onClick={() => void handleSaveYouTubeApi()}>Save Client ID / Secret</button>
              {oauthGuide && (
                <p className="muted small">
                  Google Cloud Console (console.cloud.google.com) e giye notun project banaw, tarpor APIs &amp; Services &gt; Credentials &gt; Create Credentials &gt; OAuth client ID &gt; Application type: Desktop app. YouTube Data API v3 enable korte hobe. Client ID ar Client Secret ekhane bosao, tarpor Connect with Google chap dio.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="btn-primary" onClick={() => void handleConnectGoogle()} disabled={oauthBusy}>Connect with Google</button>
              </div>
              <label style={{ marginTop: 12 }}>Paste the code from Google</label>
              <input value={oauthCode} placeholder="Google je code ta diyeche, seta ekhane paste koro" onChange={(e) => setOauthCode(e.target.value)} />
              <button className="btn-primary" onClick={() => void handleCompleteOAuth()} disabled={oauthBusy || !oauthCode.trim()}>Complete sign-in</button>
              {oauthConnected && <p className="ok">Connected{oauthChannel ? ` — ${oauthChannel}` : ""}.</p>}
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>About</h2>
              <img src={logoUrl} className="about-logo" alt="Looprix logo" />
              <p><strong>Looprix v{APP_VERSION}</strong></p>
              <p>Developed by {DEVELOPER_NAME} — Full-Stack &amp; Web3 Developer</p>
              <p><a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_GITHUB}</a></p>
              <button className="btn-primary" onClick={() => void openExternal(DEVELOPER_GITHUB)}>Open GitHub Profile</button>
              <p className="muted small">Tauri v2 + React + Rust + FFmpeg • Windows 10/11 64-bit</p>
              <p className="muted small">MIT License</p>
            </div>
          </>
        )}

        <p className="footer-note">Looprix v{APP_VERSION} — Developed by <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_NAME}</a> • <a href={DEVELOPER_GITHUB} onClick={(e) => { e.preventDefault(); void openExternal(DEVELOPER_GITHUB); }}>{DEVELOPER_GITHUB}</a></p>
      </main>
    </div>
  );
}
