import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'pending' | 'neutral' | 'danger' | 'brand';

const tones: Record<Tone, string> = {
  pending: 'bg-pending-bg text-pending-text border-pending-border',
  neutral: 'bg-surface text-ink-muted border-line',
  danger: 'bg-danger-bg text-danger-text border-transparent',
  brand: 'bg-brand-100 text-brand-700 border-brand-200',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
