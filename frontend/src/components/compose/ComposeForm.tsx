'use client';

import { Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { LineInput, NumberBox } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useAppConfig, useScheduleEmails, useSenders } from '@/hooks/queries';
import { formatBadgeTime, pluralize } from '@/lib/format';
import { RecipientField } from './RecipientField';
import { RichTextEditor } from './RichTextEditor';
import { SendLaterPopover } from './SendLaterPopover';
import { SenderSelect } from './SenderSelect';

export function ComposeForm() {
  const router = useRouter();
  const { data: senders, isPending: sendersLoading } = useSenders();
  const { data: config } = useAppConfig();
  const schedule = useScheduleEmails();

  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySec, setDelaySec] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  // One key per compose session: a double click or retry can't schedule the batch twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const activeSender = senderId || senders?.[0]?.id || '';
  const minDelaySec = Math.ceil((config?.minDelayBetweenSendsMs ?? 0) / 1000);
  const maxPerHour = config?.maxEmailsPerHourPerSender;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activeSender) return toast.error('No sender account available');
    if (!recipients.length) return toast.error('Add at least one recipient or upload a list');
    if (!subject.trim()) return toast.error('Subject is required');
    if (sendAt && sendAt.getTime() < Date.now() - 60_000) return toast.error('Send-later time is in the past');

    const delayMs = delaySec === '' ? minDelaySec * 1000 : Number(delaySec) * 1000;
    const limit = hourlyLimit === '' ? (maxPerHour ?? 100) : Number(hourlyLimit);
    if (!Number.isFinite(delayMs) || delayMs < 0) return toast.error('Delay must be 0 or more seconds');
    if (!Number.isInteger(limit) || limit < 1) return toast.error('Hourly limit must be at least 1');

    try {
      const res = await schedule.mutateAsync({
        idempotencyKey,
        body: {
          senderId: activeSender,
          recipients,
          subject: subject.trim(),
          body,
          startAt: (sendAt ?? new Date()).toISOString(),
          delayMs,
          hourlyLimit: limit,
        },
      });
      toast.success(`${pluralize(res.scheduledCount, 'email')} scheduled`);
      router.push('/dashboard/scheduled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule emails');
    }
  };

  return (
    <form onSubmit={submit} className="min-h-screen">
      <PageHeader
        backHref="/dashboard/scheduled"
        title="Compose New Email"
        actions={
          <>
            {sendAt && <span className="mr-1 text-xs text-ink-muted">Starts {formatBadgeTime(sendAt.toISOString())}</span>}
            <SendLaterPopover
              open={laterOpen}
              onOpenChange={setLaterOpen}
              value={sendAt}
              onChange={setSendAt}
              trigger={
                <IconButton aria-label="Send later" onClick={() => setLaterOpen((o) => !o)} className={sendAt ? 'text-brand-600' : undefined}>
                  <Clock className="h-[18px] w-[18px]" />
                </IconButton>
              }
            />
            <Button type="submit" variant="outline" loading={schedule.isPending} className="min-w-[100px]">
              {sendAt ? 'Send Later' : 'Send'}
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-[1088px] px-6 pb-16 pt-4">
        <div className="flex items-center gap-3 pb-2">
          <span className="w-14 shrink-0 text-sm text-ink">From</span>
          {sendersLoading ? (
            <Spinner className="h-4 w-4 text-ink-faint" />
          ) : (
            <SenderSelect senders={senders ?? []} value={activeSender} onChange={setSenderId} />
          )}
        </div>

        <Row label="To">
          <RecipientField value={recipients} onChange={setRecipients} />
        </Row>

        <Row label="Subject">
          <LineInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={998} />
        </Row>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3 text-sm text-ink">
          <label className="flex items-center gap-2.5">
            Delay between 2 emails
            <NumberBox value={delaySec} onChange={(e) => setDelaySec(e.target.value)} placeholder={String(minDelaySec).padStart(2, '0')} min={0} aria-describedby="delay-hint" />
            <span id="delay-hint" className="text-xs text-ink-faint">sec</span>
          </label>
          <label className="flex items-center gap-2.5">
            Hourly Limit
            <NumberBox value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)} placeholder={maxPerHour ? String(maxPerHour) : '00'} min={1} />
          </label>
          {maxPerHour && hourlyLimit !== '' && Number(hourlyLimit) > maxPerHour && (
            <span className="text-xs text-pending-text">The server caps each sender at {maxPerHour}/hour.</span>
          )}
        </div>

        <RichTextEditor onChange={setBody} />
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-2">
      <span className="flex h-8 w-14 shrink-0 items-center text-sm text-ink">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
