/**
 * Premium 3D verification seal for hero — scalloped gold edge, navy ring + checkmark.
 * Matches reference: metallic gold (#D4AF37), deep navy (#0B1C2D), soft lighting, depth.
 */
interface HeroBadgeProps {
  className?: string;
  size?: number;
}

function scallopedRadius(angleDeg: number): number {
  const n = 12;
  const base = 90;
  const amp = 6;
  return base + amp * Math.cos((angleDeg * Math.PI) / 180 * n);
}

function point(angleDeg: number) {
  const r = scallopedRadius(angleDeg);
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 100 + r * Math.cos(rad), y: 100 - r * Math.sin(rad) };
}

export default function HeroBadge({ className = "", size = 280 }: HeroBadgeProps) {
  const pts: string[] = [];
  for (let i = 0; i <= 360; i += 6) {
    const p = point(i);
    pts.push(`${p.x},${p.y}`);
  }
  const scallopedPath = `M ${pts.join(" L ")} Z`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ transform: "rotate(-5deg)" }}
    >
      <defs>
        {/* Metallic gold — light from upper-left, highlight and shadow */}
        <linearGradient id="hero-badge-gold-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8C96A" />
          <stop offset="25%" stopColor="#D4AF37" />
          <stop offset="50%" stopColor="#C9A227" />
          <stop offset="75%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8962E" />
        </linearGradient>
        <linearGradient id="hero-badge-gold-top" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F0D875" />
          <stop offset="40%" stopColor="transparent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-badge-gold-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E5C65C" />
          <stop offset="100%" stopColor="#A68520" />
        </linearGradient>
        <linearGradient id="hero-badge-inner" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#122d45" />
          <stop offset="100%" stopColor="#0B1C2D" />
        </linearGradient>
        <filter id="hero-badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000" floodOpacity="0.4" />
        </filter>
        <filter id="hero-badge-inner-shadow">
          <feOffset in="SourceAlpha" dx="0" dy="2" />
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <g filter="url(#hero-badge-shadow)">
        {/* Scalloped outer edge — metallic gold */}
        <path
          d={scallopedPath}
          fill="url(#hero-badge-gold-main)"
          stroke="url(#hero-badge-gold-edge)"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        {/* Top highlight overlay for 3D sheen */}
        <path
          d={scallopedPath}
          fill="url(#hero-badge-gold-top)"
          opacity="0.5"
        />
        {/* Inner flat gold disk (under the navy ring) */}
        <circle
          cx="100"
          cy="100"
          r="70"
          fill="#C9A227"
          opacity="0.3"
        />
        {/* Navy inner ring — raised, with subtle edge */}
        <circle
          cx="100"
          cy="100"
          r="68"
          fill="url(#hero-badge-inner)"
          stroke="#0B1C2D"
          strokeWidth="2"
        />
        <circle
          cx="100"
          cy="100"
          r="68"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
          opacity="0.8"
        />
        {/* Checkmark — deep navy, crisp */}
        <path
          d="M 72 100 L 88 116 L 132 72"
          fill="none"
          stroke="#0B1C2D"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Checkmark slight highlight for depth */}
        <path
          d="M 75 98 L 90 113 L 130 73"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
