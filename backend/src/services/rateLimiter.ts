import type { Result } from 'ioredis';
import { env } from '../config/env';
import { redis } from '../lib/redis';
import { hourWindow } from '../lib/time';

/**
 * Hourly quota check-and-increment, done in one Lua script so it is atomic
 * across any number of worker processes. Two counters per clock hour:
 *   rl:sender:{senderId}:{YYYYMMDDHH}     <= MAX_EMAILS_PER_HOUR_PER_SENDER
 *   rl:campaign:{campaignId}:{YYYYMMDDHH} <= the hourly limit chosen in Compose
 * Both are only incremented when both are under their limit.
 */
const ACQUIRE_LUA = `
local senderCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local campaignCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if senderCount >= tonumber(ARGV[1]) then return {0, 1, senderCount} end
if campaignCount >= tonumber(ARGV[2]) then return {0, 2, campaignCount} end
senderCount = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return {1, 0, senderCount}
`;

const KEY_TTL_SECONDS = 2 * 60 * 60;

redis.defineCommand('rateLimitAcquire', { numberOfKeys: 2, lua: ACQUIRE_LUA });

declare module 'ioredis' {
  interface RedisCommander<Context> {
    rateLimitAcquire(
      senderKey: string,
      campaignKey: string,
      senderLimit: number,
      campaignLimit: number,
      ttl: number,
    ): Result<[number, number, number], Context>;
  }
}

export type LimitScope = 'sender' | 'campaign';

export type AcquireResult =
  | { allowed: true; window: string; senderCount: number; senderLimit: number }
  | { allowed: false; window: string; scope: LimitScope; count: number; limit: number };

const keys = (senderId: string, campaignId: string, window: string) =>
  [`rl:sender:${senderId}:${window}`, `rl:campaign:${campaignId}:${window}`] as const;

export async function acquireSendSlot(
  senderId: string,
  campaignId: string,
  campaignHourlyLimit: number,
  now = Date.now(),
): Promise<AcquireResult> {
  const window = hourWindow(now);
  const senderLimit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const [senderKey, campaignKey] = keys(senderId, campaignId, window);
  const [allowed, reason, count] = await redis.rateLimitAcquire(
    senderKey,
    campaignKey,
    senderLimit,
    campaignHourlyLimit,
    KEY_TTL_SECONDS,
  );

  if (allowed === 1) return { allowed: true, window, senderCount: count, senderLimit };
  return reason === 1
    ? { allowed: false, window, scope: 'sender', count, limit: senderLimit }
    : { allowed: false, window, scope: 'campaign', count, limit: campaignHourlyLimit };
}

/** Give a slot back when the send itself failed, so failures don't eat quota. */
export async function releaseSendSlot(senderId: string, campaignId: string, window: string) {
  const [senderKey, campaignKey] = keys(senderId, campaignId, window);
  await redis.multi().decr(senderKey).decr(campaignKey).exec();
}

/**
 * Position of a deferred job within the target hour, per campaign. Deferred
 * jobs are spaced by the campaign's delay in the order they were deferred,
 * which keeps the original send order as far as possible.
 */
export async function nextDeferralRank(campaignId: string, targetWindow: string): Promise<number> {
  const key = `defer:${campaignId}:${targetWindow}`;
  const [[, rank]] = (await redis.multi().incr(key).expire(key, KEY_TTL_SECONDS).exec()) as [[null, number]];
  return rank - 1;
}

/** True only for the first caller per (user, sender, hour): used to send one Slack alert, not thousands. */
export async function claimLimitNotification(userId: string, senderId: string, window: string): Promise<boolean> {
  const res = await redis.set(`slack:notified:${userId}:${senderId}:${window}`, '1', 'EX', KEY_TTL_SECONDS, 'NX');
  return res === 'OK';
}
