'use client';

import clsx from 'clsx';
import { CalendarDays } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { toLocalInputValue } from '@/lib/format';

function tomorrowAt(hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const PRESETS = [
  { label: 'Tomorrow', at: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

interface SendLaterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Date | null;
  onChange: (date: Date | null) => void;
  trigger: ReactNode;
}

export function SendLaterPopover({ open, onOpenChange, value, onChange, trigger }: SendLaterPopoverProps) {
  const [draft, setDraft] = useState(value ? toLocalInputValue(value) : '');
  const [preset, setPreset] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickPreset = (label: string, at: Date) => {
    setPreset(label);
    setDraft(toLocalInputValue(at));
  };

  const done = () => {
    onChange(draft ? new Date(draft) : null);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onClose={() => onOpenChange(false)} className="w-[296px] px-4 pb-4 pt-3" trigger={trigger}>
      <h3 className="mb-3 text-sm font-medium text-ink">Send Later</h3>
      <label className="flex items-center gap-2 border-b border-line pb-2">
        <input
          ref={inputRef}
          type="datetime-local"
          value={draft}
          min={toLocalInputValue(new Date())}
          onChange={(e) => {
            setDraft(e.target.value);
            setPreset(null);
          }}
          aria-label="Pick date & time"
          className={clsx(
            'flex-1 bg-transparent text-xs outline-none [&::-webkit-calendar-picker-indicator]:hidden',
            draft ? 'text-ink' : 'text-ink-faint',
          )}
        />
        <button type="button" aria-label="Open calendar" onClick={() => inputRef.current?.showPicker?.()} className="text-ink-faint hover:text-ink">
          <CalendarDays className="h-4 w-4" />
        </button>
      </label>

      <ul className="mt-2 space-y-0.5">
        {PRESETS.map(({ label, at }) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => pickPreset(label, at())}
              className={clsx(
                'w-full rounded-md px-1 py-2 text-left text-xs transition-colors hover:bg-surface',
                preset === label ? 'font-medium text-brand-700' : 'text-ink',
              )}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-end gap-2">
        {value && (
          <button
            type="button"
            className="mr-auto text-xs text-ink-muted hover:text-ink"
            onClick={() => {
              setDraft('');
              onChange(null);
              onOpenChange(false);
            }}
          >
            Send now instead
          </button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" onClick={done} disabled={!draft}>
          Done
        </Button>
      </div>
    </Popover>
  );
}
