'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const MESSAGES = {
  connected: () => toast.success('Slack connected — a confirmation message was posted to your channel.'),
  cancelled: () => toast.info('Slack connection cancelled.'),
  error: () => toast.error('Could not connect Slack. Please try again.'),
} as const;

/** Shows the outcome of the Slack OAuth redirect (?slack=...) once, then strips the param. */
export function SlackCallbackToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const status = params.get('slack') as keyof typeof MESSAGES | null;

  useEffect(() => {
    if (!status || !(status in MESSAGES)) return;
    MESSAGES[status]();
    qc.invalidateQueries({ queryKey: ['slack'] });
    const next = new URLSearchParams(params);
    next.delete('slack');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`);
  }, [status, params, pathname, router, qc]);

  return null;
}
