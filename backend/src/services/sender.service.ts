import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number };
}

/**
 * Calls the Ethereal API directly: nodemailer.createTestAccount() caches one
 * account per process, and we need a distinct account per sender.
 */
async function createEtherealAccount(): Promise<EtherealAccount> {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-scheduler', version: '1.0.0' }),
  });
  const data = (await res.json()) as EtherealAccount & { status: string; error?: string };
  if (data.status !== 'success') throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  return data;
}

/** Makes sure ETHEREAL_SENDER_COUNT Ethereal test accounts exist to send from. */
export async function ensureSenders() {
  const existing = await prisma.sender.count();
  for (let n = existing + 1; n <= env.ETHEREAL_SENDER_COUNT; n++) {
    const account = await createEtherealAccount();
    await prisma.sender.create({
      data: {
        email: account.user,
        name: `ReachInbox Sender ${n}`,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });
    logger.info({ email: account.user }, 'Created Ethereal sender account');
  }
}

export function listSenders() {
  return prisma.sender.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
}
