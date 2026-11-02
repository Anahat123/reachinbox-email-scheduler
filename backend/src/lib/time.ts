const HOUR_MS = 60 * 60 * 1000;

/** UTC clock-hour bucket, e.g. "2026110214". Used as the rate-limit window key. */
export function hourWindow(ts: number): string {
  return new Date(ts).toISOString().slice(0, 13).replace(/[-T]/g, '');
}

export function startOfNextHour(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS + HOUR_MS;
}

export { HOUR_MS };
