'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useMe } from '@/hooks/queries';

/** Everything under /dashboard requires a signed-in user. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useMe();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isLoading || !user) return <FullPageSpinner />;
  return <>{children}</>;
}
