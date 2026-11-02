import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { emailQueue } from './queue/emailQueue';
import { ensureSearchIndex } from './services/search.service';
import { ensureSenders } from './services/sender.service';

async function main() {
  await ensureSenders();
  await ensureSearchIndex().catch((err) => logger.warn({ err }, 'Elasticsearch unavailable, search disabled until it is up'));

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (queue dashboard: /admin/queues)`);
  });

  const shutdown = () => {
    server.close(async () => {
      await emailQueue.close();
      await prisma.$disconnect();
      redis.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'API failed to start');
  process.exit(1);
});
