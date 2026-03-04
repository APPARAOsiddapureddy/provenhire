/**
 * Hero graphic showing ProvenHire's value proposition — why users need it, purpose, major benefits.
 * Replaces the checkmark seal with an ideology/value diagram: central hub + benefit nodes.
 * Communicates: Skill Passport, Verified Talent, 24hr cert, Fair Hiring, Faster hire, Zero cost.
 */
interface WhyProvenHireProps {
  className?: string;
  size?: number;
}

const BENEFITS = [
  { label: "Skill Passport", short: "Passport", angle: 0 },
  { label: "Verified Talent", short: "Verified", angle: 60 },
  { label: "24hr Cert", short: "24hr", angle: 120 },
  { label: "Fair Hiring", short: "Fair", angle: 180 },
  { label: "60% Faster", short: "Faster", angle: 240 },
  { label: "₹0 Cost", short: "₹0", angle: 300 },
];

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function WhyProvenHire({ className = "", size = 280 }: WhyProvenHireProps) {
  const cx = 140;
  const cy = 140;
  const innerR = 45;
  const outerR = 115;
  const nodeR = 34;

  return (
    <svg
      viewBox="0 0 280 280"
      width={size}
      height={size}
      className={className}
      aria-label="Why ProvenHire: Skill Passport, Verified Talent, 24hr certification, Fair Hiring, 60% faster hire, Zero cost"
      style={{ transform: "rotate(-3deg)" }}
    >
      <defs>
        <linearGradient id="whyph-gold-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8C96A" />
          <stop offset="40%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8962E" />
        </linearGradient>
        <linearGradient id="whyph-gold-subtle" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E5C65C" />
          <stop offset="100%" stopColor="#A68520" />
        </linearGradient>
        <linearGradient id="whyph-navy" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#162d47" />
          <stop offset="100%" stopColor="#0B1C2D" />
        </linearGradient>
        <linearGradient id="whyph-node-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a3a52" />
          <stop offset="100%" stopColor="#0f2940" />
        </linearGradient>
        <filter id="whyph-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#whyph-shadow)">
        {/* Outer gold ring */}
        <circle
          cx={cx}
          cy={cy}
          r={outerR + 6}
          fill="none"
          stroke="url(#whyph-gold-main)"
          strokeWidth="2"
          opacity="0.55"
        />
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="url(#whyph-gold-subtle)" strokeWidth="1" opacity="0.4" />

        {/* Connection lines hub → nodes */}
        {BENEFITS.map((b, i) => {
          const inner = polarToCartesian(cx, cy, innerR + 18, b.angle);
          const outer = polarToCartesian(cx, cy, outerR - nodeR - 6, b.angle);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="url(#whyph-gold-subtle)"
              strokeWidth="1.2"
              strokeOpacity="0.4"
            />
          );
        })}

        {/* Benefit nodes */}
        {BENEFITS.map((b, i) => {
          const pos = polarToCartesian(cx, cy, outerR - nodeR - 10, b.angle);
          return (
            <g key={i}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeR}
                fill="url(#whyph-node-fill)"
                stroke="url(#whyph-gold-subtle)"
                strokeWidth="1.5"
                strokeOpacity="0.65"
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#E8C96A"
                fontSize="12"
                fontWeight="700"
                fontFamily="var(--font-manrope), system-ui, sans-serif"
              >
                {b.short}
              </text>
            </g>
          );
        })}

        {/* Central hub — ProvenHire ideology */}
        <circle
          cx={cx}
          cy={cy}
          r={innerR + 14}
          fill="url(#whyph-navy)"
          stroke="url(#whyph-gold-main)"
          strokeWidth="2.5"
        />
        <circle
          cx={cx}
          cy={cy}
          r={innerR + 14}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          opacity="0.9"
        />
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fill="#E8C96A"
          fontSize="15"
          fontWeight="800"
          fontFamily="var(--font-bebas), system-ui, sans-serif"
          letterSpacing="1.5"
        >
          PROVENHIRE
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fill="rgba(255,255,255,0.75)"
          fontSize="10"
          fontWeight="600"
          fontFamily="var(--font-mono), monospace"
        >
          Proof over claims
        </text>
      </g>
    </svg>
  );
}
