import { DelayedError, type Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { hourWindow, startOfNextHour } from '../lib/time';
import { sendEmail } from '../services/mailer.service';
import {
  acquireSendSlot,
  claimLimitNotification,
  nextDeferralRank,
  releaseSendSlot,
  type LimitScope,
} from '../services/rateLimiter';
import { updateEmailDoc } from '../services/search.service';
import { notifyRateLimitHit } from '../services/slack.service';
import type { SendEmailJobData } from './emailQueue';

type Result = { outcome: 'sent' | 'skipped' | 'failed'; reason?: string };

/**
 * Processes one email. Order of guards:
 *  1. DB status  - already sent/failed => no-op (idempotency for re-delivered jobs)
 *  2. Rate limit - over the hourly quota => move the job to the next hour, never drop it
 *  3. DB claim   - atomic scheduled->sending, so two workers can't both send it
 */
export async function processEmail(job: Job<SendEmailJobData>, token?: string): Promise<Result> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { campaign: true, sender: true },
  });
  if (!email) return { outcome: 'skipped', reason: 'email no longer exists' };
  if (email.status === 'sent' || email.status === 'failed') return { outcome: 'skipped', reason: `already ${email.status}` };

  if (email.status === 'sending') {
    // A previous attempt crashed after claiming but before recording the result,
    // so the SMTP send may or may not have happened. We choose at-most-once
    // delivery: mark failed rather than risk sending a duplicate.
    await markFailed(email.id, 'Interrupted mid-send; not retried to avoid a duplicate delivery');
    return { outcome: 'failed', reason: 'interrupted' };
  }

  const slot = await acquireSendSlot(email.senderId, email.campaignId, email.campaign.hourlyLimit);
  if (!slot.allowed) {
    const resumesAt = await deferToNextHour(job, token!, email.id, email.campaignId, email.campaign.delayMs);
    alertLimitReached(email.userId, email.senderId, email.sender.email, slot.scope, slot.limit, slot.window, resumesAt);
    // Tells BullMQ the job was moved to delayed on purpose (doesn't count as an attempt).
    throw new DelayedError();
  }
  if (slot.senderCount === slot.senderLimit) {
    // This send uses the sender's last slot for the hour: alert right away.
    alertLimitReached(email.userId, email.senderId, email.sender.email, 'sender', slot.senderLimit, slot.window, new Date(startOfNextHour(Date.now())));
  }

  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: 'scheduled' },
    data: { status: 'sending', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await releaseSendSlot(email.senderId, email.campaignId, slot.window);
    return { outcome: 'skipped', reason: 'claimed by another worker' };
  }

  try {
    const { messageId, previewUrl } = await sendEmail(email.sender, {
      id: email.id,
      to: email.recipient,
      subject: email.campaign.subject,
      html: email.campaign.body,
    });
    const sentAt = new Date();
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'sent', sentAt, messageId, previewUrl, error: null },
    });
    void updateEmailDoc(email.id, { status: 'sent', sentAt });
    logger.info({ emailId: email.id, to: email.recipient, from: email.sender.email }, 'Email sent');
    return { outcome: 'sent' };
  } catch (err) {
    await releaseSendSlot(email.senderId, email.campaignId, slot.window);
    const message = err instanceof Error ? err.message : String(err);
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      await markFailed(email.id, message);
    } else {
      // Hand it back so BullMQ's retry (with backoff) can claim it again.
      await prisma.email.update({ where: { id: email.id }, data: { status: 'scheduled', error: message } });
    }
    logger.warn({ emailId: email.id, err: message, isFinalAttempt }, 'Email send failed');
    throw err;
  }
}

async function deferToNextHour(job: Job, token: string, emailId: string, campaignId: string, delayMs: number) {
  const nextHour = startOfNextHour(Date.now());
  const rank = await nextDeferralRank(campaignId, hourWindow(nextHour));
  const runAt = nextHour + rank * Math.max(delayMs, env.MIN_DELAY_BETWEEN_SENDS_MS);
  const scheduledAt = new Date(runAt);

  await prisma.email.update({ where: { id: emailId }, data: { scheduledAt, deferredCount: { increment: 1 } } });
  void updateEmailDoc(emailId, { scheduledAt });
  await job.moveToDelayed(runAt, token);
  logger.info({ emailId, runAt: scheduledAt.toISOString() }, 'Hourly limit reached, deferred to next hour');
  return scheduledAt;
}

function alertLimitReached(
  userId: string,
  senderId: string,
  senderEmail: string,
  scope: LimitScope,
  limit: number,
  window: string,
  resumesAt: Date,
) {
  // Fire-and-forget: Slack being slow or unconnected must never stall sending.
  void (async () => {
    if (!(await claimLimitNotification(userId, senderId, window))) return;
    const delivered = await notifyRateLimitHit({ userId, senderEmail, scope, limit, resumesAt });
    logger.info({ userId, senderEmail, delivered }, 'Rate limit alert processed');
  })().catch((err) => logger.warn({ err }, 'Rate limit alert failed'));
}

async function markFailed(id: string, error: string) {
  await prisma.email.update({ where: { id }, data: { status: 'failed', error } });
  void updateEmailDoc(id, { status: 'failed' });
}
