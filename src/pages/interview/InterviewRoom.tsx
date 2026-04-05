/**
 * Interview Room — Google Meet link + candidate profile + evaluation (PRD §8).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import { Video, User, FileText, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const TECH_DIMENSIONS: { key: string; label: string; weightPct: number }[] = [
  { key: "technical_depth", label: "Technical Depth", weightPct: 25 },
  { key: "problem_solving", label: "Problem Solving", weightPct: 20 },
  { key: "authenticity", label: "Authenticity", weightPct: 15 },
  { key: "real_world_exposure", label: "Real-World Exposure", weightPct: 15 },
  { key: "verification_consistency", label: "Verification Consistency", weightPct: 10 },
  { key: "system_thinking", label: "System Thinking", weightPct: 8 },
  { key: "communication", label: "Communication", weightPct: 7 },
];

const NONTECH_DIMENSIONS: { key: string; label: string; weightPct: number }[] = [
  { key: "domain_knowledge", label: "Domain Knowledge", weightPct: 25 },
  { key: "problem_solving_thinking", label: "Problem Solving & Thinking", weightPct: 20 },
  { key: "authenticity", label: "Authenticity", weightPct: 15 },
  { key: "real_world_experience", label: "Real-World Experience", weightPct: 15 },
  { key: "verification_consistency", label: "Verification Consistency", weightPct: 10 },
  { key: "strategic_thinking", label: "Strategic Thinking", weightPct: 8 },
  { key: "communication_clarity", label: "Communication & Clarity", weightPct: 7 },
];

const W_TECH: Record<string, number> = {
  technical_depth: 0.25,
  problem_solving: 0.2,
  authenticity: 0.15,
  real_world_exposure: 0.15,
  verification_consistency: 0.1,
  system_thinking: 0.08,
  communication: 0.07,
};

const W_NONTECH: Record<string, number> = {
  domain_knowledge: 0.25,
  problem_solving_thinking: 0.2,
  authenticity: 0.15,
  real_world_experience: 0.15,
  verification_consistency: 0.1,
  strategic_thinking: 0.08,
  communication_clarity: 0.07,
};

function emptyScores(keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

function previewWeighted(scores: Record<string, number>, nonTech: boolean): number {
  const w = nonTech ? W_NONTECH : W_TECH;
  let t = 0;
  for (const [k, wt] of Object.entries(w)) {
    t += (scores[k] ?? 0) * wt;
  }
  return Math.round(t * 100) / 100;
}

export default function InterviewRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { userRole } = useAuth();
  const [session, setSession] = useState<{
    meetingLink?: string | null;
    scheduledAt?: string | null;
    evaluationSubmittedAt?: string | null;
    evaluationScores?: unknown;
    user?: { name?: string | null; jobSeekerProfile?: Record<string, unknown> | null };
    interviewer?: { track?: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetLinkInput, setMeetLinkInput] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const isNonTech = session?.interviewer?.track === "non_technical";
  const dimensions = isNonTech ? NONTECH_DIMENSIONS : TECH_DIMENSIONS;

  const [evalScores, setEvalScores] = useState<Record<string, number>>(() =>
    emptyScores(TECH_DIMENSIONS.map((d) => d.key))
  );

  useEffect(() => {
    if (!session?.interviewer) return;
    const nt = session.interviewer.track === "non_technical";
    const keys = (nt ? NONTECH_DIMENSIONS : TECH_DIMENSIONS).map((d) => d.key);
    setEvalScores(emptyScores(keys));
  }, [session?.interviewer?.track]);

  const [candidateFeedback, setCandidateFeedback] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [interviewerNotes, setInterviewerNotes] = useState("");
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [submittedEarningsPaise, setSubmittedEarningsPaise] = useState<number | null>(null);

  const livePreview = useMemo(() => previewWeighted(evalScores, isNonTech), [evalScores, isNonTech]);

  const fetchSession = async () => {
    try {
      const res = await api.get<{ session: NonNullable<typeof session> }>(`/api/expert/sessions/${sessionId}`);
      setSession(res.session);
    } catch {
      toast.error("Session not found");
    } finally {
      setLoading(false);
    }
  };

  const saveMeetLink = async () => {
    const url = meetLinkInput.trim();
    if (!url || !url.includes("meet.google.com")) {
      toast.error("Please enter a valid Google Meet link (e.g. https://meet.google.com/xxx-xxxx-xxx)");
      return;
    }
    setSavingLink(true);
    try {
      await api.patch(`/api/expert/sessions/${sessionId}`, { meetingLink: url });
      setSession((s) => (s ? { ...s, meetingLink: url } : s));
      toast.success("Google Meet link saved. The candidate can now see it.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save link");
    } finally {
      setSavingLink(false);
    }
  };

  useEffect(() => {
    if (!sessionId || userRole !== "expert_interviewer") return;
    fetchSession();
  }, [sessionId, userRole]);

  useEffect(() => {
    if (session?.meetingLink && !meetLinkInput) setMeetLinkInput(session.meetingLink);
  }, [session?.meetingLink]);

  const storedWeighted = useMemo(() => {
    const es = session?.evaluationScores as { weightedTotal?: number; dimensions?: Record<string, number> } | null;
    if (es?.weightedTotal != null && Number.isFinite(es.weightedTotal)) return es.weightedTotal;
    return null;
  }, [session?.evaluationScores]);

  const handleSubmitEval = async () => {
    const allTouched = dimensions.every((d) => {
      const v = evalScores[d.key];
      return typeof v === "number" && v >= 0 && v <= 100;
    });
    if (!allTouched) {
      toast.error("Set all dimension scores (0–100).");
      return;
    }
    if (candidateFeedback.trim().length < 50) {
      toast.error("Candidate feedback must be at least 50 characters.");
      return;
    }
    setEvalSubmitting(true);
    try {
      const res = await api.post<{
        ok: boolean;
        earningsPaise?: number;
        weightedScoreSubmitted?: number;
      }>(`/api/expert/sessions/${sessionId}/evaluate`, {
        scores: evalScores,
        candidateFeedback: candidateFeedback.trim(),
        internalNotes: internalNotes.trim() || undefined,
        interviewerNotes: interviewerNotes.trim() || undefined,
      });
      const rupees = ((res.earningsPaise ?? 0) / 100).toFixed(0);
      setSubmittedEarningsPaise(res.earningsPaise ?? null);
      toast.success(`Evaluation recorded. Session earnings: ₹${rupees} (pending payout).`);
      setSession((s) =>
        s
          ? {
              ...s,
              evaluationSubmittedAt: new Date().toISOString(),
              evaluationScores: { weightedTotal: res.weightedScoreSubmitted, dimensions: { ...evalScores } },
            }
          : s
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setEvalSubmitting(false);
    }
  };

  const formatSlot = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }) : "—";

  if (loading || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const profile = session.user?.jobSeekerProfile;
  const candidateName =
    (profile?.fullName as string | undefined) || session.user?.name || "Candidate";
  const isEvaluated = !!session.evaluationSubmittedAt || submittedEarningsPaise != null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <Navbar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 pt-20 sm:pt-24 pb-8">
        <Button variant="ghost" asChild className="mb-6 -ml-2">
          <Link to="/dashboard/expert">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Video className="h-5 w-5 text-primary" />
                  Google Meet Interview
                </CardTitle>
                <CardDescription>
                  {candidateName} — {formatSlot(session.scheduledAt ?? null)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="font-medium mb-2">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Open Google Meet and create a new meeting.</li>
                    <li>Paste the link below and save — the candidate gets an in-app notification.</li>
                    <li>Conduct the interview in Meet, then submit your evaluation here.</li>
                  </ol>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a href="https://meet.google.com/landing" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Google Meet
                  </a>
                </Button>
                <Label>Google Meet link</Label>
                <Input
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={meetLinkInput}
                  onChange={(e) => setMeetLinkInput(e.target.value)}
                />
                <Button
                  onClick={saveMeetLink}
                  disabled={savingLink || !meetLinkInput.trim()}
                  className="w-full"
                >
                  {savingLink ? "Sending..." : "Send link to candidate"}
                </Button>
                {session.meetingLink && (
                  <p className="text-xs text-green-600">Link saved. Candidate can open it from their verification flow.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  Candidate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span> {candidateName}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Experience:</span>{" "}
                    {(profile?.experienceYears as number | undefined) ?? "—"} yrs
                  </div>
                  <div>
                    <span className="text-muted-foreground">Role:</span>{" "}
                    {(profile?.currentRole as string | undefined) ?? "—"}
                  </div>
                </div>
                {profile?.skills && Array.isArray(profile.skills) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(profile.skills as string[]).slice(0, 6).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Evaluation ({isNonTech ? "Non-Technical" : "Technical"})
                </CardTitle>
                <CardDescription>
                  Seven dimensions (PRD weights). Pass threshold 70 weighted. You will not see the final pass/fail outcome
                  here — only your submitted total and session earnings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isEvaluated ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Evaluation submitted.</p>
                    {(storedWeighted != null || submittedEarningsPaise != null) && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                        {storedWeighted != null && (
                          <p className="text-lg font-semibold">Your weighted total: {storedWeighted}</p>
                        )}
                        {submittedEarningsPaise != null && (
                          <p className="text-sm">
                            Session earnings: ₹{(submittedEarningsPaise / 100).toFixed(0)} (pending monthly payout)
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          The candidate receives their outcome separately. Thank you for conducting the interview.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                      <span className="font-semibold">Live weighted preview: </span>
                      {livePreview}
                      <span className="text-muted-foreground"> / 100 (threshold 70)</span>
                    </div>
                    {dimensions.map(({ key, label, weightPct }) => (
                      <div key={key}>
                        <Label className="text-xs">
                          {label} ({weightPct}%)
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={evalScores[key] ?? ""}
                          onChange={(e) =>
                            setEvalScores((p) => ({ ...p, [key]: Number(e.target.value) }))
                          }
                          className="h-8"
                        />
                      </div>
                    ))}
                    <div>
                      <Label className="text-xs">Interview notes (private, optional)</Label>
                      <Textarea
                        value={interviewerNotes}
                        onChange={(e) => setInterviewerNotes(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Feedback for candidate (min 50 chars, shown after result) *</Label>
                      <Textarea
                        value={candidateFeedback}
                        onChange={(e) => setCandidateFeedback(e.target.value)}
                        rows={3}
                        className="text-sm"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Internal notes for admin (optional)</Label>
                      <Textarea
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <Button size="sm" onClick={handleSubmitEval} disabled={evalSubmitting} className="w-full">
                      {evalSubmitting ? "Submitting..." : "Submit Evaluation"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

```
