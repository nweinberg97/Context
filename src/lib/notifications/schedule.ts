/**
 * Time-zone-aware scheduling math for check-ins. Pure functions, no I/O, built on
 * Intl so there is no time-zone library to keep updated.
 */

export interface ReminderPreferences {
  enabled: boolean;
  unsubscribedAt: Date | null;
  pausedUntil: string | null; // YYYY-MM-DD (inclusive)
  preferredLocalTime: string; // HH:MM or HH:MM:SS
  timezone: string;
  days: number[]; // ISO weekday, 1 = Monday
}

/** How long after the scheduled time a check-in is still worth sending. */
export const SEND_WINDOW_MS = 6 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // ISO 1..7
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(instant: Date, tz: string): LocalParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 1,
  };
}

/** The calendar date (YYYY-MM-DD) it currently is in a time zone. */
export function localDateIn(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function offsetMs(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time on a local date to a UTC instant.
 * Times that don't exist (spring-forward gaps) move to the first valid instant after
 * the gap; ambiguous times (fall-back) resolve to the earlier occurrence.
 */
export function zonedTimeToUtc(localDate: string, localTime: string, tz: string): Date {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  const [h, mi] = localTime.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);

  // The offsets in force 12h either side cover any DST transition on that day.
  const offBefore = offsetMs(new Date(naive - 12 * 3600_000), tz);
  const offAfter = offsetMs(new Date(naive + 12 * 3600_000), tz);
  const matches: number[] = [];
  for (const off of new Set([offBefore, offAfter])) {
    const instant = naive - off;
    const p = localParts(new Date(instant), tz);
    if (p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi) matches.push(instant);
  }
  if (matches.length) return new Date(Math.min(...matches));

  // Gap: the wall time doesn't exist. Interpreting it with the pre-transition offset
  // lands the same distance past the gap (02:30 → 03:30), like Temporal's "compatible".
  return new Date(naive - offBefore);
}

export function isoWeekdayOf(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export interface PlannedCheckin {
  localDate: string;
  runAt: Date;
}

/**
 * Decides whether a check-in should exist for "today" in the person's time zone.
 * Returns null when reminders are off, unsubscribed, paused, or today isn't selected.
 */
export function planCheckin(prefs: ReminderPreferences, now: Date): PlannedCheckin | null {
  if (!prefs.enabled || prefs.unsubscribedAt) return null;
  if (!isValidTimeZone(prefs.timezone)) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(prefs.preferredLocalTime)) return null;

  const localDate = localDateIn(now, prefs.timezone);
  if (prefs.pausedUntil && prefs.pausedUntil >= localDate) return null;
  if (!prefs.days.includes(isoWeekdayOf(localDate))) return null;

  const runAt = zonedTimeToUtc(localDate, prefs.preferredLocalTime.slice(0, 5), prefs.timezone);
  return { localDate, runAt };
}

/** A job is sendable once its time has come, until the send window closes. */
export function isSendable(runAt: Date, now: Date): "wait" | "send" | "expired" {
  const delta = now.getTime() - runAt.getTime();
  if (delta < 0) return "wait";
  if (delta > SEND_WINDOW_MS) return "expired";
  return "send";
}
