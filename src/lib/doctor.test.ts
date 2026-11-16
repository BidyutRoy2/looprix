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
});
