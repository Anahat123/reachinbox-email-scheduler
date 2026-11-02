import { Router } from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import {
  buildAuthorizeUrl,
  completeOAuth,
  disconnect,
  getIntegration,
  postToSlack,
  slackConfigured,
  verifyState,
} from '../services/slack.service';

export const slackRouter = Router();
const backToDashboard = (status: string) => `${env.FRONTEND_URL}/dashboard?slack=${status}`;

slackRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const integration = await getIntegration(req.userId!);
    res.json({ configured: slackConfigured(), connected: Boolean(integration), integration });
  }),
);

/** Returns the Slack authorize URL; the dashboard navigates the browser to it. */
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!slackConfigured()) throw new HttpError(503, 'Slack app is not configured on the server');
  res.json({ url: buildAuthorizeUrl(req.userId!) });
});

slackRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error || !code || !state) return res.redirect(backToDashboard(error === 'access_denied' ? 'cancelled' : 'error'));
    try {
      const userId = verifyState(state);
      const integration = await completeOAuth(userId, code);
      await postToSlack(userId, `:white_check_mark: ReachInbox is connected. Rate-limit alerts will be posted to ${integration.channel}.`);
      res.redirect(backToDashboard('connected'));
    } catch (err) {
      logger.warn({ err }, 'Slack OAuth callback failed');
      res.redirect(backToDashboard('error'));
    }
  }),
);

slackRouter.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    await disconnect(req.userId!);
    res.status(204).end();
  }),
);

slackRouter.post(
  '/test',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ok = await postToSlack(req.userId!, ':wave: Test message from ReachInbox scheduler.');
    if (!ok) throw new HttpError(400, 'Slack is not connected');
    res.json({ ok });
  }),
);
