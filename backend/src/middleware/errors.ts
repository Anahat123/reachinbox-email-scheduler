import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Express 4 doesn't forward rejected promises to the error handler on its own. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields = err.flatten().fieldErrors;
    const first = Object.entries(fields)[0];
    return res.status(400).json({
      error: first ? `${first[0]}: ${first[1]?.[0]}` : 'Invalid request',
      fields,
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Something went wrong' });
}
