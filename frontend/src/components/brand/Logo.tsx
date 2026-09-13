/**
 * The Recap mark.
 *
 * A replay arc — three quarters of a circle, open at the top left — closing on
 * a play triangle. "Re-play", which is what a recap is.
 *
 * The gradient id is suffixed per instance. Two logos on one page (the app bar
 * and a page heading, say) would otherwise declare the same `<linearGradient
 * id>` twice, and the browser resolves `url(#…)` to whichever came first — so
 * removing the first from the DOM silently blanks the fill on the second.
 */
import { useId } from 'react';

interface Props {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 26, className = '' }: Props) {
  const id = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient
          id={id}
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path
        d="M16 6.5A9.5 9.5 0 1 1 6.5 16"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M6.5 10.2 10.6 15.6 2.4 15.6Z" fill="#ffffff" />
      <path d="M13.6 12.2v7.6l6.6-3.8-6.6-3.8Z" fill="#ffffff" />
    </svg>
  );
}
