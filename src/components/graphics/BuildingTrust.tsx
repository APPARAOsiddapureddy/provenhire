/**
 * Building / company icon — employers, enterprise trust.
 */
interface BuildingTrustProps {
  className?: string;
  size?: number;
}

export default function BuildingTrust({ className = "", size = 80 }: BuildingTrustProps) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden>
      <path
        d="M16 68V28l24-12 24 12v40H16z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="text-primary"
      />
      <path d="M40 16v52M24 40h8M24 52h8M48 40h8M48 52h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary opacity-80" />
      <circle cx="40" cy="32" r="6" fill="currentColor" className="text-primary opacity-30" />
      <circle cx="40" cy="32" r="3" fill="hsl(var(--primary))" />
    </svg>
  );
}
