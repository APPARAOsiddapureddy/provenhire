import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Blog & Guides | ProvenHire Hiring & Career Resources"
        description="Hiring without resumes, skill-based hiring, career growth, and product comparisons—pillar pages and clusters."
        path="/blog"
      />
      <Navbar />
      <main className="flex-1 pt-24 pb-20 container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Blog & content clusters</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Pillar URLs are live today. Long-form articles can be added as MDX or CMS posts on these slugs without changing routes.
        </p>
        <div className="space-y-10">
          {CLUSTERS.map((c) => (
            <section key={c.title}>
              <h2 className="text-2xl font-bold mb-4">{c.title}</h2>
              <div className="grid sm:grid-cols-1 gap-3">
                {c.items.map((item) => (
                  <Link key={item.to} to={item.to}>
                    <Card className="border hover:border-primary/40 transition-colors">
                      <CardHeader className="py-4">
                        <CardTitle className="text-base font-semibold">{item.label}</CardTitle>
                        <CardDescription className="text-xs opacity-70">{item.to}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
