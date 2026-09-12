'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/ui/Icon';

/**
 * Light/dark switch.
 *
 * Three states matter, not two: "light", "dark", and *unset* — which follows
 * the OS and is the default. Only an explicit choice is written to storage and
 * stamped onto <html data-theme>, so someone who has never touched this button
 * keeps tracking their system setting rather than being frozen into whatever
 * the page guessed on first load.
 *
 * The matching no-flash script lives in the root layout; it must run before
 * first paint, which React cannot do.
 */
export const THEME_KEY = 'cadence-theme';

type Choice = 'light' | 'dark' | null;

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function ThemeToggle() {
  // Server and first client render must agree, so we start unset and read the
  // real value in an effect — otherwise this hydrates with the wrong icon.
  const [choice, setChoice] = useState<Choice>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') setChoice(stored);
    } catch {
      // Private mode or blocked storage — following the OS is a fine fallback.
    }
  }, []);

  const isDark = choice ? choice === 'dark' : mounted && systemPrefersDark();

  function toggle() {
    const next: 'light' | 'dark' = isDark ? 'light' : 'dark';
    setChoice(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Non-fatal: the choice simply will not survive a reload.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Until mounted we do not know the real theme, so do not announce one.
      aria-label={
        mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'
      }
      title={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-muted)] transition duration-150 hover:-translate-y-px hover:border-[var(--border-strong)] hover:text-[var(--text)] hover:shadow-[var(--shadow-md)] active:translate-y-0 active:scale-95"
    >
      {/* suppressHydrationWarning: the icon depends on OS preference, which the
          server cannot know. The wrapper is stable; only the glyph swaps. */}
      <span suppressHydrationWarning>
        {isDark ? <MoonIcon size={15} /> : <SunIcon size={15} />}
      </span>
    </button>
  );
}
