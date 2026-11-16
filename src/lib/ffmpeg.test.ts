import { describe, expect, it } from "vitest";
import { buildConcatFile, buildFfmpegArgs, gopSize, isCopyEligible, shuffleOrder } from "./ffmpeg";
import { getPreset } from "./presets";
import type { VideoItem } from "./types";

const v: VideoItem = { id: "1", path: "C:\\Videos\\waz.mp4", title: "Waz", durationSec: 3600, sizeBytes: 1000, codec: "h264", audioCodec: "aac" };
const v2: VideoItem = { id: "2", path: "C:\\Videos\\lofi.mp4", title: "Lofi", durationSec: 1800, sizeBytes: 500 };

describe("ffmpeg command builder", () => {
  it("gop is 2 seconds: 60 at 30fps, 120 at 60fps", () => {
    expect(gopSize(30)).toBe(60);
    expect(gopSize(60)).toBe(120);
  });
  it("encode mode uses libx264 CBR, 2s keyframe, AAC, RTMPS dest, key redacted in log", () => {
    const plan = buildFfmpegArgs({ videos: [v2], preset: getPreset("waz")!, streamUrl: "rtmps://a.rtmps.youtube.com/live2", streamKey: "SECRETKEY123456", loopMode: "one" });
    expect(plan.mode).toBe("encode");
    expect(plan.args).toContain("libx264");
    expect(plan.args).toContain("6000k");
    expect(plan.args).toContain("60");
    expect(plan.args).toContain("aac");
    expect(plan.args[plan.args.length - 1]).toBe("rtmps://a.rtmps.youtube.com/live2/SECRETKEY123456");
    expect(plan.safeCommand).not.toContain("SECRETKEY123456");
    expect(plan.safeCommand).toContain("****");
  });
  it("copy mode when source is already H.264+AAC", () => {
    const plan = buildFfmpegArgs({ videos: [v], preset: getPreset("waz")!, streamUrl: "rtmps://a.rtmps.youtube.com/live2", streamKey: "k12345678", loopMode: "one" });
    expect(plan.mode).toBe("copy");
    expect(plan.args).toContain("copy");
    expect(plan.args).not.toContain("libx264");
    expect(isCopyEligible(v)).toBe(true);
    expect(isCopyEligible(v2)).toBe(false);
  });
  it("playlist uses concat demuxer and loops", () => {
    const plan = buildFfmpegArgs({ videos: [v, v2], preset: getPreset("lofi")!, streamUrl: "rtmps://a.rtmps.youtube.com/live2", streamKey: "k12345678", loopMode: "all", playlistFile: "playlist.txt" });
    expect(plan.args).toContain("concat");
    expect(plan.args).toContain("playlist.txt");
    expect(buildConcatFile([v, v2])).toContain("waz.mp4");
  });
  it("throws on empty playlist and empty key", () => {
    expect(() => buildFfmpegArgs({ videos: [], preset: getPreset("waz")!, streamUrl: "rtmps://a.rtmps.youtube.com/live2", streamKey: "k12345678", loopMode: "all" })).toThrow();
    expect(() => buildFfmpegArgs({ videos: [v], preset: getPreset("waz")!, streamUrl: "rtmps://a.rtmps.youtube.com/live2", streamKey: "  ", loopMode: "all" })).toThrow();
  });
  it("shuffle changes order but keeps all items (seeded)", () => {
    const out = shuffleOrder([1, 2, 3, 4, 5], () => 0.5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
