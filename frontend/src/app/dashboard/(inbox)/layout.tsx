import { Suspense, type ReactNode } from 'react';
import { SearchBar } from '@/components/layout/SearchBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { SlackCallbackToast } from '@/components/layout/SlackCallbackToast';

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Suspense>
          <SearchBar />
          <SlackCallbackToast />
        </Suspense>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">{children}</div>
      </main>
    </div>
  );
}
