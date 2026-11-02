import type {
  AppConfig,
  EmailCounts,
  EmailDetail,
  EmailListItem,
  EmailTab,
  Paginated,
  ScheduleRequest,
  ScheduleResponse,
  Sender,
  SlackStatus,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me').then((r) => r.user),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  emails: (tab: EmailTab, page: number, q?: string) => {
    const params = new URLSearchParams({ tab, page: String(page) });
    if (q) params.set('q', q);
    return request<Paginated<EmailListItem>>(`/api/emails?${params}`);
  },
  email: (id: string) => request<{ email: EmailDetail }>(`/api/emails/${id}`).then((r) => r.email),
  counts: () => request<EmailCounts>('/api/emails/counts'),
  schedule: (body: ScheduleRequest, idempotencyKey: string) =>
    request<ScheduleResponse>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  senders: () => request<{ senders: Sender[] }>('/api/senders').then((r) => r.senders),
  config: () => request<AppConfig>('/api/config'),

  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackConnectUrl: () => request<{ url: string }>('/api/slack/connect').then((r) => r.url),
  slackDisconnect: () => request<void>('/api/slack', { method: 'DELETE' }),
  slackTest: () => request<{ ok: boolean }>('/api/slack/test', { method: 'POST' }),
};
