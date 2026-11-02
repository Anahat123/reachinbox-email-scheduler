import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { requireAuth } from './middleware/auth';
import { asyncHandler, errorHandler, HttpError } from './middleware/errors';
import { emailQueue } from './queue/emailQueue';
import { authRouter } from './routes/auth.routes';
import { emailRouter } from './routes/email.routes';
import { slackRouter } from './routes/slack.routes';
import { pingSearch } from './services/search.service';
import { listSenders } from './services/sender.service';

const BULL_BOARD_PATH = '/admin/queues';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind ngrok for the Slack callback

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const [db, cache, search] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping(), pingSearch()]);
      const status = { db: db.status, redis: cache.status, elasticsearch: search.status };
      const ok = Object.values(status).every((s) => s === 'fulfilled');
      res.status(ok ? 200 : 503).json({ ok, ...status });
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/slack', slackRouter);

  app.get('/api/senders', requireAuth, asyncHandler(async (_req, res) => res.json({ senders: await listSenders() })));

  /** Server-side defaults/caps so the Compose form can show them. */
  app.get('/api/config', requireAuth, (_req, res) =>
    res.json({
      minDelayBetweenSendsMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
      maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      workerConcurrency: env.WORKER_CONCURRENCY,
      queueDashboardUrl: `${env.BACKEND_URL}${BULL_BOARD_PATH}`,
    }),
  );

  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use(BULL_BOARD_PATH, requireAuth, boardAdapter.getRouter());

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(errorHandler);
  return app;
}
