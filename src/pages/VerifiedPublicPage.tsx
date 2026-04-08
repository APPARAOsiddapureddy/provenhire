import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";

type VerifiedSkillPublic = { skill?: string; confidence?: number };

type PublicVerifiedPayload = {
  handle: string;
  name: string | null;
  certificationLevel: string;
  certificationDate: string | null;
  targetRole: string | null;
  experienceLevel: string;
  verificationDate: string | null;
  verifiedSkills: VerifiedSkillPublic[];
  ctaUrl: string;
  message?: string;
};

export default function VerifiedPublicPage() {
  const { handle } = useParams<{ handle: string }>();
  const [data, setData] = useState<PublicVerifiedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) {
      setLoading(false);
      setError("Invalid link");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/verified/${encodeURIComponent(handle)}`);
        const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<PublicVerifiedPayload>;
        if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Profile not found");
        if (!cancelled) setData(body as PublicVerifiedPayload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const titleName = data?.name?.trim() || "Verified candidate";

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={`${titleName} — ProvenHire verified profile`}
        description="Verified skills and certification on ProvenHire. Evidence-based hiring."
        path={handle ? `/verified/${handle}` : "/verified"}
      />
      <Navbar />

      <div className="flex-1 pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-2xl">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Loading verified profile…</p>
            </div>
          )}

          {!loading && error && (
            <Card className="border-destructive/30">
              <CardContent className="pt-8 pb-8 text-center">
                <p className="text-lg font-medium mb-2">Profile unavailable</p>
                <p className="text-muted-foreground mb-6">{error}</p>
                <Button asChild variant="outline">
                  <Link to="/">Back to home</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && data && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-3">
                <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {data.certificationLevel && data.certificationLevel !== "L0"
                    ? `ProvenHire ${data.certificationLevel}`
                    : "ProvenHire verification in progress"}
                </Badge>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{data.name || "Verified candidate"}</h1>
                <p className="text-muted-foreground text-lg">
                  {[data.targetRole, data.experienceLevel].filter(Boolean).join(" · ")}
                </p>
                {(() => {
                  const raw = data.verificationDate || data.certificationDate;
                  const t = raw ? Date.parse(raw) : NaN;
                  if (!Number.isFinite(t)) return null;
                  return (
                    <p className="text-sm text-muted-foreground">
                      Verified{" "}
                      {new Date(t).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  );
                })()}
              </div>

              <Card className="border-2 border-primary/15 shadow-sm">
                <CardContent className="pt-6 space-y-5">
                  <h2 className="text-lg font-semibold">Verified skills (preview)</h2>
                  {data.verifiedSkills.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Verified skills will appear here after skill assessment.</p>
                  ) : (
                    <ul className="space-y-4">
                      {data.verifiedSkills.slice(0, 5).map((s, i) => {
                        const label = typeof s.skill === "string" ? s.skill : "Skill";
                        const conf = typeof s.confidence === "number" ? Math.max(0, Math.min(100, s.confidence)) : null;
                        return (
                          <li key={`${label}-${i}`} className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{label}</span>
                              {conf != null && <span className="text-muted-foreground tabular-nums">{conf}%</span>}
                            </div>
                            {conf != null && (
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-hero transition-all"
                                  style={{ width: `${conf}%` }}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {data.message || "View the full verified profile, projects, and assessments on ProvenHire."}
                </p>
                <Button asChild size="lg" className="shadow-glow">
                  <a href={data.ctaUrl || "/"}>View full verified profile on ProvenHire</a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
