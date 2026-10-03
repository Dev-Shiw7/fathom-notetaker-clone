import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './globals.css';
import { TopBar } from '@/components/shell/TopBar';
import { GlobalSearch } from '@/components/shell/GlobalSearch';
import { ToastProvider } from '@/components/ui/Toast';
import { listMeetings } from '@/lib/data';

const sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

/** Display serif for headings, matching the landing page. */
const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-cormorant',
});

export const metadata: Metadata = {
  title: 'Recall — Stay in the room. Keep the rest.',
  description:
    'Recordings, transcripts, AI summaries and speaker analytics for every meeting.',
};

/**
 * Applies a chosen theme before first paint.
 *
 * Only "light" needs stamping: the stylesheet's bare :root is already the dark
 * palette, so a dark-by-default visitor has nothing to correct. Without this a
 * light-theme user gets a dark flash on every navigation while React boots.
 */
const NO_FLASH_THEME = `
try {
  var t = localStorage.getItem('recall-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The app bar's counter. Read here so it is the same number on every route
  // rather than something each page has to remember to pass up.
  const callCount = (await listMeetings()).length;

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      {/*
        h-dvh (not min-h-screen) because <body> is overflow:hidden and each
        pane scrolls itself. The page used to be a header stacked on a 100vh
        shell inside a clipped body, so the last 56px of every screen —
        including the bottom of the call list — was simply unreachable.
      */}
      <body className="h-dvh overflow-hidden">
        <ToastProvider>
          <div className="flex h-dvh flex-col">
            <TopBar callCount={callCount} />

            {/* min-h-0 lets this flex child actually shrink, which is what
                allows the panes inside it to own their own scrollbars.
                overflow-y-auto is for the ordinary document pages (Settings,
                a shared clip); the library and the call view are exactly
                h-full and scroll internally, so they never produce a
                scrollbar here. */}
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>

          <GlobalSearch />
        </ToastProvider>
      </body>
    </html>
  );
}
