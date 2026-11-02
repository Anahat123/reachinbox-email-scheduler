import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redis } from '../src/lib/redis';
import { acquireSendSlot, claimLimitNotification, nextDeferralRank, releaseSendSlot } from '../src/services/rateLimiter';

// MAX_EMAILS_PER_HOUR_PER_SENDER is 3 in vitest.config.ts
const NOW = Date.UTC(2026, 10, 2, 10, 30);

beforeEach(() => redis.flushdb());
afterAll(() => redis.quit());

describe('acquireSendSlot', () => {
  it('allows up to the sender limit, then refuses with scope "sender"', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await acquireSendSlot('s1', 'c1', 100, NOW));

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]).toMatchObject({ allowed: false, scope: 'sender', limit: 3 });
  });

  it('enforces the campaign limit separately from the sender limit', async () => {
    expect((await acquireSendSlot('s1', 'c1', 1, NOW)).allowed).toBe(true);
    expect(await acquireSendSlot('s1', 'c1', 1, NOW)).toMatchObject({ allowed: false, scope: 'campaign' });
    // Another campaign on the same sender still has room.
    expect((await acquireSendSlot('s1', 'c2', 1, NOW)).allowed).toBe(true);
  });

  it('is atomic: 20 concurrent callers get exactly the limit', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => acquireSendSlot('s1', 'c1', 100, NOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it('starts fresh in the next clock hour', async () => {
    for (let i = 0; i < 3; i++) await acquireSendSlot('s1', 'c1', 100, NOW);
    expect((await acquireSendSlot('s1', 'c1', 100, NOW)).allowed).toBe(false);
    expect((await acquireSendSlot('s1', 'c1', 100, NOW + 60 * 60_000)).allowed).toBe(true);
  });

  it('gives a slot back on release', async () => {
    let last;
    for (let i = 0; i < 3; i++) last = await acquireSendSlot('s1', 'c1', 100, NOW);
    await releaseSendSlot('s1', 'c1', last!.window);
    expect((await acquireSendSlot('s1', 'c1', 100, NOW)).allowed).toBe(true);
  });
});

describe('deferral helpers', () => {
  it('hands out increasing ranks per campaign and hour', async () => {
    expect(await nextDeferralRank('c1', '2026110211')).toBe(0);
    expect(await nextDeferralRank('c1', '2026110211')).toBe(1);
    expect(await nextDeferralRank('c2', '2026110211')).toBe(0);
  });

  it('allows only one Slack alert per user, sender and hour', async () => {
    expect(await claimLimitNotification('u1', 's1', '2026110210')).toBe(true);
    expect(await claimLimitNotification('u1', 's1', '2026110210')).toBe(false);
    expect(await claimLimitNotification('u1', 's1', '2026110211')).toBe(true);
  });
});
