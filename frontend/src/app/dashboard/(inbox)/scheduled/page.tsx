import { Suspense } from 'react';
import { EmailList } from '@/components/emails/EmailList';

export default function ScheduledPage() {
  return (
    <Suspense>
      <EmailList tab="scheduled" />
    </Suspense>
  );
}
