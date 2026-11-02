'use client';

import { ChevronDown, ExternalLink, TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmailStatusBadge } from '@/components/emails/EmailStatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useEmail, useMe } from '@/hooks/queries';
import { formatDateTime, pluralize } from '@/lib/format';

export default function EmailDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: email, isPending, isError, error } = useEmail(id);

  const backHref = email && ['sent', 'failed'].includes(email.status) ? '/dashboard/sent' : '/dashboard/scheduled';

  return (
    <div className="min-h-screen">
      <PageHeader
        backHref={backHref}
        title={email?.subject ?? ''}
        actions={me && <Avatar name={me.name} src={me.avatarUrl} size={32} />}
      />

      {isPending ? (
        <div className="flex justify-center py-24 text-brand-500">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyState icon={<TriangleAlert className="h-5 w-5" />} title="Couldn't load this email" description={error.message} />
      ) : (
        <article className="mx-auto max-w-[1088px] px-6 pb-16 pt-4">
          <div className="flex items-start gap-3">
            <Avatar name={email.sender.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold text-ink">{email.sender.name}</span>{' '}
                <span className="text-xs text-ink-muted">&lt;{email.sender.email}&gt;</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                to {email.recipient} <ChevronDown className="h-3 w-3" />
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-xs text-ink-muted">{formatDateTime(email.sentAt ?? email.scheduledAt)}</span>
              <EmailStatusBadge email={email} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-surface px-4 py-3 text-xs text-ink-muted">
            <span>Scheduled for <b className="font-medium text-ink">{formatDateTime(email.scheduledAt)}</b></span>
            {email.sentAt && <span>Sent at <b className="font-medium text-ink">{formatDateTime(email.sentAt)}</b></span>}
            {email.deferredCount > 0 && (
              <span>Rescheduled {pluralize(email.deferredCount, 'time')} by the hourly limit</span>
            )}
            {email.error && <span className="text-danger-text">Error: {email.error}</span>}
            {email.previewUrl && (
              <a href={email.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                View in Ethereal <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div
            className="email-body mt-6 pl-[52px] text-sm leading-6 text-ink"
            // Body was authored by this same user in the compose editor.
            dangerouslySetInnerHTML={{ __html: email.body || '<p class="text-ink-faint">(no content)</p>' }}
          />
        </article>
      )}
    </div>
  );
}
