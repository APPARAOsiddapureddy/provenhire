/**
 * Graphic: Interviewer conducting interview with candidate.
 * Clearly conveys "you conduct the interview" — for Careers page.
 */
interface InterviewerConductingProps {
  className?: string;
  size?: number;
}

export default function InterviewerConducting({ className = "", size = 160 }: InterviewerConductingProps) {
  return (
    <svg viewBox="0 0 200 120" width={size} height={size * 0.6} className={className} aria-hidden>
      {/* Interviewer (left) - person with clipboard/notes - the one conducting */}
      <circle cx="50" cy="45" r="18" fill="hsl(var(--primary))" className="opacity-90" />
      <circle cx="50" cy="42" r="6" fill="hsl(var(--primary-foreground))" />
      <path d="M35 75 Q50 85 65 75" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
      <rect x="42" y="55" width="16" height="22" rx="2" fill="hsl(var(--primary))" className="opacity-80" />
      <line x1="46" y1="62" x2="54" y2="62" stroke="hsl(var(--primary-foreground))" strokeWidth="1" opacity="0.5" />
      <line x1="46" y1="66" x2="52" y2="66" stroke="hsl(var(--primary-foreground))" strokeWidth="1" opacity="0.5" />

      {/* Speech / connection line */}
      <path d="M68 50 Q95 50 95 55 Q95 58 132 58" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="4 3" className="opacity-60" />

      {/* Candidate (right) - being interviewed */}
      <circle cx="150" cy="45" r="16" fill="hsl(var(--muted-foreground))" className="opacity-70" />
      <circle cx="150" cy="42" r="5" fill="hsl(var(--background))" />
      <path d="M135 72 Q150 82 165 72" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="3" strokeLinecap="round" className="opacity-70" />
      <rect x="145" y="58" width="10" height="16" rx="1" fill="hsl(var(--muted-foreground))" className="opacity-50" />

      {/* Video call frame */}
      <rect x="10" y="10" width="180" height="95" rx="8" fill="none" stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="6 4" className="opacity-50" />
    </svg>
  );
}
