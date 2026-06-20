/**
 * Recruiter-facing candidate profile: ProvenHire Resume (PRD) + legacy profile card actions.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import CandidateProfileView, { type CandidateProfileViewProfile } from "@/components/CandidateProfileView";
import { RecruiterProvenhireResumePanel, type ProvenhireResumeRecruiterShape } from "@/components/recruiter/RecruiterProvenhireResumePanel";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function CandidateProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="sticky top-0 z-50 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="container flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-7 w-36 rounded-full" />
        </div>
      </div>
      <div className="container max-w-3xl space-y-6 py-6">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

function CandidateResumePanelSkeleton() {
  return (
    <div className="mb-6 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}

const CandidateProfilePage = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const matchRaw = searchParams.get("match");
  const matchPercent =
    matchRaw != null && matchRaw !== "" && Number.isFinite(Number.parseInt(matchRaw, 10))
      ? Number.parseInt(matchRaw, 10)
      : null;

  const { toast } = useToast();
  const [profile, setProfile] = useState<CandidateProfileViewProfile | null>(null);
  const [resume, setResume] = useState<ProvenhireResumeRecruiterShape | null>(null);
  const [resumeBlocked, setResumeBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingResume, setLoadingResume] = useState(true);
  const [recruiterNote, setRecruiterNote] = useState("");
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [classicOpen, setClassicOpen] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    api
      .get<{ profile: CandidateProfileViewProfile }>(`/api/users/candidates/${profileId}`)
      .then((r) => setProfile(r.profile))
      .catch(() => toast({ title: "Failed to load profile", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [profileId, toast]);

  useEffect(() => {
    if (!profileId) return;
    setLoadingResume(true);
    setResumeBlocked(false);
    api
      .get<{ resume: ProvenhireResumeRecruiterShape }>(`/api/users/candidates/${profileId}/resume`)
      .then((r) => setResume(r.resume))
      .catch((e: Error & { status?: number }) => {
        setResume(null);
        if (e.status === 402) {
          setResumeBlocked(true);
          toast({
            title: "Profile view limit reached",
            description: "Upgrade your plan for more full ProvenHire Resume views this month.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Could not load ProvenHire Resume", variant: "destructive" });
        }
      })
      .finally(() => setLoadingResume(false));
  }, [profileId, toast]);

  useEffect(() => {
    if (!jobId) {
      setJobTitle(null);
      return;
    }
    api
      .get<{ jobs: Array<{ id: string; title: string }> }>("/api/jobs/recruiter")
      .then((r) => {
        const j = (r.jobs ?? []).find((x) => x.id === jobId);
        setJobTitle(j?.title ?? null);
      })
      .catch(() => setJobTitle(null));
  }, [jobId]);

  const handleExpressInterest = async () => {
    if (!profile?.user_id) return;
    try {
      await api.post("/api/notifications/contact-candidate", {
        candidateUserId: profile.user_id,
        recruiterMessage: recruiterNote || undefined,
      });
      toast({ title: "Interest sent", description: "The candidate has been notified." });
    } catch {
      toast({ title: "Failed to send interest", variant: "destructive" });
    }
  };

  const backHref = jobId ? `/dashboard/recruiter/jobs/${jobId}/matches` : "/candidate-search";

  if (loading) {
    return <CandidateProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <p className="text-muted-foreground mb-4">Candidate not found</p>
          <Button variant="outline" onClick={() => navigate("/candidate-search")}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="container flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              type="button"
              onClick={() => navigate(backHref)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              {jobId ? "Matches" : "Candidates"}
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-primary font-semibold truncate">
              {resume?.identity?.name || profile.full_name || "Candidate"}
            </span>
          </div>
          <Badge variant="outline" className="text-primary border-primary/40 shrink-0">
            ProvenHire Resume
          </Badge>
        </div>
      </div>

      <div className="container py-6 max-w-3xl">
        {loadingResume && (
          <CandidateResumePanelSkeleton />
        )}

        {resumeBlocked && !loadingResume && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-6 text-sm">
            <p className="font-medium text-destructive mb-1">Full resume locked</p>
            <p className="text-muted-foreground">
              You have used all profile views on your current plan. Upgrade to keep viewing ProvenHire Resumes.
            </p>
          </div>
        )}

        {resume && !resumeBlocked && (
          <RecruiterProvenhireResumePanel resume={resume} jobTitle={jobTitle} matchPercent={matchPercent} />
        )}

        <div className="mt-10 space-y-4">
          <Collapsible open={classicOpen} onOpenChange={setClassicOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="mb-2">
                {classicOpen ? "Hide" : "Show"} platform profile summary
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CandidateProfileView
                profile={profile}
                variant="recruiter"
                recruiterNote={recruiterNote}
                onRecruiterNoteChange={setRecruiterNote}
                onExpressInterest={handleExpressInterest}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default CandidateProfilePage;
