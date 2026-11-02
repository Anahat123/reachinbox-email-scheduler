import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { LimitScope } from './rateLimiter';

export const slackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);

/**
 * The OAuth callback arrives on the public (ngrok) host, where the dashboard's
 * session cookie isn't present, so the user id travels in a signed, short-lived state.
 */
export function buildAuthorizeUrl(userId: string) {
  const state = jwt.sign({ uid: userId, purpose: 'slack' }, env.JWT_SECRET, { expiresIn: '10m' });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

export function verifyState(state: string): string {
  const payload = jwt.verify(state, env.JWT_SECRET) as { uid: string; purpose: string };
  if (payload.purpose !== 'slack') throw new Error('Invalid OAuth state');
  return payload.uid;
}

interface OAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  team: { id: string; name: string };
  incoming_webhook: { channel: string; url: string };
}

export async function completeOAuth(userId: string, code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data = (await res.json()) as OAuthAccessResponse;
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`);

  const fields = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token,
  };
  return prisma.slackIntegration.upsert({ where: { userId }, create: { userId, ...fields }, update: fields });
}

export async function getIntegration(userId: string) {
  return prisma.slackIntegration.findUnique({
    where: { userId },
    select: { teamName: true, channel: true, createdAt: true },
  });
}

export async function disconnect(userId: string) {
  await prisma.slackIntegration.deleteMany({ where: { userId } });
}

/** Posts to the user's connected channel. Returns false (never throws) when not connected or Slack errors. */
export async function postToSlack(userId: string, text: string, blocks?: unknown[]): Promise<boolean> {
  // Looked up on every call so connecting/disconnecting takes effect without a restart.
  const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integration) return false;
  try {
    const res = await fetch(integration.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (res.status === 404 || res.status === 410 || res.status === 403) {
      // Webhook was revoked from Slack's side; drop it so the user sees "not connected".
      logger.warn({ userId, status: res.status }, 'Slack webhook revoked, removing integration');
      await disconnect(userId);
      return false;
    }
    if (!res.ok) {
      logger.warn({ userId, status: res.status, body: await res.text() }, 'Slack webhook call failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId }, 'Slack webhook call errored');
    return false;
  }
}

export interface RateLimitAlert {
  userId: string;
  senderEmail: string;
  scope: LimitScope;
  limit: number;
  resumesAt: Date;
}

export function notifyRateLimitHit(alert: RateLimitAlert) {
  const what = alert.scope === 'sender' ? 'sender hourly limit' : 'campaign hourly limit';
  const text = `:warning: Rate limit reached: ${alert.senderEmail} hit its ${what} of ${alert.limit} emails/hour. Remaining emails are queued and resume at ${alert.resumesAt.toISOString()}.`;
  return postToSlack(alert.userId, text, [
    { type: 'header', text: { type: 'plain_text', text: '⚠️ Hourly send limit reached' } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Sender*\n${alert.senderEmail}` },
        { type: 'mrkdwn', text: `*Limit*\n${alert.limit} / hour (${what})` },
        { type: 'mrkdwn', text: `*Resumes at*\n<!date^${Math.floor(alert.resumesAt.getTime() / 1000)}^{date_short_pretty} {time}|${alert.resumesAt.toISOString()}>` },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'No emails were dropped — they have been rescheduled into the next hour.' }] },
  ]);
}
