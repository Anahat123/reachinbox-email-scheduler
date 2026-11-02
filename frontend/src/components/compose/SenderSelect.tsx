import { ChevronDown } from 'lucide-react';
import type { Sender } from '@/lib/types';

export function SenderSelect({ senders, value, onChange }: { senders: Sender[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="From"
        className="h-8 appearance-none rounded-md bg-surface pl-2.5 pr-8 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-200"
      >
        {senders.map((s) => (
          <option key={s.id} value={s.id}>
            {s.email}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
    </div>
  );
}
