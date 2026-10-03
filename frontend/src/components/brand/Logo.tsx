/**
 * The Recall mark: a ring with an ember dot, the same one the landing page
 * pulses to say "listening".
 */
interface Props {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 26, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle
        cx="16"
        cy="16"
        r="14.5"
        fill="none"
        stroke="var(--brand-from)"
        strokeOpacity="0.65"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="16" r="4.6" fill="var(--brand-from)" />
    </svg>
  );
}
