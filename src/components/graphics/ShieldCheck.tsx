/**
 * Shield with checkmark — security, anti-cheat, trust.
 */
interface ShieldCheckProps {
  className?: string;
  size?: number;
}

export default function ShieldCheck({ className = "", size = 80 }: ShieldCheckProps) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden>
      <path
        d="M40 8L12 20v18c0 18 12 28 28 34 16-6 28-16 28-34V20L40 8z"
        fill="currentColor"
        className="text-primary opacity-20"
      />
      <path
        d="M40 8L12 20v18c0 18 12 28 28 34 16-6 28-16 28-34V20L40 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="text-primary"
      />
      <path
        d="M32 42l8 8 16-16"
        fill="none"
        stroke="hsl(var(--success))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
