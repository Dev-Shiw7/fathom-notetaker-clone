import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { NavLinks } from '@/components/shell/NavLinks';
import { CommandHint } from '@/components/shell/CommandHint';

export const metadata: Metadata = {
  title: 'Cadence — AI meeting notetaker',
  description:
    'Recordings, transcripts, AI summaries and speaker analytics for every meeting.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6 px-4 sm:px-6">
              <Link href="/" className="flex shrink-0 items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white"
                >
                  C
                </span>
                <span className="text-[15px] font-semibold tracking-tight">
                  Cadence
                </span>
              </Link>

              <NavLinks />

              <div className="ml-auto flex items-center gap-3">
                <CommandHint />
              </div>
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
