import { describe, expect, it } from "vitest";
import { runStreamDoctor } from "./doctor";
import type { VideoItem } from "./types";

const v: VideoItem = { id: "1", path: "C:\\Videos\\waz.mp4", title: "Waz", durationSec: 100, sizeBytes: 1 };

describe("stream doctor", () => {
  it("ready when everything is green", () => {
    const r = runStreamDoctor({ videos: [v], streamKey: "abcd1234efgh5678", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: true });
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it("blocks Go Live with plain reasons when something is red", () => {
    const r = runStreamDoctor({ videos: [], streamKey: "", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: false });
    expect(r.ready).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.video).toBe(false);
    expect(r.internet).toBe(false);
  });
  it("plain RTMP fails the key check", () => {
    const r = runStreamDoctor({ videos: [v], streamKey: "abcd1234efgh5678", streamUrl: "rtmp://a.rtmp.youtube.com/live2", internetOk: true });
    expect(r.ready).toBe(false);
  });
  it("missing file fails the video check and names the file", () => {
    const gone: VideoItem = { ...v, id: "2", title: "Gone Video", exists: false };
    const r = runStreamDoctor({ videos: [gone], streamKey: "abcd1234efgh5678", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: true });
    expect(r.video).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toContain("Gone Video");
  });
  it("ffmpeg not found is reported and blocks ready", () => {
    const r = runStreamDoctor({ videos: [v], streamKey: "abcd1234efgh5678", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: true, ffmpegOk: false });
    expect(r.ffmpeg).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toContain("FFmpeg");
  });
  it("ffmpeg ok with version line passes the ffmpeg row", () => {
    const r = runStreamDoctor({ videos: [v], streamKey: "abcd1234efgh5678", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: true, ffmpegOk: true, ffmpegVersion: "ffmpeg version 8.0" });
    expect(r.ffmpeg).toBe(true);
    expect(r.ffmpegVersion).toBe("ffmpeg version 8.0");
    expect(r.ready).toBe(true);
  });
  it("oauth connected counts as a key", () => {
    const r = runStreamDoctor({ videos: [v], streamKey: "", streamUrl: "rtmps://a.rtmps.youtube.com/live2", internetOk: true, oauthConnected: true });
    expect(r.streamKey).toBe(true);
    expect(r.ready).toBe(true);
  });
});
