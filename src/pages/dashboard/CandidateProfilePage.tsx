/**
 * Recruiter-facing candidate profile view.
 * Uses shared CandidateProfileView (same layout as job seeker My Resume tab).
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Loader2 } from "lucide-react";
import CandidateProfileView, { type CandidateProfileViewProfile } from "@/components/CandidateProfileView";
import { useToast } from "@/hooks/use-toast";

const CandidateProfilePage = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<CandidateProfileViewProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recruiterNote, setRecruiterNote] = useState("");

  useEffect(() => {
    if (!profileId) return;
    api
      .get<{ profile: CandidateProfileViewProfile }>(`/api/users/candidates/${profileId}`)
      .then((r) => setProfile(r.profile))
      .catch(() => toast({ title: "Failed to load profile", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [profileId, toast]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/candidate-search")}
              className="text-muted-foreground hover:text-foreground"
            >
              Candidates
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-primary font-semibold">
              {profile.full_name || "Candidate"}
            </span>
          </div>
          <Badge variant="outline" className="text-primary border-primary/40">
            Recruiter View
          </Badge>
        </div>
      </div>

      <div className="container py-6">
        <CandidateProfileView
          profile={profile}
          variant="recruiter"
          recruiterNote={recruiterNote}
          onRecruiterNoteChange={setRecruiterNote}
          onExpressInterest={handleExpressInterest}
        />
      </div>

      <Footer />
    </div>
  );
};

export default CandidateProfilePage;
