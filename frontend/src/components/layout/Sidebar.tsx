'use client';

import clsx from 'clsx';
import { Clock, Send, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { useCounts } from '@/hooks/queries';
import type { EmailTab } from '@/lib/types';
import { UserMenu } from './UserMenu';

const NAV: { tab: EmailTab; label: string; icon: LucideIcon }[] = [
  { tab: 'scheduled', label: 'Scheduled', icon: Clock },
  { tab: 'sent', label: 'Sent', icon: Send },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: counts } = useCounts();

  return (
    <aside className="flex w-[252px] shrink-0 flex-col gap-3 px-2 pt-4">
      <div className="px-2 pb-1">
        <Logo />
      </div>
      <UserMenu />
      <Link
        href="/dashboard/compose"
        className="flex h-9 items-center justify-center rounded-full border border-brand-500 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
      >
        Compose
      </Link>

      <nav className="mt-3">
        <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Core</p>
        {NAV.map(({ tab, label, icon: Icon }) => {
          const active = pathname.startsWith(`/dashboard/${tab}`);
          return (
            <Link
              key={tab}
              href={`/dashboard/${tab}`}
              className={clsx(
                'flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
                active ? 'bg-brand-100 font-semibold text-ink' : 'text-ink hover:bg-surface',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{label}</span>
              <span className="text-xs font-normal text-ink-muted">{counts ? counts[tab].toLocaleString() : ''}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
