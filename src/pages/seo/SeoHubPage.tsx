import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export function FeaturesHubPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Product Features | AI Interview & Coding Assessment | ProvenHire"
        description="Explore ProvenHire features: AI interview platform, coding assessment, skill verification, and candidate analytics."
        path="/features"
      />
      <Navbar />
      <main className="flex-1 pt-24 pb-20 container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Features</h1>
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl">
          High-intent SEO pages for each capability. Internal links flow from resources and use-case pages.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {FEATURE_LINKS.map((f) => (
            <Link key={f.to} to={f.to}>
              <Card className="h-full border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <CardTitle className="text-xl">{f.title}</CardTitle>
                  <CardDescription className="text-base">{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </main>
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
      <main className="flex-1 pt-24 pb-20 container mx-auto px-4 max-w-5xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Resources</h1>
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl">
          Pillar content and blog clusters to scale organic traffic. Link from features and use-case pages.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {RESOURCE_LINKS.map((f) => (
            <Link key={f.to} to={f.to}>
              <Card className="h-full border-2 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <CardTitle className="text-xl">{f.title}</CardTitle>
                  <CardDescription className="text-base">{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
