import type { Metadata } from 'next';
import { Inter, Silkscreen } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const logoFont = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-logo' });

export const metadata: Metadata = {
  title: 'ReachInbox Scheduler',
  description: 'Schedule and track outbound emails',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${logoFont.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
