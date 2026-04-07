import { Link } from "react-router-dom";

type BrandMarkProps = {
  /** Home path; use empty string and `as="div"` styling via className only when link not desired */
  to?: string;
  className?: string;
  /** Tailwind classes for the raster mark (transparent PNG) */
  logoClassName?: string;
  showWordmark?: boolean;
};

/**
 * ProvenHire brand lockup: shield PH mark + wordmark.
 * Raster comes from `public/logo.png` (see `scripts/make-transparent-logo.mjs` + `npm run generate:favicons`).
 */
export default function BrandMark({
  to = "/",
  className = "",
  logoClassName = "h-9 w-9 sm:h-10 sm:w-10 shrink-0 object-contain",
  showWordmark = true,
}: BrandMarkProps) {
  const wordmark = showWordmark ? (
    <span className="font-bebas text-[22px] sm:text-[26px] md:text-[28px] tracking-[2px] text-foreground leading-none truncate">
      Proven<span className="text-primary">Hire</span>
    </span>
  ) : null;

  const inner = (
    <>
      <img src="/logo.png" alt="" className={logoClassName} width={40} height={40} decoding="async" />
      {wordmark}
    </>
  );

  const wrap = `flex items-center gap-2 sm:gap-3 ${className}`;

  if (to) {
    return (
      <Link to={to} className={`${wrap} group shrink-0`} aria-label="ProvenHire home">
        {inner}
      </Link>
    );
  }

  return <span className={wrap}>{inner}</span>;
}
