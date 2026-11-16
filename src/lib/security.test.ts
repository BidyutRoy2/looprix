import { describe, expect, it } from "vitest";
import { isSafeFilePath, redactLogLine, redactSecret, validateStreamKey, validateStreamUrl } from "./security";

describe("security / secret redaction", () => {
  it("redactSecret shows only last 4 chars", () => {
    expect(redactSecret("abcd1234efgh")).toBe("****efgh");
    expect(redactSecret("")).toBe("");
  });
  it("redactLogLine hides keys in RTMPS URLs and key= fields", () => {
    const line = redactLogLine("ffmpeg -f flv rtmps://a.rtmps.youtube.com/live2/MYSECRETKEY stream_key=MYSECRETKEY");
    expect(line).not.toContain("MYSECRETKEY");
    expect(line).toContain("****");
  });
  it("plain RTMP is rejected, RTMPS accepted", () => {
    expect(validateStreamUrl("rtmps://a.rtmps.youtube.com/live2").ok).toBe(true);
    expect(validateStreamUrl("rtmp://a.rtmp.youtube.com/live2").ok).toBe(false);
    expect(validateStreamUrl("https://evil.example/x").ok).toBe(false);
  });
  it("stream key validation", () => {
    expect(validateStreamKey("").ok).toBe(false);
    expect(validateStreamKey("short").ok).toBe(false);
    expect(validateStreamKey("ab cd123456").ok).toBe(false);
    expect(validateStreamKey("abcd1234efgh5678").ok).toBe(true);
  });
  it("only video extensions are safe paths", () => {
    expect(isSafeFilePath("C:\\a\\b.mp4")).toBe(true);
    expect(isSafeFilePath("C:\\a\\b.exe")).toBe(false);
    expect(isSafeFilePath("")).toBe(false);
  });
});
