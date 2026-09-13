'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/ui/Icon';

/**
 * Light/dark switch.
 *
 * Dark is the product's own surface and the default on every device, so unlike
 * a document-shaped app this deliberately does *not* follow
 * `prefers-color-scheme`: a light-mode OS still gets the dark workspace until
 * someone asks for otherwise. Only an explicit choice is written to storage and
 * stamped onto <html data-theme>, which keeps the two states honest — there is
 * no third "guessed" state to get out of sync with the stylesheet.
 *
 * The matching no-flash script lives in the root layout; it must run before
 * first paint, which React cannot do.
 */
export const THEME_KEY = 'recap-theme';

type Choice = 'light' | 'dark' | null;

export function ThemeToggle() {
  // Server and first client render must agree, so we start unset and read the
  // real value in an effect — otherwise this hydrates with the wrong icon.
  const [choice, setChoice] = useState<Choice>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') setChoice(stored);
    } catch {
      // Private mode or blocked storage — the dark default is a fine fallback.
    }
  }, []);

  // Unset means dark, which is also what the stylesheet's bare :root says, so
  // the server render and this one agree without waiting for mount.
  const isDark = choice !== 'light';

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

  const label = `Switch to ${isDark ? 'light' : 'dark'} theme`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="appbar-action"
    >
      {isDark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}
