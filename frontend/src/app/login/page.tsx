'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, type FormEvent } from 'react';
import { toast } from 'sonner';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useMe } from '@/hooks/queries';

const ERRORS: Record<string, string> = {
  google_not_configured: 'Google login is not configured on the server yet.',
  invalid_state: 'Login session expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  no_profile: 'Google did not return a profile for this account.',
};

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: user, isLoading } = useMe();

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  useEffect(() => {
    const error = params.get('error');
    if (error) toast.error(ERRORS[error] ?? 'Sign-in failed.');
  }, [params]);

  if (isLoading || user) return <FullPageSpinner />;

  // Email/password is shown to match the design, but this app only supports Google sign-in.
  const onEmailLogin = (e: FormEvent) => {
    e.preventDefault();
    toast.info('Email login is not available. Please use “Login with Google”.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[496px] rounded-xl border border-line px-14 pb-[52px] pt-12">
        <h1 className="mb-7 text-center text-[36px] font-semibold leading-tight">Login</h1>

        <a
          href="/api/auth/google"
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg bg-brand-100 text-sm font-medium text-ink transition-colors hover:bg-brand-50"
        >
          <GoogleIcon className="h-4 w-4" />
          Login with Google
        </a>

        <div className="my-6 flex items-center gap-4 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onEmailLogin} className="space-y-3">
          <Input type="email" placeholder="Email ID" autoComplete="email" />
          <Input type="password" placeholder="Password" autoComplete="current-password" />
          <Button type="submit" size="lg" fullWidth className="!mt-[30px]">
            Login
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginCard />
    </Suspense>
  );
}
