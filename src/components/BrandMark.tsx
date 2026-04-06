import type { CSSProperties } from "react";

/** Canonical ProvenHire logo (`/public/logo.png`). Use everywhere we show the brand mark. */
export type BrandMarkVariant = "navbar" | "footer" | "hero" | "icon" | "admin";

const variantClass: Record<BrandMarkVariant, string> = {
  navbar:
    "h-8 w-8 sm:h-9 sm:w-9 object-contain shrink-0 rounded-md transition-transform duration-200 group-hover:scale-105",
  footer: "h-9 w-9 object-contain shrink-0 rounded-md",
  hero: "h-14 w-14 sm:h-16 sm:w-16 object-contain rounded-lg opacity-0 animate-fade-in-up animate-fill-forwards mb-6",
  icon: "h-8 w-8 object-contain shrink-0 rounded-md",
  admin: "h-12 w-12 sm:h-14 sm:w-14 object-contain shrink-0 rounded-md",
};

const variantSize: Record<BrandMarkVariant, number> = {
  navbar: 36,
  footer: 36,
  hero: 64,
  icon: 32,
  admin: 48,
};

export function BrandMark({
  variant = "navbar",
  className = "",
  style,
}: {
  variant?: BrandMarkVariant;
  className?: string;
  style?: CSSProperties;
}) {
  const w = variantSize[variant];
  return (
    <img
      src="/logo.png"
      alt=""
      width={w}
      height={w}
      decoding="async"
      loading={variant === "hero" ? "eager" : "lazy"}
      className={`${variantClass[variant]} ${className}`.trim()}
      style={style}
    />
  );
}
