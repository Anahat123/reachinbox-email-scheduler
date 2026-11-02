/**
 * Prints a session token for Postman/curl testing without going through Google.
 * Creates (or reuses) a local test user. Usage: npm run dev-token [email]
 */
import { prisma } from '../src/lib/prisma';
import { signSession } from '../src/middleware/auth';

async function main() {
  const email = process.argv[2] ?? 'dev@example.com';
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, googleId: `dev:${email}`, name: 'Dev User' },
    update: {},
  });
  console.log(signSession(user.id));
  await prisma.$disconnect();
}

main().then(() => process.exit(0));
