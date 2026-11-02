import { Worker } from 'bullmq';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createRedis, redis } from './lib/redis';
import { EMAIL_QUEUE_NAME, emailQueue, type SendEmailJobData } from './queue/emailQueue';
import { processEmail } from './queue/processEmail';
import { closeTransports } from './services/mailer.service';
import { reconcileQueue } from './services/scheduler.service';

async function main() {
  await reconcileQueue();

  const worker = new Worker<SendEmailJobData>(EMAIL_QUEUE_NAME, processEmail, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // Global (Redis-backed) limiter: at most 1 job starts per MIN_DELAY window,
    // across every worker process. This is the minimum gap between sends.
    limiter: env.MIN_DELAY_BETWEEN_SENDS_MS > 0 ? { max: 1, duration: env.MIN_DELAY_BETWEEN_SENDS_MS } : undefined,
    maxStalledCount: 1,
  });

  worker.on('failed', (job, err) => logger.warn({ jobId: job?.id, err: err.message }, 'Job failed'));
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));

  logger.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      minDelayMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
      maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    },
    'Email worker started',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker, waiting for in-flight sends');
    // close() lets active jobs finish; delayed/waiting jobs stay in Redis untouched.
    await worker.close();
    await emailQueue.close();
    closeTransports();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
