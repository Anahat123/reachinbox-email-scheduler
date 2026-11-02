import { DelayedError } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { startOfNextHour } from '../src/lib/time';
import { processEmail } from '../src/queue/processEmail';
import { fakeJob, resetState, seedCampaign } from './helpers';

// Replace real SMTP with a slow fake so concurrent attempts genuinely overlap.
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('../src/services/mailer.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/mailer.service')>()),
  sendEmail,
}));

beforeEach(async () => {
  await resetState();
  sendEmail.mockReset();
  sendEmail.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { messageId: '<m@test>', previewUrl: 'https://ethereal.email/message/x' };
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

describe('processEmail', () => {
  it('sends once and records the result', async () => {
    const { emails } = await seedCampaign(['a@x.com']);
    const result = await processEmail(fakeJob(emails[0].id), 'token');

    expect(result.outcome).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } });
    expect(row).toMatchObject({ status: 'sent', messageId: '<m@test>', attempts: 1 });
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it('does not send again when the same job is delivered twice (idempotency)', async () => {
    const { emails } = await seedCampaign(['a@x.com']);
    await processEmail(fakeJob(emails[0].id), 'token');
    const second = await processEmail(fakeJob(emails[0].id), 'token');

    expect(second).toMatchObject({ outcome: 'skipped', reason: 'already sent' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends exactly once when two workers pick up the same email at the same time', async () => {
    const { emails } = await seedCampaign(['a@x.com']);
    const results = await Promise.all([
      processEmail(fakeJob(emails[0].id), 'token'),
      processEmail(fakeJob(emails[0].id), 'token'),
    ]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.outcome).sort()).toEqual(['sent', 'skipped']);
  });

  it('marks an email interrupted mid-send as failed instead of risking a duplicate', async () => {
    const { emails } = await seedCampaign(['a@x.com']);
    await prisma.email.update({ where: { id: emails[0].id }, data: { status: 'sending' } });

    const result = await processEmail(fakeJob(emails[0].id), 'token');
    expect(result.outcome).toBe('failed');
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } })).status).toBe('failed');
  });

  it('defers to the next hour once the sender limit is used up, without dropping the email', async () => {
    // Sender limit is 3/hour in tests.
    const { emails } = await seedCampaign(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    for (const e of emails.slice(0, 3)) await processEmail(fakeJob(e.id), 'token');

    const job = fakeJob(emails[3].id);
    await expect(processEmail(job, 'token')).rejects.toBeInstanceOf(DelayedError);

    expect(sendEmail).toHaveBeenCalledTimes(3);
    const [runAt] = job.moveToDelayed.mock.calls[0];
    expect(runAt).toBeGreaterThanOrEqual(startOfNextHour(Date.now()));
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emails[3].id } });
    expect(row).toMatchObject({ status: 'scheduled', deferredCount: 1 });
    expect(row.scheduledAt.getTime()).toBe(runAt);
  });

  it('hands a failed send back for retry, then marks it failed on the last attempt', async () => {
    const { emails } = await seedCampaign(['a@x.com']);
    sendEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(processEmail(fakeJob(emails[0].id, 0), 'token')).rejects.toThrow('SMTP down');
    expect((await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } })).status).toBe('scheduled');

    await expect(processEmail(fakeJob(emails[0].id, 2), 'token')).rejects.toThrow('SMTP down');
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emails[0].id } });
    expect(row).toMatchObject({ status: 'failed', error: 'SMTP down' });
  });
});
