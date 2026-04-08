import { Navigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { MarketingPageHero } from "@/components/MarketingPageHero";
import { PROGRAMMATIC_JOB_PAGES, PROGRAMMATIC_SKILL_PAGES } from "@/data/seoArchitecture";
import { ArrowRight } from "lucide-react";

type Mode = "job" | "skill";

export function ProgrammaticJobSlugRoute() {
  const { seoSlug = "" } = useParams();
  return <ProgrammaticSeoPage mode="job" slug={seoSlug} />;
}

export function ProgrammaticSkillSlugRoute() {
  const { skillSlug = "" } = useParams();
  return <ProgrammaticSeoPage mode="skill" slug={skillSlug} />;
}

export default function ProgrammaticSeoPage({ mode, slug }: { mode: Mode; slug: string }) {
  if (mode === "job") {
    const def = PROGRAMMATIC_JOB_PAGES[slug];
    if (!def) return <Navigate to="/jobs" replace />;
    return (
      <div className="min-h-screen flex flex-col">
        <SEO title={def.title} description={def.description} path={`/jobs/${slug}`} />
        <Navbar />
        <MarketingPageHero eyebrow="Programmatic · Jobs" title={def.h1} subtitle={def.heroSub} />
        <div className="marketing-content-band">
          <div className="container mx-auto px-4 max-w-3xl py-12 md:py-14">
            <p className="text-muted-foreground mb-8 leading-relaxed text-lg">
              Browse live openings and candidates in the main directory. This URL targets long-tail hiring intent (
              <span className="text-foreground/90">{def.keywords}</span>) while keeping one consistent verification
              standard across roles.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild className="btn-primary shadow-glow">
                <Link to="/jobs">
                  Open job directory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild className="border-primary/30 hover:bg-primary/10">
                <Link to="/for-recruiters">Employers &amp; recruiters</Link>
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const def = PROGRAMMATIC_SKILL_PAGES[slug];
  if (!def) return <Navigate to="/jobs" replace />;
  return (
    <div className="min-h-screen flex flex-col">
      <SEO title={def.title} description={def.description} path={`/skills/${slug}`} />
      <Navbar />
      <MarketingPageHero eyebrow="Programmatic · Skills" title={def.h1} subtitle={def.heroSub} />
      <div className="marketing-content-band">
        <div className="container mx-auto px-4 max-w-3xl py-12 md:py-14">
          <div className="flex flex-wrap gap-4">
            <Button asChild className="btn-primary shadow-glow">
              <Link to="/jobs">
                Browse jobs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild className="border-primary/30 hover:bg-primary/10">
              <Link to="/skill-verification">Skill verification</Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
