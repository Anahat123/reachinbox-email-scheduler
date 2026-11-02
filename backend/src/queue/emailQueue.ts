import { Queue } from 'bullmq';
import { env } from '../config/env';
import { redis } from '../lib/redis';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface SendEmailJobData {
  emailId: string;
}

/**
 * Every job is added with jobId = Email.id. BullMQ refuses a second job with
 * an existing id, so enqueueing (including the reconcile-on-boot pass) is
 * idempotent. The DB status check in the worker is the second guard, for jobs
 * that were already completed and removed.
 */
export const emailQueue = new Queue<SendEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

export function sendJob(emailId: string, runAt: Date) {
  return {
    name: 'send' as const,
    data: { emailId },
    opts: { jobId: emailId, delay: Math.max(0, runAt.getTime() - Date.now()) },
  };
}
