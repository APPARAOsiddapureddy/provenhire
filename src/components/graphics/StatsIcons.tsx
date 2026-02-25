/**
 * Small icons for hero stats strip: layers (shield), clock, rupee.
 */
export function IconLayers({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} className={`shrink-0 ${className}`} aria-hidden>
      <path d="M16 4L4 10v4l12 6 12-6v-4L16 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 18l12 6 12-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.7" />
      <path d="M4 22l12 6 12-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

export function IconClock({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} className={`shrink-0 ${className}`} aria-hidden>
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 10v6l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconRupee({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} className={`shrink-0 ${className}`} aria-hidden>
      <path d="M8 6h16v2H8V6zm0 4h16l-6 8h4l-10 12-4-8h-4l2-4h4l-2-4H8v-4z" fill="currentColor" />
    </svg>
  );
}
