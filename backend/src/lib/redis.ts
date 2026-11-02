import IORedis from 'ioredis';
import { env } from '../config/env';

/**
 * BullMQ requires maxRetriesPerRequest: null on connections used by workers
 * (blocking commands must not time out). One shared connection is used for
 * queues and our own rate-limit keys; workers create their own duplicate.
 */
export function createRedis() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redis = createRedis();
