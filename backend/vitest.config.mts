import { defineConfig } from 'vitest/config';

/**
 * Tests run against the real Postgres/Redis/Elasticsearch from docker-compose,
 * but isolated from dev data: a separate database, Redis DB 1 and a separate index.
 */
export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'test-secret-at-least-16-chars',
      DATABASE_URL: 'postgresql://reachinbox:reachinbox@localhost:5432/reachinbox_test',
      REDIS_URL: 'redis://localhost:6379/1',
      ELASTICSEARCH_INDEX: 'emails_test',
      MAX_EMAILS_PER_HOUR_PER_SENDER: '3',
      MIN_DELAY_BETWEEN_SENDS_MS: '1000',
      SEND_MAX_ATTEMPTS: '3',
    },
  },
});
