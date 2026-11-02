import { Client } from '@elastic/elasticsearch';
import type { EmailStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { htmlToText } from './mailer.service';

const es = new Client({ node: env.ELASTICSEARCH_URL });
const index = env.ELASTICSEARCH_INDEX;

export interface EmailDoc {
  id: string;
  userId: string;
  campaignId: string;
  recipient: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: Date;
  sentAt: Date | null;
}

export async function ensureSearchIndex() {
  if (await es.indices.exists({ index })) return;
  await es.indices.create({
    index,
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        campaignId: { type: 'keyword' },
        recipient: { type: 'text', fields: { raw: { type: 'keyword' } } },
        senderEmail: { type: 'keyword' },
        subject: { type: 'text' },
        body: { type: 'text' },
        status: { type: 'keyword' },
        scheduledAt: { type: 'date' },
        sentAt: { type: 'date' },
      },
    },
  });
  logger.info({ index }, 'Created Elasticsearch index');
}

/**
 * Search indexing is best-effort: Postgres is the source of truth, so an ES
 * outage is logged but never blocks scheduling or sending.
 */
export async function indexEmails(docs: EmailDoc[]) {
  if (!docs.length) return;
  try {
    const operations = docs.flatMap((d) => [
      { index: { _index: index, _id: d.id } },
      { ...d, body: htmlToText(d.body) },
    ]);
    const res = await es.bulk({ operations });
    if (res.errors) logger.warn('Some emails failed to index in Elasticsearch');
  } catch (err) {
    logger.warn({ err }, 'Elasticsearch bulk index failed');
  }
}

export async function updateEmailDoc(id: string, doc: Partial<Pick<EmailDoc, 'status' | 'sentAt' | 'scheduledAt'>>) {
  try {
    await es.update({ index, id, doc, retry_on_conflict: 3 });
  } catch (err) {
    logger.warn({ err, id }, 'Elasticsearch update failed');
  }
}

export async function searchEmails(userId: string, q: string, statuses: EmailStatus[] | undefined, size = 50) {
  const res = await es.search<EmailDoc>({
    index,
    size,
    query: {
      bool: {
        filter: [{ term: { userId } }, ...(statuses ? [{ terms: { status: statuses } }] : [])],
        must: q
          ? [{ multi_match: { query: q, fields: ['recipient^3', 'subject^2', 'body'], fuzziness: 'AUTO' } }]
          : [{ match_all: {} }],
      },
    },
    sort: q ? ['_score', { scheduledAt: 'desc' }] : [{ scheduledAt: 'desc' }],
  });
  return res.hits.hits.map((h) => h._id as string);
}

export async function pingSearch() {
  return es.ping();
}
