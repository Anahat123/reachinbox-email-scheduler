import type { Job } from 'bullmq';
import { vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import type { SendEmailJobData } from '../src/queue/emailQueue';

export async function resetState() {
  await prisma.email.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.slackIntegration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sender.deleteMany();
  await redis.flushdb(); // Redis DB 1 only (see vitest.config.ts)
}

let seq = 0;

/** A user, a sender and a campaign with one scheduled email per recipient. */
export async function seedCampaign(recipients: string[], hourlyLimit = 100) {
  seq += 1;
  const user = await prisma.user.create({ data: { googleId: `test-${seq}`, email: `user${seq}@test.dev`, name: 'Test User' } });
  const sender = await prisma.sender.create({
    data: { email: `sender${seq}@test.dev`, name: 'Sender', smtpHost: 'smtp.test', smtpPort: 587, smtpUser: 'u', smtpPass: 'p' },
  });
  const campaign = await prisma.campaign.create({
    data: { userId: user.id, senderId: sender.id, subject: 'Hello', body: '<p>Hi</p>', startAt: new Date(), delayMs: 0, hourlyLimit },
  });
  const emails = await prisma.email.createManyAndReturn({
    data: recipients.map((recipient, position) => ({
      campaignId: campaign.id,
      userId: user.id,
      senderId: sender.id,
      recipient,
      position,
      scheduledAt: new Date(),
    })),
  });
  return { user, sender, campaign, emails };
}

/** The bits of a BullMQ Job that processEmail touches. */
export function fakeJob(emailId: string, attemptsMade = 0) {
  return {
    data: { emailId },
    attemptsMade,
    opts: { attempts: 3 },
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SendEmailJobData> & { moveToDelayed: ReturnType<typeof vi.fn> };
}
