import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingPageHero } from "@/components/MarketingPageHero";

const CLUSTERS = [
  {
    title: "Hiring problems",
    items: [
      { label: "Why resumes fail → skill verification", to: "/skill-verification" },
      { label: "Hiring mistakes startups make", to: "/startup-hiring" },
      { label: "No-resume hiring", to: "/no-resume-hiring" },
    ],
  },
  {
    title: "Career growth",
    items: [
      { label: "Get hired without a resume", to: "/get-hired-without-resume" },
      { label: "Prove your skills", to: "/prove-your-skills" },
      { label: "For job seekers", to: "/for-job-seekers" },
    ],
  },
  {
    title: "Comparisons & moats",
    items: [
      { label: "Coding assessment vs legacy platforms", to: "/coding-assessment-platform" },
      { label: "AI interview depth", to: "/ai-interview-platform" },
      { label: "Skill-based hiring guide", to: "/skill-based-hiring" },
    ],
  },
];

const clusterCardClass =
  "border-2 border-primary/12 bg-card/45 backdrop-blur-sm hover:border-primary/45 hover:shadow-[0_0_24px_hsl(var(--gold)/0.07)] transition-all duration-300";

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Blog & Guides | ProvenHire Hiring & Career Resources"
        description="Hiring without resumes, skill-based hiring, career growth, and product comparisons—pillar pages and clusters."
        path="/blog"
      />
      <Navbar />
      <MarketingPageHero
        eyebrow="Content"
        title={
          <>
            Blog &amp; <span className="text-primary">clusters</span>
          </>
        }
        subtitle="Pillar URLs are live today. Long-form articles can ship on these slugs without changing routes—styled like the rest of the product."
      />
      <div className="marketing-content-band py-14 md:py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-12">
            {CLUSTERS.map((c) => (
              <section key={c.title}>
                <h2 className="text-sm font-mono font-bold text-primary uppercase tracking-wider mb-5">{c.title}</h2>
                <div className="grid sm:grid-cols-1 gap-3">
                  {c.items.map((item) => (
                    <Link key={item.to} to={item.to} className="block group">
                      <Card className={clusterCardClass}>
                        <CardHeader className="py-4">
                          <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                            {item.label}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono opacity-70">{item.to}</CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
