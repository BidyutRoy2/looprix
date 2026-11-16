import type { Preset } from "./types";

export const BUILTIN_PRESETS: Preset[] = [
  { id: "lofi", name: "Lofi Radio", builtin: true, resolution: "1280x720", fps: 30, videoBitrateKbps: 2500, audioBitrateKbps: 160, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Lofi Radio • 24/7 Replay • [Name]", description: "24/7 lofi — kom bitrate, lomba loop, ganer nam overlay." },
  { id: "waz", name: "Waz", builtin: true, resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000, audioBitrateKbps: 128, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Waz • Replay • [Name]", description: "Waz / lecture — kotha clear, audio normalize on." },
  { id: "quran", name: "Quran Recitation", builtin: true, resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000, audioBitrateKbps: 192, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Quran Recitation • Replay • [Name]", description: "Tilawat — valo audio, surar nam overlay." },
  { id: "music", name: "Music", builtin: true, resolution: "1920x1080", fps: 60, videoBitrateKbps: 8000, audioBitrateKbps: 192, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "shuffle", latency: "low", titleTemplate: "Music • Replay • [Name]", description: "Music / DJ — 60fps, valo color ar audio." },
  { id: "nature", name: "Nature", builtin: true, resolution: "1920x1080", fps: 60, videoBitrateKbps: 8000, audioBitrateKbps: 128, normalizeAudio: false, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Nature • Relax • [Name]", description: "Nature / travel — gapless loop, kono kotha nai." },
  { id: "education", name: "Education", builtin: true, resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000, audioBitrateKbps: 128, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Class • Replay • [Name]", description: "Class / tutorial — text clear rakhar jonno bitrate komano hoy na." },
  { id: "news", name: "News", builtin: true, resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000, audioBitrateKbps: 128, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "News • Replay • [Name]", description: "News / talk — ticker er jonno ready (v1.0)." },
  { id: "podcast", name: "Podcast", builtin: true, resolution: "1920x1080", fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 160, normalizeAudio: true, overlayBadge: true, overlayLogo: true, loop: "all", latency: "low", titleTemplate: "Podcast • Replay • [Name]", description: "Podcast — 2 joner kotha clear." },
];

export const QUALITY_CHIPS = [
  { id: "data-saver", label: "Data Saver", resolution: "1280x720", fps: 30, videoBitrateKbps: 2500 },
  { id: "standard", label: "Standard", resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000 },
  { id: "smooth", label: "Smooth", resolution: "1920x1080", fps: 60, videoBitrateKbps: 9000 },
  { id: "auto", label: "Auto", resolution: "1920x1080", fps: 30, videoBitrateKbps: 6000 },
] as const;

export type QualityChipId = (typeof QUALITY_CHIPS)[number]["id"];

export function getPreset(id: string, custom: Preset[] = []): Preset | undefined {
  return [...BUILTIN_PRESETS, ...custom].find((p) => p.id === id);
}

/** One click: preset + quality chip together decide the final encode settings. */
export function applyPreset(preset: Preset, qualityId: QualityChipId): Preset {
  const q = QUALITY_CHIPS.find((c) => c.id === qualityId);
  if (!q || qualityId === "auto") return { ...preset };
  return { ...preset, resolution: q.resolution, fps: q.fps, videoBitrateKbps: q.videoBitrateKbps };
}

export function validateCustomPreset(p: Partial<Preset>): { ok: boolean; reason?: string } {
  if (!p.name || !p.name.trim()) return { ok: false, reason: "Preset er nam dite hobe." };
  if (!p.resolution || !/^\d+x\d+$/.test(p.resolution)) return { ok: false, reason: "Resolution thik format e hote hobe, jemon 1920x1080." };
  if (!p.videoBitrateKbps || p.videoBitrateKbps < 1000 || p.videoBitrateKbps > 50000) {
    return { ok: false, reason: "Video bitrate 1000–50000 kbps er moddhe hote hobe." };
  }
  return { ok: true };
}

export function titleFromTemplate(preset: Preset, videoTitle: string): string {
  return preset.titleTemplate.replace("[Name]", videoTitle || "Live Stream");
}
