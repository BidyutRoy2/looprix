import { DEFAULT_RTMPS_URL } from "./types";

/** Show only the last 4 characters of a secret, e.g. "****abcd". Never log a full key/token. */
export function redactSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 4) return "****";
  return "****" + secret.slice(-4);
}

/** Redact any stream key / token / RTMPS URL-with-key inside a log line. */
export function redactLogLine(line: string): string {
  let out = line;
  // rtmps://host/live2/<key>  ->  rtmps://host/live2/****
  out = out.replace(/(rtmps?:\/\/[^\s/]+\/live2\/)([^\s"']+)/gi, "$1****");
  // key= / token= / stream_key=
  out = out.replace(/((?:stream[_-]?key|token|access_token|refresh_token)\s*[:=]\s*["']?)([A-Za-z0-9._\-]{6,})/gi, "$1****");
  return out;
}

export function validateStreamKey(key: string): { ok: boolean; reason?: string } {
  const k = key.trim();
  if (!k) return { ok: false, reason: "Stream key khali — YouTube Studio theke key copy kore paste koro." };
  if (k.length < 8) return { ok: false, reason: "Stream key khub choto — thik key paste korecho kina dekho." };
  if (/\s/.test(k)) return { ok: false, reason: "Stream key te space thakte pare na." };
  return { ok: true };
}

export function validateStreamUrl(url: string): { ok: boolean; reason?: string } {
  const u = url.trim();
  if (!u) return { ok: false, reason: "Stream URL khali." };
  // RTMPS only by default — never plain RTMP unless the user explicitly overrides.
  if (u.startsWith("rtmps://a.rtmps.youtube.com/live2")) return { ok: true };
  if (u.startsWith("rtmp://a.rtmp.youtube.com/live2")) {
    return { ok: false, reason: "Plain RTMP noy — RTMPS use koro (rtmps://a.rtmps.youtube.com/live2). Encrypted na hole live pathano hobe na." };
  }
  return { ok: false, reason: "Stream URL ta YouTube er RTMPS URL hote hobe." };
}

export function isSafeFilePath(p: string): boolean {
  const t = p.trim();
  if (!t) return false;
  if (t.includes("\0")) return false;
  return /\.(mp4|mkv|mov|webm|avi|m4v)$/i.test(t);
}

export function defaultStreamUrl(): string {
  return DEFAULT_RTMPS_URL;
}
