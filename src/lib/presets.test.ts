import { describe, expect, it } from "vitest";
import { BUILTIN_PRESETS, applyPreset, getPreset, titleFromTemplate, validateCustomPreset } from "./presets";

describe("presets", () => {
  it("has all 8 built-in presets, none excluded", () => {
    expect(BUILTIN_PRESETS.map((p) => p.id)).toEqual([
      "lofi", "waz", "quran", "music", "nature", "education", "news", "podcast",
    ]);
  });
  it("Waz is 1080p 6000 kbps", () => {
    const waz = getPreset("waz");
    expect(waz?.resolution).toBe("1920x1080");
    expect(waz?.videoBitrateKbps).toBe(6000);
    expect(waz?.fps).toBe(30);
  });
  it("Lofi is 720p 2500 kbps", () => {
    expect(getPreset("lofi")?.videoBitrateKbps).toBe(2500);
  });
  it("applyPreset with Data Saver overrides resolution/bitrate", () => {
    const waz = getPreset("waz")!;
    const applied = applyPreset(waz, "data-saver");
    expect(applied.resolution).toBe("1280x720");
    expect(applied.videoBitrateKbps).toBe(2500);
    expect(applied.name).toBe("Waz");
  });
  it("applyPreset with Auto keeps the preset as-is", () => {
    const waz = getPreset("waz")!;
    expect(applyPreset(waz, "auto")).toEqual(waz);
  });
  it("title template replaces [Name]", () => {
    expect(titleFromTemplate(getPreset("waz")!, "Amar Waz")).toBe("Waz • Replay • Amar Waz");
  });
  it("custom preset validation rejects bad resolution and bitrate", () => {
    expect(validateCustomPreset({ name: "X", resolution: "bad", videoBitrateKbps: 6000 }).ok).toBe(false);
    expect(validateCustomPreset({ name: "X", resolution: "1920x1080", videoBitrateKbps: 10 }).ok).toBe(false);
    expect(validateCustomPreset({ name: "Amar", resolution: "1920x1080", videoBitrateKbps: 6000 }).ok).toBe(true);
  });
});
