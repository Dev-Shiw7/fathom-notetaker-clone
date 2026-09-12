import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { NavLinks } from '@/components/shell/NavLinks';
import { CommandHint } from '@/components/shell/CommandHint';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * globals.css asked for Inter but nothing ever loaded it, so every screen fell
 * back to the platform sans — which is why the type never matched the design
 * prototype. next/font self-hosts it and reserves metrics, so there is no
 * layout shift on load either.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Cadence — AI meeting notetaker',
  description:
    'Recordings, transcripts, AI summaries and speaker analytics for every meeting.',
};

/**
 * Applies the saved theme before first paint. Without this, a dark-theme user
 * gets a white flash on every navigation while React boots.
 */
const NO_FLASH_THEME = `
try {
  var t = localStorage.getItem('cadence-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      {/*
        h-dvh (not min-h-screen) because <body> is overflow:hidden and each
        pane scrolls itself. The page used to be a 56px header stacked on a
        100vh shell inside a clipped body, so the last 56px of every screen —
        including the bottom of the meeting list — was simply unreachable.
      */}
      <body className="h-dvh overflow-hidden">
        <ToastProvider>
          <div className="flex h-dvh flex-col">
            <header className="z-40 shrink-0 border-b border-[var(--border)] bg-[var(--bg-panel)]">
              <div className="flex h-14 w-full items-center gap-4 px-4 sm:px-5">
                <Link
                  href="/"
                  aria-label="Cadence home"
                  className="group flex shrink-0 items-center gap-2 rounded-lg"
                >
                  <span
                    aria-hidden
                    className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--accent-contrast)] shadow-[var(--shadow-sm)] transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
                  >
                    C
                  </span>
                  <span className="text-[15px] font-bold tracking-tight transition-colors group-hover:text-[var(--accent)]">
                    Cadence
                  </span>
                </Link>

                <NavLinks />

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <CommandHint />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            {/* min-h-0 lets this flex child actually shrink, which is what
                allows the panes inside it to own their own scrollbars.
                overflow-y-auto is for the ordinary document pages (Settings);
                the meeting workspace is exactly h-full and scrolls internally,
                so it never produces a scrollbar here. */}
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
