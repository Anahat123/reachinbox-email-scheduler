'use client';

import { Upload, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { pluralize } from '@/lib/format';
import { isValidEmail, parseLeadsFile, splitTyped, uniqueEmails } from '@/lib/recipients';

const VISIBLE_CHIPS = 3;

interface RecipientFieldProps {
  value: string[];
  onChange: (emails: string[]) => void;
}

/** "To" row: type/paste addresses as chips, or upload a CSV/TXT lead list. */
export function RecipientField({ value, onChange }: RecipientFieldProps) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (candidates: string[]) => {
    const valid = uniqueEmails(candidates);
    const invalid = candidates.filter((c) => !isValidEmail(c));
    if (invalid.length) toast.error(`Not a valid email: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
    if (valid.length) onChange(uniqueEmails([...value, ...valid]));
    return invalid.length === 0;
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    if (add(splitTyped(draft))) setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\s,;]/.test(text.trim())) {
      e.preventDefault();
      add(splitTyped(text));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    try {
      const emails = await parseLeadsFile(file);
      if (!emails.length) {
        toast.error(`No email addresses found in ${file.name}`);
        return;
      }
      const merged = uniqueEmails([...value, ...emails]);
      onChange(merged);
      toast.success(`${pluralize(emails.length, 'email address')} detected in ${file.name}`);
    } catch {
      toast.error('Could not read that file');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = (email: string) => onChange(value.filter((v) => v !== email));
  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div className="flex min-h-8 items-start gap-3">
      <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {shown.map((email) => (
          <span key={email} className="inline-flex h-6 items-center gap-1 rounded-full border border-brand-500 bg-brand-50 pl-2.5 pr-1 text-xs text-ink">
            {email}
            <button type="button" aria-label={`Remove ${email}`} onClick={() => remove(email)} className="rounded-full p-0.5 text-ink-muted hover:bg-brand-100 hover:text-ink">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-6 items-center rounded-full border border-brand-500 bg-brand-50 px-2 text-xs font-medium text-brand-700">
            +{hidden.toLocaleString()}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-ink-muted hover:text-ink">
            Show less
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commitDraft}
          placeholder={value.length ? '' : 'recipient@example.com'}
          aria-label="Recipients"
          className="h-7 min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-3">
        {value.length > 0 && <span className="text-xs text-ink-muted">{pluralize(value.length, 'recipient')}</span>}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {parsing ? 'Reading…' : 'Upload List'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}
