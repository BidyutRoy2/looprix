import type { LoopMode, Preset, VideoItem } from "./types";
import { redactLogLine } from "./security";

export interface FfmpegPlan {
  args: string[];
  /** Safe-to-log command line: stream key redacted. */
  safeCommand: string;
  mode: "encode" | "copy";
  loopMode: LoopMode;
}

export function isCopyEligible(v: VideoItem): boolean {
  return v.codec === "h264" && v.audioCodec === "aac";
}

/** GOP size for a 2-second keyframe interval at the preset fps. */
export function gopSize(fps: number): number {
  return Math.max(30, Math.round(fps * 2));
}

/** Build the concat-demuxer playlist file content (never written with a key in it). */
export function buildConcatFile(videos: VideoItem[]): string {
  return videos.map((v) => `file '${v.path.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

function rtmpDestination(streamUrl: string, streamKey: string): string {
  const base = streamUrl.replace(/\/+$/, "");
  return `${base}/${streamKey}`;
}

/**
 * Core FFmpeg command.
 * Encode:  ffmpeg -re -stream_loop -1 -i input -c:v libx264 -preset veryfast -b:v 6000k -maxrate 6000k -bufsize 12000k -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -f flv rtmps://.../KEY
 * Copy (already H.264+AAC): same, but -c copy and no re-encode flags.
 * Playlist: -f concat -safe 0 -i playlist.txt instead of a single -i.
 */
export function buildFfmpegArgs(opts: {
  videos: VideoItem[];
  preset: Preset;
  streamUrl: string;
  streamKey: string;
  loopMode: LoopMode;
  playlistFile?: string;
}): FfmpegPlan {
  const { videos, preset, streamUrl, streamKey, loopMode } = opts;
  if (videos.length === 0) throw new Error("Playlist khali — age ekta video add koro.");
  if (!streamKey.trim()) throw new Error("Stream key khali.");
  const single = videos.length === 1 && videos[0] !== undefined;
  const copyMode = single && isCopyEligible(videos[0] as VideoItem);
  const dest = rtmpDestination(streamUrl, streamKey);
  const gop = gopSize(preset.fps);
  const args: string[] = ["-re"];
  if (loopMode === "one" && single) args.push("-stream_loop", "-1");
  if (opts.playlistFile) {
    args.push("-stream_loop", "-1", "-f", "concat", "-safe", "0", "-i", opts.playlistFile);
  } else {
    args.push("-i", videos[0]?.path ?? "");
  }
  if (copyMode) {
    args.push("-c", "copy");
  } else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast",
      "-b:v", `${preset.videoBitrateKbps}k`,
      "-maxrate", `${preset.videoBitrateKbps}k`,
      "-bufsize", `${preset.videoBitrateKbps * 2}k`,
      "-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", `${preset.audioBitrateKbps}k`, "-ar", "44100",
    );
  }
  args.push("-f", "flv", dest);
  const safeCommand = redactLogLine(`ffmpeg ${args.join(" ")}`);
  return { args, safeCommand, mode: copyMode ? "copy" : "encode", loopMode };
}

export function shuffleOrder<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}
