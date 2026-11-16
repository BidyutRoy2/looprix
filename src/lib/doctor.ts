import type { DoctorResult, VideoItem } from "./types";
import { validateStreamKey, validateStreamUrl, isSafeFilePath } from "./security";

/** Pure pre-flight checks — no network call here; the caller passes the facts it measured. */
export function runStreamDoctor(input: {
  videos: VideoItem[];
  streamKey: string;
  streamUrl: string;
  internetOk: boolean;
  /** FFmpeg sidecar check result, when the app has already run it. */
  ffmpegOk?: boolean;
  ffmpegVersion?: string;
  /** OAuth mode with a connected channel counts as having a key. */
  oauthConnected?: boolean;
}): DoctorResult {
  const reasons: string[] = [];
  const missing = input.videos.filter((v) => v.exists === false);
  const video =
    input.videos.length > 0 &&
    missing.length === 0 &&
    input.videos.every((v) => isSafeFilePath(v.path));
  if (!video) {
    if (missing.length > 0) {
      reasons.push(`File ta PC te pawa jay nai: ${missing[0]?.title ?? missing[0]?.path ?? "unknown"} — file ta abar add koro, ba playlist theke soriye dao.`);
    } else {
      reasons.push("Video thik nai — ekta mp4/mkv/mov file add koro.");
    }
  }
  const audio = input.videos.length > 0;
  if (!audio) reasons.push("Audio check korte video lagbe.");
  const internet = input.internetOk;
  if (!internet) reasons.push("Internet nai — net check kore abar try koro.");
  const key = input.oauthConnected === true || (validateStreamKey(input.streamKey).ok && validateStreamUrl(input.streamUrl).ok);
  if (!key) {
    const k = validateStreamKey(input.streamKey);
    const u = validateStreamUrl(input.streamUrl);
    reasons.push(k.reason ?? u.reason ?? "Stream key / URL thik nai.");
  }
  const ffmpeg = input.ffmpegOk;
  if (ffmpeg === false) {
    reasons.push("FFmpeg pawa jay nai — installer er sathe ffmpeg.exe thakte hobe, na hole stream start hobe na.");
  }
  const ready = video && audio && internet && key && ffmpeg !== false;
  return { video, audio, internet, streamKey: key, ffmpeg, ffmpegVersion: input.ffmpegVersion, ready, reasons };
}
