const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "12:34" under an hour, "1:05:12" from an hour on. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Whole-minute length: "52 min", "1 h 5 min", "2 h". */
export function formatWorkoutDuration(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Local "HH:MM" of an ISO timestamp, for <input type="time">. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO for local "HH:MM" on the same local calendar day as `anchorIso`. */
export function atTimeOnDay(anchorIso: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(anchorIso);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** An end "HH:MM" on the start's local day, or the next day when it isn't after
 *  the start (compared to the minute) — a workout that ran past midnight. */
export function resolveEndTime(startIso: string, endHhmm: string): string {
  const end = new Date(atTimeOnDay(startIso, endHhmm));
  const start = new Date(startIso);
  start.setSeconds(0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end.toISOString();
}

/** Best-guess finish for a timer left running: when the lift's session
 *  auto-saved (if after the start), else an hour after the start — never after now. */
export function guessFinishTime(startIso: string, sessionSavedAt: string | undefined, nowIso: string): string {
  const start = Date.parse(startIso);
  const saved = sessionSavedAt ? Date.parse(sessionSavedAt) : Number.NaN;
  const guess = Number.isFinite(saved) && saved > start ? saved : start + HOUR;
  return new Date(Math.min(guess, Date.parse(nowIso))).toISOString();
}

/** A timer left on by mistake: running for more than 3 hours. */
export function isLeftRunning(startIso: string, nowIso: string): boolean {
  return Date.parse(nowIso) - Date.parse(startIso) > 3 * HOUR;
}
