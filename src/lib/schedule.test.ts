import { describe, expect, it } from "vitest";
import { isDueNow, nextOccurrence, parseTimeToMinutes, validateSchedule } from "./schedule";
import type { ScheduleEntry } from "./types";

const base: ScheduleEntry = { id: "1", weekday: 5, startTime: "20:00", endTime: "23:00", playlistName: "Waz Playlist", presetId: "waz", autoStart: true, autoStop: true, enabled: true };

describe("schedule", () => {
  it("parses HH:MM", () => {
    expect(parseTimeToMinutes("20:00")).toBe(1200);
    expect(parseTimeToMinutes("25:00")).toBe(null);
    expect(parseTimeToMinutes("8pm")).toBe(null);
  });
  it("rejects end before start and bad weekday", () => {
    expect(validateSchedule({ ...base, endTime: "19:00" }).ok).toBe(false);
    expect(validateSchedule({ ...base, weekday: 9 }).ok).toBe(false);
    expect(validateSchedule(base).ok).toBe(true);
  });
  it("rejects an empty playlist name (schedule form must supply one)", () => {
    expect(validateSchedule({ ...base, playlistName: "   " }).ok).toBe(false);
    expect(validateSchedule({ ...base, playlistName: "" }).ok).toBe(false);
  });
  it("rejects bad times from the form", () => {
    expect(validateSchedule({ ...base, startTime: "8pm" }).ok).toBe(false);
    expect(validateSchedule({ ...base, endTime: "24:00" }).ok).toBe(false);
  });
  it("isDueNow is true on Friday 21:00, false on Saturday", () => {
    // 2026-11-20 is a Friday.
    expect(isDueNow(base, new Date(2026, 10, 20, 21, 0))).toBe(true);
    expect(isDueNow(base, new Date(2026, 10, 21, 21, 0))).toBe(false);
    expect(isDueNow(base, new Date(2026, 10, 20, 19, 0))).toBe(false);
  });
  it("nextOccurrence is the coming Friday 20:00", () => {
    const next = nextOccurrence(base, new Date(2026, 10, 18, 10, 0)); // Wed
    expect(next?.getDay()).toBe(5);
    expect(next?.getHours()).toBe(20);
  });
});
