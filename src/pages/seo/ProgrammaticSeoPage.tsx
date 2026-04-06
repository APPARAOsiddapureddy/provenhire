import { Navigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import {
  PROGRAMMATIC_JOB_PAGES,
  PROGRAMMATIC_SKILL_PAGES,
} from "@/data/seoArchitecture";
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
        <main className="flex-1 pt-24 pb-20 container mx-auto px-4 max-w-3xl">
          <p className="font-mono text-xs font-bold text-primary uppercase tracking-wider mb-2">Programmatic / jobs</p>
          <h1 className="text-4xl font-bold mb-6">{def.h1}</h1>
          <p className="text-xl text-muted-foreground mb-8">{def.heroSub}</p>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Browse live openings and candidates in the main directory. This URL targets long-tail hiring intent (
            <span className="text-foreground/90">{def.keywords}</span>) while keeping one consistent verification
            standard across roles.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild className="bg-gradient-hero">
              <Link to="/jobs">
                Open job directory
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/for-recruiters">For recruiters</Link>
            </Button>
          </div>
        </main>
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
      <main className="flex-1 pt-24 pb-20 container mx-auto px-4 max-w-3xl">
        <p className="font-mono text-xs font-bold text-primary uppercase tracking-wider mb-2">Programmatic / skills</p>
        <h1 className="text-4xl font-bold mb-6">{def.h1}</h1>
        <p className="text-xl text-muted-foreground mb-8">{def.heroSub}</p>
        <div className="flex flex-wrap gap-4">
          <Button asChild className="bg-gradient-hero">
            <Link to="/jobs">
              Browse jobs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/skill-verification">Skill verification</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
