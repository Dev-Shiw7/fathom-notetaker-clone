import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './landing.css';

/**
 * The landing page is its own root layout, separate from the app's.
 *
 * Both surfaces define short, generic class names (.btn, .tile, .chip, .cell…)
 * with different meanings. Giving each its own <html> means each ships only
 * its own stylesheet, so neither can restyle the other; the cost is a full
 * page load when moving between them, which is a natural boundary here anyway.
 */
const sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
  axes: ['opsz'],
});

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
    'Recall is a video and audio memory for the conversations that matter. It listens closely, so you can be fully there.',
};

export const viewport: Viewport = {
  themeColor: '#14100e',
  viewportFit: 'cover',
};

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
