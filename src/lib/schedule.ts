import type { ScheduleEntry } from "./types";

export function parseTimeToMinutes(t: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function validateSchedule(e: Partial<ScheduleEntry>): { ok: boolean; reason?: string } {
  if (e.weekday === undefined || e.weekday < 0 || e.weekday > 6) return { ok: false, reason: "Weekday 0 (Sun) – 6 (Sat) er moddhe hote hobe." };
  const s = e.startTime ? parseTimeToMinutes(e.startTime) : null;
  const en = e.endTime ? parseTimeToMinutes(e.endTime) : null;
  if (s === null) return { ok: false, reason: "Start time HH:MM format e hote hobe, jemon 20:00." };
  if (en === null) return { ok: false, reason: "End time HH:MM format e hote hobe, jemon 23:00." };
  if (en <= s) return { ok: false, reason: "End time start time er pore hote hobe." };
  if (!e.playlistName || !e.playlistName.trim()) return { ok: false, reason: "Playlist er nam dite hobe." };
  return { ok: true };
}

/** Is this entry due right now (same weekday, now between start and end)? */
export function isDueNow(entry: ScheduleEntry, now: Date = new Date()): boolean {
  if (!entry.enabled || !entry.autoStart) return false;
  if (entry.weekday !== now.getDay()) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = parseTimeToMinutes(entry.startTime);
  const e = parseTimeToMinutes(entry.endTime);
  if (s === null || e === null) return false;
  return mins >= s && mins < e;
}

/** Next occurrence of this entry, as a Date (within the next 7 days). */
export function nextOccurrence(entry: ScheduleEntry, now: Date = new Date()): Date | null {
  const s = parseTimeToMinutes(entry.startTime);
  if (s === null) return null;
  for (let d = 0; d < 8; d++) {
    const cand = new Date(now);
    cand.setDate(now.getDate() + d);
    if (cand.getDay() !== entry.weekday) continue;
    cand.setHours(Math.floor(s / 60), s % 60, 0, 0);
    if (cand.getTime() > now.getTime()) return cand;
  }
  return null;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
