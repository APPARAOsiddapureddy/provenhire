import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingPageHero } from "@/components/MarketingPageHero";

const FEATURE_LINKS: { to: string; title: string; desc: string }[] = [
  { to: "/ai-interview-platform", title: "AI interview platform", desc: "Structured voice interviews with follow-ups." },
  { to: "/coding-assessment-platform", title: "Coding assessment platform", desc: "Execution-backed developer assessment." },
  { to: "/skill-verification", title: "Skill verification", desc: "Progressive proof across pipeline stages." },
  { to: "/candidate-analytics", title: "Candidate analytics", desc: "Scores and certification levels for recruiters." },
];

const RESOURCE_LINKS: { to: string; title: string; desc: string }[] = [
  { to: "/blog", title: "Blog", desc: "Clusters on hiring problems, careers, and comparisons." },
  { to: "/skill-based-hiring", title: "Skill-based hiring guide", desc: "Definitions, benefits, merit-based hiring." },
  { to: "/technical-hiring-guide", title: "Technical hiring guide", desc: "How to stack assessment + AI + expert." },
  { to: "/hiring-without-resume", title: "Hiring without resume", desc: "Employer playbook for evidence-first screens." },
];

const hubCardClass =
  "h-full border-2 border-primary/12 bg-card/45 backdrop-blur-sm hover:border-primary/45 hover:shadow-[0_0_28px_hsl(var(--gold)/0.08)] transition-all duration-300";

export function FeaturesHubPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Product Features | AI Interview & Coding Assessment | ProvenHire"
        description="Explore ProvenHire features: AI interview platform, coding assessment, skill verification, and candidate analytics."
        path="/features"
      />
      <Navbar />
      <MarketingPageHero
        eyebrow="Product"
        title={
          <>
            <span className="text-primary">Features</span>
            <span className="block text-white mt-1 md:mt-0 md:inline md:before:content-['\00a0']">that scale hiring</span>
          </>
        }
        subtitle="Explore each capability with the same verification standard—navy, gold, and proof-first messaging across ProvenHire."
      />
      <div className="marketing-content-band py-14 md:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10 text-sm md:text-base">
            Internal links connect resources, guides, and recruiter flows—aligned with the main site look and feel.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURE_LINKS.map((f) => (
              <Link key={f.to} to={f.to} className="block group">
                <Card className={hubCardClass}>
                  <CardHeader>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">{f.title}</CardTitle>
                    <CardDescription className="text-base text-muted-foreground">{f.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function ResourcesHubPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Resources | Hiring Guides & Blog | ProvenHire"
        description="Skill-based hiring guides, technical hiring content, and blog clusters for employers and candidates."
        path="/resources"
      />
      <Navbar />
      <MarketingPageHero
        eyebrow="Learn"
        title={
          <>
            Hiring <span className="text-primary">resources</span>
          </>
        }
        subtitle="Pillar pages and clusters for hiring teams and candidates—same deep navy shell and gold accents as the rest of ProvenHire."
      />
      <div className="marketing-content-band py-14 md:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10 text-sm md:text-base">
            Start from a guide or open the blog hub—every URL uses one verification story.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {RESOURCE_LINKS.map((f) => (
              <Link key={f.to} to={f.to} className="block group">
                <Card className={hubCardClass}>
                  <CardHeader>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">{f.title}</CardTitle>
                    <CardDescription className="text-base text-muted-foreground">{f.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
