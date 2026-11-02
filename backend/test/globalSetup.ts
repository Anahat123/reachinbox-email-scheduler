import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** Creates the reachinbox_test database if needed and applies migrations to it. */
export default async function setup() {
  const admin = new PrismaClient({
    datasources: { db: { url: 'postgresql://reachinbox:reachinbox@localhost:5432/reachinbox' } },
  });
  const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = 'reachinbox_test'`;
  if (!exists.length) await admin.$executeRawUnsafe('CREATE DATABASE reachinbox_test');
  await admin.$disconnect();

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'postgresql://reachinbox:reachinbox@localhost:5432/reachinbox_test' },
  });
}
