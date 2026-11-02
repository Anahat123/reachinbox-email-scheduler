import crypto from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env, isProd } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { requireAuth, SESSION_COOKIE, setSessionCookie, signSession } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';

const STATE_COOKIE = 'oauth_state';
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
const loginError = (code: string) => `${env.FRONTEND_URL}/login?error=${code}`;

export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) return res.redirect(loginError('google_not_configured'));
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 10 * 60 * 1000 });
  res.redirect(
    google.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }),
  );
});

authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query as Record<string, string | undefined>;
    const expectedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);
    if (!code || !state || state !== expectedState) return res.redirect(loginError('invalid_state'));

    try {
      const { tokens } = await google.getToken(code);
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email) return res.redirect(loginError('no_profile'));

      const fields = {
        email: profile.email,
        name: profile.name ?? profile.email.split('@')[0],
        avatarUrl: profile.picture ?? null,
      };
      const user = await prisma.user.upsert({
        where: { googleId: profile.sub },
        create: { googleId: profile.sub, ...fields },
        update: fields,
      });
      setSessionCookie(res, signSession(user.id));
      res.redirect(`${env.FRONTEND_URL}/dashboard`);
    } catch (err) {
      logger.warn({ err }, 'Google OAuth callback failed');
      res.redirect(loginError('google_failed'));
    }
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    if (!user) throw new HttpError(401, 'User not found');
    res.json({ user });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});
