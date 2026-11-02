'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { FullPageSpinner } from '@/components/ui/Spinner';

/** Post-login landing (/dashboard, maybe with ?slack=...): forward to the Scheduled tab, keeping the query. */
function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const qs = params.toString();
    router.replace(`/dashboard/scheduled${qs ? `?${qs}` : ''}`);
  }, [params, router]);
  return <FullPageSpinner />;
}

export default function DashboardIndex() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Redirect />
    </Suspense>
  );
}
