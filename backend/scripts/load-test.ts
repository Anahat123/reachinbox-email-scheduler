/**
 * Shows how a burst is spread out, e.g. 1000 emails all requested for "now".
 *   npm run load-test                 -> prints the planned schedule only (nothing is sent)
 *   npm run load-test -- --send 1000  -> also schedules them through the API (to @example.com)
 * Env overrides: HOURLY_LIMIT, DELAY_MS
 */
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { signSession } from '../src/middleware/auth';
import { planSendTimes } from '../src/services/scheduler.service';

async function main() {
  const sendIdx = process.argv.indexOf('--send');
  const count = Number(process.argv[sendIdx + 1] ?? process.argv[2] ?? 1000) || 1000;
  const hourlyLimit = Math.min(Number(process.env.HOURLY_LIMIT ?? 200), env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const delayMs = Math.max(Number(process.env.DELAY_MS ?? 2000), env.MIN_DELAY_BETWEEN_SENDS_MS);
  const start = Date.now();

  const times = planSendTimes(count, start, delayMs, hourlyLimit);
  const perHour = new Map<string, number>();
  for (const t of times) {
    const h = new Date(t).toISOString().slice(0, 13) + ':00Z';
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }
  console.log(`${count} emails, delay ${delayMs}ms, effective hourly limit ${hourlyLimit}`);
  console.table([...perHour].map(([hour, emails]) => ({ hour, emails })));
  console.log(`Last email at ${new Date(times[times.length - 1]).toISOString()}`);

  if (sendIdx !== -1) {
    const user = await prisma.user.upsert({
      where: { email: 'loadtest@example.com' },
      create: { email: 'loadtest@example.com', googleId: 'dev:loadtest', name: 'Load Test' },
      update: {},
    });
    const sender = await prisma.sender.findFirstOrThrow();
    const res = await fetch(`${env.BACKEND_URL}/api/emails/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signSession(user.id)}` },
      body: JSON.stringify({
        senderId: sender.id,
        subject: `Load test ${new Date().toISOString()}`,
        body: '<p>Load test email</p>',
        recipients: Array.from({ length: count }, (_, i) => `lead${i}@example.com`),
        startAt: new Date(start).toISOString(),
        delayMs,
        hourlyLimit,
      }),
    });
    console.log(res.status, await res.json());
  }
  await prisma.$disconnect();
}

main().then(() => process.exit(0));
