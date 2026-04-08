import { Link } from "react-router-dom";

type BrandMarkProps = {
  to?: string;
  className?: string;
  /** Tailwind classes for the text wordmark (typographic logo — no raster). */
  wordmarkClassName?: string;
  showWordmark?: boolean;
  /** @deprecated No image mark; use `wordmarkClassName` only. Ignored. */
  logoClassName?: string;
};

/**
 * ProvenHire brand: typographic wordmark only (no logo image in-app).
 */
export default function BrandMark({
  to = "/",
  className = "",
  wordmarkClassName = "font-bebas text-[22px] sm:text-[26px] md:text-[28px] tracking-[2px] text-foreground leading-none truncate",
  showWordmark = true,
}: BrandMarkProps) {
  const wordmark = showWordmark ? (
    <span className={wordmarkClassName}>
      Proven<span className="text-primary">Hire</span>
    </span>
  ) : null;

  const wrap = `flex items-center gap-2 sm:gap-3 ${className}`;

  if (to) {
    return (
      <Link to={to} className={`${wrap} group shrink-0`} aria-label="ProvenHire home">
        {wordmark}
      </Link>
    );
  }

  return <span className={wrap}>{wordmark}</span>;
}
