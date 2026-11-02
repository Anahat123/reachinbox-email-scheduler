import pino from 'pino';
import { isProd } from '../config/env';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
});
