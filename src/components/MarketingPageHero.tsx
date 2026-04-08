import type { ReactNode } from "react";

export type MarketingPageHeroProps = {
  /** Small label above title (mono + gold). */
  eyebrow?: string;
  /** Main headline — use spans with `text-primary` for gold accents. */
  title: ReactNode;
  subtitle?: string;
};

/**
 * Navy + gold hero band aligned with the homepage hero so SEO/hub pages share the same palette.
 */
export function MarketingPageHero({ eyebrow = "ProvenHire", title, subtitle }: MarketingPageHeroProps) {
  return (
    <header className="marketing-hero-strip relative text-center">
      <div className="marketing-hero-overlay" aria-hidden />
      <div className="container mx-auto px-4 relative z-10 max-w-4xl xl:max-w-5xl pt-4 pb-1 md:pb-2">
        <p className="inline-flex items-center justify-center gap-2 font-mono text-[11px] sm:text-xs font-extrabold text-primary tracking-[2px] uppercase mb-5 px-3 py-1.5 rounded-md bg-primary/15 border border-primary/25">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1FA971] shrink-0" aria-hidden />
          {eyebrow}
        </p>
        <h1 className="font-bebas text-[clamp(1.85rem,5.5vw,3.5rem)] tracking-[0.08em] text-foreground leading-[1.02] mb-5 md:mb-6 max-w-4xl mx-auto">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-base sm:text-lg md:text-xl text-white/75 max-w-2xl mx-auto leading-relaxed font-medium">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
