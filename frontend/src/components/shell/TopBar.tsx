'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { SearchField } from './SearchField';
import { ThemeToggle } from './ThemeToggle';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  GiftIcon,
  LifebuoyIcon,
  PaletteIcon,
  SettingsIcon,
  StarIcon,
} from '@/components/ui/Icon';

interface Props {
  /** Calls captured so far — what the star pill counts. */
  callCount: number;
}

/**
 * The app bar.
 *
 * Present on every route, and the only chrome that is: brand, global AI
 * search, and account-level actions. There is no sign-in here by design — the
 * workspace is open, so an account menu would be a control with nothing behind
 * it.
 */
export function TopBar({ callCount }: Props) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <Link href="/" aria-label="Recap home" className="brand">
          <LogoMark size={26} className="brand-mark" />
          <span className="brand-name">Recap</span>
        </Link>

        <SearchField />

        <div className="ml-auto flex items-center gap-1">
          <ReferButton />

          <Link
            href="/settings"
            className="appbar-action"
            title="Calendar connections and the capture queue"
          >
            <SettingsIcon size={16} />
            <span className="hidden md:inline">Settings</span>
          </Link>

          <HelpMenu />

          <ThemeToggle />

          <span
            className="points-pill"
            title={`${callCount} ${callCount === 1 ? 'call' : 'calls'} captured in this workspace`}
          >
            <StarIcon size={13} />
            {callCount}
          </span>

          {/* The workspace has no accounts, so this identifies the workspace
              rather than pretending to be a signed-in user's avatar. */}
          <span className="avatar-btn" aria-hidden title="Recap workspace">
            R
          </span>
        </div>
      </div>
    </header>
  );
}

function ReferButton() {
  const { toast } = useToast();

  return (
    <button
      type="button"
      className="appbar-action"
      onClick={() =>
        toast(
          'Referrals are part of hosted Recap — this build has no accounts to refer anyone to.',
          'info',
          5000,
        )
      }
    >
      <GiftIcon size={16} />
      <span className="hidden lg:inline">Refer</span>
    </button>
  );
}

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  // Close on an outside click or Escape. Without the pointerdown listener the
  // popover survives every click elsewhere on the page, which reads as stuck.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="appbar-action"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <LifebuoyIcon size={16} />
        <span className="hidden lg:inline">Help &amp; Feedback</span>
      </button>

      {open && (
        <div className="popover dialog-enter" role="menu">
          <Link
            href="/settings"
            role="menuitem"
            className="popover-item"
            onClick={() => setOpen(false)}
          >
            <CalendarIcon size={15} />
            Calendar &amp; bot
          </Link>
          <Link
            href="/design"
            role="menuitem"
            className="popover-item"
            onClick={() => setOpen(false)}
          >
            <PaletteIcon size={15} />
            Design system
          </Link>
          <button
            type="button"
            role="menuitem"
            className="popover-item"
            onClick={() => {
              setOpen(false);
              toast(
                'Shortcuts — ⌘K or / to search, Space to play/pause, ← → to scrub 5s.',
                'info',
                7000,
              );
            }}
          >
            <LifebuoyIcon size={15} />
            Keyboard shortcuts
          </button>
        </div>
      )}
    </div>
  );
}
