import type { DoctorResult, VideoItem } from "./types";
import { validateStreamKey, validateStreamUrl, isSafeFilePath } from "./security";

/** Pure pre-flight checks — no network call here; the caller passes the facts it measured. */
export function runStreamDoctor(input: {
  videos: VideoItem[];
  streamKey: string;
  streamUrl: string;
  internetOk: boolean;
}): DoctorResult {
  const reasons: string[] = [];
  const video = input.videos.length > 0 && input.videos.every((v) => isSafeFilePath(v.path));
  if (!video) reasons.push("Video thik nai — ekta mp4/mkv/mov file add koro.");
  const audio = input.videos.length > 0;
  if (!audio) reasons.push("Audio check korte video lagbe.");
  const internet = input.internetOk;
  if (!internet) reasons.push("Internet nai — net check kore abar try koro.");
  const key = validateStreamKey(input.streamKey).ok && validateStreamUrl(input.streamUrl).ok;
  if (!key) {
    const k = validateStreamKey(input.streamKey);
    const u = validateStreamUrl(input.streamUrl);
    reasons.push(k.reason ?? u.reason ?? "Stream key / URL thik nai.");
  }
  return { video, audio, internet, streamKey: key, ready: video && audio && internet && key, reasons };
}
