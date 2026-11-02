'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EmailTab, ScheduleRequest } from '@/lib/types';

/** Lists poll so statuses flip from scheduled -> sent live while the worker runs. */
const LIVE_REFRESH_MS = 5000;

export const queryKeys = {
  me: ['me'] as const,
  emails: (tab: EmailTab, page: number, q: string) => ['emails', tab, page, q] as const,
  email: (id: string) => ['email', id] as const,
  counts: ['counts'] as const,
  senders: ['senders'] as const,
  config: ['config'] as const,
  slack: ['slack'] as const,
};

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: api.me, retry: false, staleTime: 5 * 60_000 });

export const useEmails = (tab: EmailTab, page: number, q: string) =>
  useQuery({
    queryKey: queryKeys.emails(tab, page, q),
    queryFn: () => api.emails(tab, page, q || undefined),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });

export const useEmail = (id: string) =>
  useQuery({ queryKey: queryKeys.email(id), queryFn: () => api.email(id), refetchInterval: LIVE_REFRESH_MS });

export const useCounts = () => useQuery({ queryKey: queryKeys.counts, queryFn: api.counts, refetchInterval: LIVE_REFRESH_MS });

export const useSenders = () => useQuery({ queryKey: queryKeys.senders, queryFn: api.senders, staleTime: Infinity });

export const useAppConfig = () => useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Infinity });

export const useSlackStatus = () => useQuery({ queryKey: queryKeys.slack, queryFn: api.slackStatus });

export function useScheduleEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: ScheduleRequest; idempotencyKey: string }) =>
      api.schedule(body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: queryKeys.counts });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => qc.clear(),
  });
}

export function useSlackDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.slackDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.slack }),
  });
}
