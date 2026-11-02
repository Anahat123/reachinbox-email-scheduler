import { describe, expect, it } from 'vitest';
import { hourWindow, HOUR_MS } from '../src/lib/time';
import { normalizeRecipients, planSendTimes } from '../src/services/scheduler.service';

const START = Date.UTC(2026, 10, 2, 10, 0, 0); // 10:00:00 UTC

describe('planSendTimes', () => {
  it('spaces sends by the delay', () => {
    expect(planSendTimes(3, START, 2000, 100)).toEqual([START, START + 2000, START + 4000]);
  });

  it('never puts more than the hourly limit in one clock hour and rolls the rest forward', () => {
    const times = planSendTimes(1000, START, 2000, 200);
    const perHour = new Map<string, number>();
    for (const t of times) perHour.set(hourWindow(t), (perHour.get(hourWindow(t)) ?? 0) + 1);

    expect(times).toHaveLength(1000);
    expect([...perHour.values()]).toEqual([200, 200, 200, 200, 200]);
    // Each new hour starts exactly on the hour boundary.
    expect(times[200]).toBe(START + HOUR_MS);
  });

  it('keeps the original order (times never go backwards)', () => {
    const times = planSendTimes(500, START + 59 * 60_000, 1000, 50);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('lets the delay win when delay x limit is longer than an hour', () => {
    const times = planSendTimes(3, START, 30 * 60_000, 100);
    expect(times).toEqual([START, START + 30 * 60_000, START + 60 * 60_000]);
  });
});

describe('normalizeRecipients', () => {
  it('trims, lowercases and de-duplicates', () => {
    expect(normalizeRecipients([' A@x.com', 'a@x.com', 'b@x.com ', ''])).toEqual(['a@x.com', 'b@x.com']);
  });
});
