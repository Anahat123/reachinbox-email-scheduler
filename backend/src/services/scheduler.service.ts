import type { Email } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { hourWindow, startOfNextHour } from '../lib/time';
import { emailQueue, sendJob } from '../queue/emailQueue';
import { indexEmails } from './search.service';

const DB_CHUNK = 1000;
const QUEUE_CHUNK = 500;

/**
 * Works out a send time for each recipient up front: one every `delayMs`, and
 * no more than `hourlyLimit` per clock hour (overflow rolls into the next
 * hour). The worker enforces the real limits at send time; this just makes
 * the Scheduled tab show realistic times instead of everything at once.
 */
export function planSendTimes(count: number, startMs: number, delayMs: number, hourlyLimit: number): number[] {
  const perHour = new Map<string, number>();
  const times: number[] = [];
  let t = startMs;
  for (let i = 0; i < count; i++) {
    while ((perHour.get(hourWindow(t)) ?? 0) >= hourlyLimit) t = startOfNextHour(t);
    times.push(t);
    perHour.set(hourWindow(t), (perHour.get(hourWindow(t)) ?? 0) + 1);
    t += delayMs;
  }
  return times;
}

export function normalizeRecipients(recipients: string[]): string[] {
  return [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
}

export interface ScheduleInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  idempotencyKey?: string;
}

export async function scheduleCampaign(input: ScheduleInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.campaign.findUnique({
      where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
      include: { _count: { select: { emails: true } } },
    });
    if (existing) return { campaign: existing, scheduledCount: existing._count.emails, duplicate: true };
  }

  const sender = await prisma.sender.findUniqueOrThrow({ where: { id: input.senderId } });
  const recipients = normalizeRecipients(input.recipients);
  const startMs = Math.max(input.startAt.getTime(), Date.now());
  const times = planSendTimes(
    recipients.length,
    startMs,
    Math.max(input.delayMs, env.MIN_DELAY_BETWEEN_SENDS_MS),
    Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER),
  );

  const { campaign, emails } = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        userId: input.userId,
        senderId: input.senderId,
        subject: input.subject,
        body: input.body,
        startAt: new Date(startMs),
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const emails: Email[] = [];
    for (let i = 0; i < recipients.length; i += DB_CHUNK) {
      const chunk = await tx.email.createManyAndReturn({
        data: recipients.slice(i, i + DB_CHUNK).map((recipient, j) => ({
          campaignId: campaign.id,
          userId: input.userId,
          senderId: input.senderId,
          recipient,
          position: i + j,
          scheduledAt: new Date(times[i + j]),
        })),
      });
      emails.push(...chunk);
    }
    return { campaign, emails };
  }, { timeout: 60_000 });

  // DB is committed first. If enqueueing dies halfway, reconcileQueue() on the
  // next worker boot re-adds whatever is missing.
  await enqueueEmails(emails);

  void indexEmails(
    emails.map((e) => ({
      id: e.id,
      userId: e.userId,
      campaignId: e.campaignId,
      recipient: e.recipient,
      senderEmail: sender.email,
      subject: campaign.subject,
      body: campaign.body,
      status: e.status,
      scheduledAt: e.scheduledAt,
      sentAt: null,
    })),
  );

  logger.info({ campaignId: campaign.id, count: emails.length }, 'Campaign scheduled');
  return { campaign, scheduledCount: emails.length, duplicate: false };
}

async function enqueueEmails(emails: Pick<Email, 'id' | 'scheduledAt'>[]) {
  for (let i = 0; i < emails.length; i += QUEUE_CHUNK) {
    await emailQueue.addBulk(emails.slice(i, i + QUEUE_CHUNK).map((e) => sendJob(e.id, e.scheduledAt)));
  }
}

/**
 * Runs on worker start. Redis (AOF) already keeps delayed jobs across
 * restarts; this covers the gaps: rows committed to Postgres whose job never
 * reached Redis (crash between the two), or a Redis that lost its data.
 * Safe to run any number of times because jobId = email id.
 */
export async function reconcileQueue() {
  let cursor: string | undefined;
  let requeued = 0;
  let checked = 0;
  for (;;) {
    const batch = await prisma.email.findMany({
      where: { status: 'scheduled' },
      select: { id: true, scheduledAt: true },
      orderBy: { id: 'asc' },
      take: QUEUE_CHUNK,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    checked += batch.length;
    cursor = batch[batch.length - 1].id;

    const jobs = await Promise.all(batch.map((e) => emailQueue.getJob(e.id)));
    const missing = batch.filter((_, i) => !jobs[i]);
    if (missing.length) {
      await enqueueEmails(missing);
      requeued += missing.length;
    }
  }
  logger.info({ checked, requeued }, 'Queue reconciled with database');
}
