'use client';

import { useEffect, useRef } from 'react';
import { LANDING_MARKUP } from './markup';
import { initLanding } from './behavior';

/**
 * Mounts the landing markup and starts its behaviour.
 *
 * The cleanup restores the pristine markup as well as stopping the loop. React
 * Strict Mode runs effects twice in development, and the behaviour attaches
 * listeners to the nodes it finds; resetting the subtree guarantees the second
 * run binds to fresh nodes instead of stacking a second handler on the first.
 */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    const stop = initLanding();
    return () => {
      stop();
      if (node) node.innerHTML = LANDING_MARKUP;
    };
  }, []);

  return (
    <div
      ref={root}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: LANDING_MARKUP }}
    />
  );
}
