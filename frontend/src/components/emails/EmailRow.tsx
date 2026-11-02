import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import type { EmailListItem, EmailStatus } from '@/lib/types';
import { EmailStatusBadge } from './EmailStatusBadge';

/** Written-out status for rows whose badge shows a time instead of a status. */
const PENDING_LABEL: Partial<Record<EmailStatus, string>> = {
  scheduled: 'Scheduled',
  sending: 'Sending…',
};

export function EmailRow({ email }: { email: EmailListItem }) {
  // Scheduled rows show their time in the badge, so the right edge spells out the status;
  // sent rows show "Sent" in the badge, so the right edge carries the sent time.
  const time = email.sentAt;
  const pendingLabel = PENDING_LABEL[email.status];
  return (
    <Link
      href={`/dashboard/emails/${email.id}`}
      className="group flex h-14 items-center gap-4 border-b border-line px-5 text-sm transition-colors hover:bg-surface"
    >
      <span className="w-[200px] shrink-0 truncate text-ink">To: {email.recipient}</span>
      <EmailStatusBadge email={email} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-ink">{email.subject}</span>
        {email.snippet && <span className="text-ink-faint"> - {email.snippet}</span>}
      </span>
      {time && (
        <time className="shrink-0 text-xs text-ink-muted" dateTime={time} title="Sent at">
          {formatDateTime(time)}
        </time>
      )}
      {pendingLabel && <span className="shrink-0 text-xs font-medium text-pending-text">{pendingLabel}</span>}
    </Link>
  );
}

export function EmailRowSkeleton() {
  return (
    <div className="flex h-14 animate-pulse items-center gap-4 border-b border-line px-5">
      <span className="h-3 w-[160px] rounded bg-surface" />
      <span className="h-6 w-28 rounded-full bg-surface" />
      <span className="h-3 flex-1 rounded bg-surface" />
    </div>
  );
}
