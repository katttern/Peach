/** datetime-local value (browser time zone) -> "YYYY-MM-DDTHH:MM:SSZ". */
export function localInputToUtc(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ISO 8601 ("...Z" or "...+02:00") -> datetime-local value in the browser time zone. */
export function utcToLocalInput(value: string): string {
  return dateToLocalInput(new Date(value));
}

/** Date -> datetime-local value ("YYYY-MM-DDTHH:MM") in the browser time zone. */
export function dateToLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The next full hour in local time (13:00 at 12:05, 13:00 at 12:00:01). */
export function nextFullHour(now = new Date()): Date {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * New end for a changed start: kept as is while still after the start,
 * otherwise moved to keep the previous duration (1 h if that was not positive).
 * All values are datetime-local strings.
 */
export function shiftEnd(
  previousStart: string,
  previousEnd: string,
  nextStart: string,
): string {
  const start = new Date(nextStart).getTime();
  const end = new Date(previousEnd).getTime();
  if (Number.isNaN(start) || (!Number.isNaN(end) && end > start)) {
    return previousEnd;
  }
  const duration = end - new Date(previousStart).getTime();
  const keep = Number.isFinite(duration) && duration > 0 ? duration : HOUR_MS;
  return dateToLocalInput(new Date(start + keep));
}
