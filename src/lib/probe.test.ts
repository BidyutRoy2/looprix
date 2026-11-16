import { describe, expect, it } from "vitest";
import { fallbackProbe, fileNameFromPath, videoItemFromProbe } from "./probe";

describe("probe fallback (ffprobe missing)", () => {
  it("fileNameFromPath strips folders and extension", () => {
    expect(fileNameFromPath("C:\\Videos\\Waz Lecture.mp4")).toBe("Waz Lecture");
    expect(fileNameFromPath("/home/user/lofi.mkv")).toBe("lofi");
    expect(fileNameFromPath("noext")).toBe("noext");
  });
  it("fallback keeps size and marks exists, duration 0", () => {
    const p = fallbackProbe("C:\\Videos\\waz.mp4", 123456789, true);
    expect(p.exists).toBe(true);
    expect(p.sizeBytes).toBe(123456789);
    expect(p.durationSec).toBe(0);
    expect(p.codec).toBeUndefined();
  });
  it("missing file fallback reports exists=false", () => {
    const p = fallbackProbe("C:\\Videos\\gone.mp4", 0, false);
    expect(p.exists).toBe(false);
    expect(p.sizeBytes).toBe(0);
  });
  it("videoItemFromProbe uses the real file name as title", () => {
    const item = videoItemFromProbe({
      path: "D:\\Clips\\Mountain Lakes Ambient.mp4",
      exists: true,
      durationSec: 2712.4,
      sizeBytes: 512 * 1024 * 1024,
      codec: "h264",
      audioCodec: "aac",
      width: 1920,
      height: 1080,
    });
    expect(item.title).toBe("Mountain Lakes Ambient");
    expect(item.durationSec).toBe(2712);
    expect(item.codec).toBe("h264");
    expect(item.exists).toBe(true);
  });
});
