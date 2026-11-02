import { Suspense } from 'react';
import { EmailList } from '@/components/emails/EmailList';

export default function SentPage() {
  return (
    <Suspense>
      <EmailList tab="sent" />
    </Suspense>
  );
}
