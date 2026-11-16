export type ConnectMode = "oauth" | "manual";
export type LoopMode = "one" | "all" | "shuffle";
export type Privacy = "public" | "unlisted" | "private";
export type Latency = "normal" | "low" | "ultra-low";

export interface VideoItem {
  id: string;
  path: string;
  title: string;
  durationSec: number;
  sizeBytes: number;
  codec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  /** Set at add-time by probing the file; false = file no longer on disk. */
  exists?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  builtin: boolean;
  resolution: string;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  normalizeAudio: boolean;
  overlayBadge: boolean;
  overlayLogo: boolean;
  loop: LoopMode;
  latency: Latency;
  titleTemplate: string;
  description: string;
}

export interface ScheduleEntry {
  id: string;
  weekday: number; // 0=Sun .. 6=Sat
  startTime: string; // "20:00"
  endTime: string; // "23:00"
  playlistName: string;
  presetId: string;
  autoStart: boolean;
  autoStop: boolean;
  enabled: boolean;
}

export interface StreamHealth {
  status: "excellent" | "good" | "poor" | "offline";
  bitrateKbps: number;
  droppedFrames: number;
  cpuPercent: number;
  uptimeSec: number;
}

export interface DoctorResult {
  video: boolean;
  audio: boolean;
  internet: boolean;
  streamKey: boolean;
  /** FFmpeg sidecar check: true = found, false = not found, undefined = not checked yet. */
  ffmpeg?: boolean;
  ffmpegVersion?: string;
  ready: boolean;
  reasons: string[];
}

export const DEVELOPER_NAME = "Bidyut Roy";
export const DEVELOPER_GITHUB = "https://github.com/BidyutRoy2";
export const APP_VERSION = "0.1.1";
export const DEFAULT_RTMPS_URL = "rtmps://a.rtmps.youtube.com/live2";
export const DEFAULT_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";
