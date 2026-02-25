/**
 * Target with checkmark — verification / goal achieved.
 * For "How it works", verification pipeline, and success states.
 */
interface TargetVerifiedProps {
  className?: string;
  size?: number;
}

export default function TargetVerified({ className = "", size = 80 }: TargetVerifiedProps) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden>
      <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary opacity-90" />
      <circle cx="40" cy="40" r="26" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary opacity-70" />
      <circle cx="40" cy="40" r="14" fill="currentColor" className="text-primary opacity-50" />
      <path
        d="M32 40l6 6 12-14"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
