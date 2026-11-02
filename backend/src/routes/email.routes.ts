import type { EmailStatus, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/errors';
import { htmlToText } from '../services/mailer.service';
import { scheduleCampaign } from '../services/scheduler.service';
import { searchEmails } from '../services/search.service';

export const emailRouter = Router();
emailRouter.use(requireAuth);

const TAB_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
};

const scheduleSchema = z.object({
  senderId: z.string().min(1),
  subject: z.string().trim().min(1).max(998),
  body: z.string().max(200_000).default(''),
  recipients: z.array(z.string().trim().email()).min(1).max(20_000),
  startAt: z.coerce.date(),
  delayMs: z.number().int().min(0).max(3_600_000),
  hourlyLimit: z.number().int().min(1).max(100_000),
});

emailRouter.post(
  '/schedule',
  asyncHandler(async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const sender = await prisma.sender.findUnique({ where: { id: input.senderId } });
    if (!sender) throw new HttpError(400, 'Unknown sender');

    const idempotencyKey = req.header('Idempotency-Key')?.slice(0, 200) || undefined;
    const result = await scheduleCampaign({ ...input, userId: req.userId!, idempotencyKey });
    res.status(result.duplicate ? 200 : 201).json({
      campaignId: result.campaign.id,
      scheduledCount: result.scheduledCount,
      duplicate: result.duplicate,
    });
  }),
);

const emailListSelect = {
  id: true,
  recipient: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  updatedAt: true,
  error: true,
  previewUrl: true,
  campaign: { select: { subject: true, body: true } },
  sender: { select: { email: true, name: true } },
} satisfies Prisma.EmailSelect;

type EmailRow = Prisma.EmailGetPayload<{ select: typeof emailListSelect }>;

const toListItem = (e: EmailRow) => ({
  id: e.id,
  recipient: e.recipient,
  subject: e.campaign.subject,
  snippet: htmlToText(e.campaign.body).slice(0, 140),
  status: e.status,
  scheduledAt: e.scheduledAt,
  sentAt: e.sentAt,
  error: e.error,
  previewUrl: e.previewUrl,
  sender: e.sender,
});

const listSchema = z.object({
  tab: z.enum(['scheduled', 'sent']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
});

emailRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { tab, page, pageSize, q } = listSchema.parse(req.query);
    const statuses = TAB_STATUSES[tab];

    if (q) {
      // Full-text search goes through Elasticsearch, then rows are hydrated from Postgres.
      const ids = await searchEmails(req.userId!, q, statuses, 100);
      const rows = await prisma.email.findMany({ where: { id: { in: ids }, userId: req.userId }, select: emailListSelect });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = ids.flatMap((id) => (byId.has(id) ? [toListItem(byId.get(id)!)] : []));
      return res.json({ items, total: items.length, page: 1, pageSize: items.length });
    }

    const where: Prisma.EmailWhereInput = { userId: req.userId, status: { in: statuses } };
    const orderBy: Prisma.EmailOrderByWithRelationInput[] =
      tab === 'scheduled' ? [{ scheduledAt: 'asc' }, { position: 'asc' }] : [{ updatedAt: 'desc' }];
    const [rows, total] = await Promise.all([
      prisma.email.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: emailListSelect }),
      prisma.email.count({ where }),
    ]);
    res.json({ items: rows.map(toListItem), total, page, pageSize });
  }),
);

emailRouter.get(
  '/counts',
  asyncHandler(async (req, res) => {
    const grouped = await prisma.email.groupBy({ by: ['status'], where: { userId: req.userId }, _count: true });
    const count = (statuses: EmailStatus[]) =>
      grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count, 0);
    res.json({ scheduled: count(TAB_STATUSES.scheduled), sent: count(TAB_STATUSES.sent) });
  }),
);

emailRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { ...emailListSelect, deferredCount: true, attempts: true },
    });
    if (!email) throw new HttpError(404, 'Email not found');
    res.json({
      email: {
        ...toListItem(email),
        body: email.campaign.body,
        deferredCount: email.deferredCount,
        attempts: email.attempts,
      },
    });
  }),
);
