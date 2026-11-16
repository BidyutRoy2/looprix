import type { VideoItem } from "./types";

/** Result of the Rust `probe_video` command (ffprobe sidecar). */
export interface ProbeResult {
  path: string;
  exists: boolean;
  durationSec: number;
  sizeBytes: number;
  codec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
}

/** File name without the folder and without the extension, e.g. "Waz Lecture". */
export function fileNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Pure fallback used when ffprobe is missing or the probe command is
 * unavailable (dev browser): file is assumed to exist (the picker just
 * returned it), size/duration unknown until a real probe runs.
 */
export function fallbackProbe(path: string, sizeBytes = 0, exists = true): ProbeResult {
  return { path, exists, durationSec: 0, sizeBytes };
}

export function videoItemFromProbe(p: ProbeResult): VideoItem {
  return {
    id: `v${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path: p.path,
    title: fileNameFromPath(p.path),
    durationSec: Math.round(p.durationSec),
    sizeBytes: p.sizeBytes,
    codec: p.codec,
    audioCodec: p.audioCodec,
    width: p.width,
    height: p.height,
    exists: p.exists,
  };
}

/** Probe one real file via the Rust `probe_video` command (ffprobe sidecar). */
export async function probeVideoFile(path: string): Promise<ProbeResult> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<ProbeResult>("probe_video", { path });
    return r;
  } catch {
    return fallbackProbe(path);
  }
}
