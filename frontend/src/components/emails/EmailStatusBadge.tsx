import { AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatBadgeTime } from '@/lib/format';
import type { EmailListItem } from '@/lib/types';

/** Scheduled rows show the send time (orange, as in Figma); sent rows a grey "Sent"; failures red. */
export function EmailStatusBadge({ email }: { email: Pick<EmailListItem, 'status' | 'scheduledAt' | 'error'> }) {
  switch (email.status) {
    case 'scheduled':
      return (
        <Badge tone="pending" icon={<Clock className="h-3 w-3" />}>
          {formatBadgeTime(email.scheduledAt)}
        </Badge>
      );
    case 'sending':
      return (
        <Badge tone="brand" icon={<Loader2 className="h-3 w-3 animate-spin" />}>
          Sending
        </Badge>
      );
    case 'sent':
      return <Badge tone="neutral">Sent</Badge>;
    case 'failed':
      return (
        <Badge tone="danger" icon={<AlertCircle className="h-3 w-3" />}>
          <span title={email.error ?? undefined}>Failed</span>
        </Badge>
      );
  }
}
