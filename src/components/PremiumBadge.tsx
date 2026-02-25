/**
 * Premium badge: stylized "P" to indicate Premium job/role.
 * Gold accent, clear at small sizes, reads as "Premium" at a glance.
 */
export default function PremiumBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title="Premium"
      aria-label="Premium"
    >
      <span className="relative inline-flex h-7 w-8 min-w-[28px] items-center justify-center rounded-md bg-gradient-to-br from-amber-500/30 via-amber-500/20 to-amber-600/25 border border-amber-400/50 shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
        {/* Subtle highlight */}
        <span className="absolute inset-x-1 top-0.5 h-px rounded-full bg-amber-300/40" aria-hidden />
        <span
          className="relative text-[14px] font-extrabold tracking-tight leading-none drop-shadow-sm"
          style={{ fontFamily: "var(--font-manrope), sans-serif", color: "var(--accent-hex)", textShadow: "0 0 1px rgba(0,0,0,0.25)" }}
        >
          P
        </span>
      </span>
    </span>
  );
}
