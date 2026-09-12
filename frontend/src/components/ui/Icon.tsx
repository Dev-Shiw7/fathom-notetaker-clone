/**
 * The app's icon set.
 *
 * These replace the emoji that used to stand in for icons (🤖, ▶, 🔍, 👤, 📅).
 * Emoji render at a different size, weight and colour on every platform, ignore
 * `currentColor`, and sit on the text baseline rather than the optical centre —
 * so a row of them never aligns. These are 24×24 line icons on a common grid
 * that inherit colour and stroke from their button.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="4.5" width="3.6" height="15" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.9" y="4.5" width="3.6" height="15" rx="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Back10Icon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 4 6.5 8l4.5 4" />
      <path d="M6.5 8H14a5.5 5.5 0 1 1-5.5 5.5" />
    </Svg>
  );
}

export function Forward10Icon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m13 4 4.5 4-4.5 4" />
      <path d="M17.5 8H10a5.5 5.5 0 1 0 5.5 5.5" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4.5V8" />
      <circle cx="12" cy="3.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9 13v1.5M15 13v1.5" />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16.5 6.2a3.2 3.2 0 0 1 0 6.1M17.5 14.2a6 6 0 0 1 3 5.3" />
    </Svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M18.5 16.5 19.2 18.8 21.5 19.5 19.2 20.2 18.5 22.5 17.8 20.2 15.5 19.5 17.8 18.8 18.5 16.5Z" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8h.01" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.3A8.5 8.5 0 0 1 9.7 4a8.5 8.5 0 1 0 10.3 10.3Z" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function SpinnerIcon({ size = 16, className = '', ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={`animate-spin ${className}`}
      {...rest}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
