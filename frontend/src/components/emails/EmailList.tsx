'use client';

import { ChevronLeft, ChevronRight, Clock, SearchX, Send, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEmails } from '@/hooks/queries';
import type { EmailTab } from '@/lib/types';
import { EmailRow, EmailRowSkeleton } from './EmailRow';

const EMPTY: Record<EmailTab, { icon: typeof Clock; title: string; description: string }> = {
  scheduled: {
    icon: Clock,
    title: 'No scheduled emails',
    description: 'Emails you schedule will wait here until it is time to send them.',
  },
  sent: {
    icon: Send,
    title: 'No sent emails yet',
    description: 'Once scheduled emails go out, they show up here with their send time.',
  },
};

export function EmailList({ tab }: { tab: EmailTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useEmails(tab, page, q);

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    router.push(`${pathname}?${next}`);
  };

  if (isPending) {
    return (
      <div aria-busy="true" aria-label="Loading emails">
        {Array.from({ length: 6 }, (_, i) => (
          <EmailRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title="Couldn't load emails"
        description={error.message}
        action={<Button variant="outline" onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  if (!data.items.length) {
    if (q) {
      return <EmptyState icon={<SearchX className="h-5 w-5" />} title={`No results for “${q}”`} description="Try a different email, subject or word from the body." />;
    }
    const { icon: Icon, title, description } = EMPTY[tab];
    return (
      <EmptyState
        icon={<Icon className="h-5 w-5" />}
        title={title}
        description={description}
        action={
          <Link href="/dashboard/compose">
            <Button variant="outline">Compose New Email</Button>
          </Link>
        }
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = (data.page - 1) * data.pageSize + 1;
  const to = from + data.items.length - 1;

  return (
    <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {data.items.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
      {!q && totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 px-3 pt-3 text-xs text-ink-muted">
          <span className="mr-2">
            {from}–{to} of {data.total.toLocaleString()}
          </span>
          <IconButton aria-label="Previous page" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label="Next page" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
