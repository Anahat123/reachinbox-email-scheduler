'use client';

import { ChevronDown, ExternalLink, LogOut, Slack } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { Popover } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/Spinner';
import { useAppConfig, useLogout, useMe, useSlackDisconnect, useSlackStatus } from '@/hooks/queries';
import { api } from '@/lib/api';

/** The user card at the top of the sidebar; opens a menu with Slack, queue dashboard and logout. */
export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: user } = useMe();
  const { data: slack, isLoading: slackLoading } = useSlackStatus();
  const { data: config } = useAppConfig();
  const logout = useLogout();
  const disconnect = useSlackDisconnect();
  const [connecting, setConnecting] = useState(false);

  if (!user) return null;

  const connectSlack = async () => {
    setConnecting(true);
    try {
      window.location.href = await api.slackConnectUrl();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start Slack connection');
      setConnecting(false);
    }
  };

  const onLogout = async () => {
    await logout.mutateAsync();
    router.replace('/login');
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-[260px] p-1.5"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
        >
          <Avatar name={user.name} src={user.avatarUrl} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-[11px] text-ink-muted">{user.email}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
        </button>
      }
    >
      <div className="border-b border-line px-3 pb-2.5 pt-2">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Slack alerts</p>
        {slackLoading ? (
          <Spinner className="h-4 w-4 text-ink-faint" />
        ) : slack?.connected ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-500" />
              {slack.integration?.channel} · {slack.integration?.teamName}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs text-ink-muted hover:text-danger-text"
              onClick={() =>
                disconnect.mutate(undefined, { onSuccess: () => toast.success('Slack disconnected') })
              }
            >
              Disconnect
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            {slack?.configured ? 'Get notified when a sender hits its hourly limit.' : 'Slack app is not configured on the server.'}
          </p>
        )}
      </div>

      {!slack?.connected && slack?.configured && (
        <MenuItem icon={connecting ? <Spinner className="h-4 w-4" /> : <Slack className="h-4 w-4" />} onClick={connectSlack}>
          Connect Slack
        </MenuItem>
      )}
      {config && (
        <MenuItem icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(config.queueDashboardUrl, '_blank')}>
          Queue dashboard
        </MenuItem>
      )}
      <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={onLogout}>
        Logout
      </MenuItem>
    </Popover>
  );
}

function MenuItem({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-surface"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  );
}
