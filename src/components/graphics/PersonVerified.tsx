/**
 * Professional figure with verification badge — job seeker / verified talent.
 * Clean, minimal silhouette with small badge.
 */
interface PersonVerifiedProps {
  className?: string;
  size?: number;
}

export default function PersonVerified({ className = "", size = 80 }: PersonVerifiedProps) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden>
      <circle cx="40" cy="26" r="14" fill="currentColor" className="text-foreground/80" />
      <path
        d="M22 72c0-12 8-20 18-20s18 8 18 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-foreground/80"
      />
      <circle cx="58" cy="28" r="10" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="2" />
      <path d="M54 28l5 5 7-7" fill="none" stroke="hsl(var(--background))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
