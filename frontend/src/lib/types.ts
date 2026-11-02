/** Shapes returned by the Express API. */

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';
export type EmailTab = 'scheduled' | 'sent';

export interface Sender {
  id: string;
  email: string;
  name: string;
}

export interface EmailListItem {
  id: string;
  recipient: string;
  subject: string;
  snippet: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  error: string | null;
  previewUrl: string | null;
  sender: Pick<Sender, 'email' | 'name'>;
}

export interface EmailDetail extends EmailListItem {
  body: string;
  deferredCount: number;
  attempts: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
}

export interface AppConfig {
  minDelayBetweenSendsMs: number;
  maxEmailsPerHourPerSender: number;
  workerConcurrency: number;
  queueDashboardUrl: string;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  integration: { teamName: string; channel: string; createdAt: string } | null;
}

export interface ScheduleRequest {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  campaignId: string;
  scheduledCount: number;
  duplicate: boolean;
}
