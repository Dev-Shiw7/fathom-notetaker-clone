'use client';

import { useEffect, useState } from 'react';

/** Visible time before the fade starts, and the fade itself (ms). */
const HOLD_MS = 1600;
const FADE_MS = 400;

/**
 * Set once the splash has played in this page load, so moving back to the
 * landing page from inside the app (a client-side navigation) does not replay
 * it. A full page load starts the module afresh, so opening the app always
 * shows it.
 */
let played = false;

/**
 * The first thing a visitor sees: the Recall mark animating in for about two
 * seconds, then fading into the landing page underneath.
 *
 * It is rendered into the server HTML on purpose. If it only appeared after
 * hydration, the landing page would flash for a moment first. The landing's own
 * entrance animation waits for the `recall:splash-done` event so it is not
 * played out unseen behind this overlay.
 */
export function Splash() {
  const [phase, setPhase] = useState<'show' | 'leaving' | 'gone'>('show');

  useEffect(() => {
    const root = document.documentElement;
    if (played) {
      setPhase('gone');
      return;
    }
    root.dataset.splash = 'on';
    const leave = setTimeout(() => setPhase('leaving'), HOLD_MS);
    const done = setTimeout(() => {
      played = true;
      delete root.dataset.splash;
      setPhase('gone');
      window.dispatchEvent(new Event('recall:splash-done'));
    }, HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
      // Strict Mode runs this effect twice in development; leave no stale flag.
      if (!played) delete root.dataset.splash;
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div className={`splash ${phase === 'leaving' ? 'is-leaving' : ''}`} role="status" aria-label="Recall is loading">
      <noscript>
        <style>{'.splash{display:none!important}'}</style>
      </noscript>
      <div className="splash-glow" aria-hidden />
      <div className="splash-logo">
        <svg className="splash-mark" viewBox="0 0 120 120" aria-hidden>
          <circle className="splash-ring" cx="60" cy="60" r="46" />
          <circle className="splash-wave w1" cx="60" cy="60" r="46" />
          <circle className="splash-wave w2" cx="60" cy="60" r="46" />
          <circle className="splash-dot" cx="60" cy="60" r="13" />
        </svg>
        <div className="splash-word" aria-hidden>
          {'RECALL'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.55 + i * 0.07}s` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="splash-tag">Stay in the room. Keep the rest.</p>
      </div>
    </div>
  );
}
