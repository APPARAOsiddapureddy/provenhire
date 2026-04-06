import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { SEO_PAGE_BY_PATH, type SeoPageDef, type SeoBlock } from "@/data/seoArchitecture";
import { ArrowRight } from "lucide-react";

function InlineEmphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-foreground font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: SeoBlock[] }) {
  return (
    <div className="space-y-8 text-muted-foreground">
      {blocks.map((b, idx) => {
        if (b.type === "h2") {
          return (
            <h2 key={idx} className="text-2xl font-bold text-foreground scroll-mt-28">
              {b.text}
            </h2>
          );
        }
        if (b.type === "p") {
          return (
            <p key={idx} className="text-lg leading-relaxed">
              <InlineEmphasis text={b.text} />
            </p>
          );
        }
        return (
          <ul key={idx} className="list-disc pl-6 space-y-2 text-lg">
            {b.items.map((item) => (
              <li key={item}>
                <InlineEmphasis text={item} />
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

export default function SeoMarketingPage({ page }: { page: SeoPageDef }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title={page.title} description={page.description} path={page.path} />
      <Navbar />
      <main className="flex-1 pt-24 pb-20">
        <article className="container mx-auto px-4 max-w-3xl">
          <header className="mb-12">
            <p className="font-mono text-xs font-bold text-primary tracking-[2px] uppercase mb-3">ProvenHire</p>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight">{page.h1}</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">{page.heroSub}</p>
          </header>
          <Blocks blocks={page.blocks} />
          {page.related && page.related.length > 0 && (
            <nav className="mt-14 pt-10 border-t border-border" aria-label="Related pages">
              <h2 className="text-sm font-mono font-bold text-primary uppercase tracking-wider mb-4">Related</h2>
              <ul className="flex flex-col sm:flex-row flex-wrap gap-3">
                {page.related.map((r) => (
                  <li key={r.to}>
                    <Link to={r.to} className="text-primary hover:underline text-sm font-medium">
                      {r.label} →
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <Button size="lg" asChild className="bg-gradient-hero shadow-glow">
              <Link to="/auth?mode=signup">
                Get started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/for-recruiters">For recruiters</Link>
            </Button>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

export function SeoMarketingPageByPath({ path }: { path: string }) {
  const page = SEO_PAGE_BY_PATH[path];
  if (!page) return null;
  return <SeoMarketingPage page={page} />;
}
