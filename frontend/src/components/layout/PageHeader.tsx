'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/Button';

/** Full-width header with a back arrow, used by the email detail and compose screens. */
export function PageHeader({ title, actions, backHref }: { title: ReactNode; actions?: ReactNode; backHref: string }) {
  const router = useRouter();
  const goBack = () => (window.history.length > 1 ? router.back() : router.push(backHref));
  return (
    <header className="flex h-16 items-center gap-3 px-4">
      <IconButton aria-label="Back" onClick={goBack} className="text-ink">
        <ArrowLeft className="h-5 w-5" />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-normal text-ink">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
