import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env';
import { HttpError } from './errors';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function signSession(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

/** Accepts the dashboard's httpOnly cookie, or `Authorization: Bearer <token>` for Postman/scripts. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? req.cookies?.[SESSION_COOKIE];
  if (!token) return next(new HttpError(401, 'Not signed in'));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}
