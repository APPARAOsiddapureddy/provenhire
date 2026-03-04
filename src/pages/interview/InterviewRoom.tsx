/**
 * Interview Room — Google Meet link + candidate profile + evaluation.
 * MVP: No Daily.co. Interviewer adds Google Meet link, conducts interview there, returns to submit evaluation.
 */
import { useEffect, useState } from "react";
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
import {
  Video,
  User,
  FileText,
  ArrowLeft,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const SCORE_WEIGHTS = {
  technicalDepth: { label: "Technical Depth", weight: 30 },
  problemSolving: { label: "Problem Solving", weight: 20 },
  authenticity: { label: "Authenticity", weight: 15 },
  realWorldExposure: { label: "Real-World Exposure", weight: 15 },
  systemThinking: { label: "System Thinking", weight: 10 },
  communication: { label: "Communication", weight: 10 },
};

export default function InterviewRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { userRole } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [meetLinkInput, setMeetLinkInput] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [evalScores, setEvalScores] = useState<Record<string, number>>({
    technicalDepth: 0,
    problemSolving: 0,
    authenticity: 0,
    realWorldExposure: 0,
    systemThinking: 0,
    communication: 0,
  });
  const [evalNotes, setEvalNotes] = useState("");
  const [evalSubmitting, setEvalSubmitting] = useState(false);

  const fetchSession = async () => {
    try {
      const res = await api.get(`/api/expert/sessions/${sessionId}`);
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
      setSession((s: any) => ({ ...s, meetingLink: url }));
      toast.success("Google Meet link saved. The candidate can now see it.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save link");
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

  const [evalResult, setEvalResult] = useState<{ total: number; pass: boolean } | null>(null);
  useEffect(() => {
    if (session?.evaluationSubmittedAt && session?.evaluationPass !== undefined) {
      const weights = { technicalDepth: 0.30, problemSolving: 0.20, authenticity: 0.15, realWorldExposure: 0.15, systemThinking: 0.10, communication: 0.10 };
      const scores = (session.evaluationScores || {}) as Record<string, number>;
      const total = Object.entries(weights).reduce((s, [k, w]) => s + (scores[k] ?? 0) * w, 0);
      setEvalResult({ total: Math.round(total), pass: session.evaluationPass });
    }
  }, [session?.evaluationSubmittedAt, session?.evaluationPass, session?.evaluationScores]);

  const handleSubmitEval = async () => {
    const allFilled = Object.values(evalScores).every((v) => v >= 0 && v <= 100);
    if (!allFilled) {
      toast.error("Fill all scores (0–100)");
      return;
    }
    setEvalSubmitting(true);
    try {
      const res = await api.post<{ total: number; pass: boolean }>(`/api/expert/sessions/${sessionId}/evaluate`, { ...evalScores, notes: evalNotes });
      setEvalResult({ total: res.total ?? 0, pass: res.pass ?? false });
      toast.success(res.pass ? "Candidate passed. ProvenHire badge awarded." : "Evaluation submitted. Candidate did not meet the threshold.");
      setSession((s: any) => ({ ...s, evaluationSubmittedAt: new Date().toISOString() }));
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit");
    } finally {
      setEvalSubmitting(false);
    }
  };

  const formatSlot = (d: string) =>
    d ? new Date(d).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }) : "—";

  if (loading || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const profile = session.user?.jobSeekerProfile;
  const candidateName = profile?.fullName || session.user?.name || "Candidate";
  const isEvaluated = !!session.evaluationSubmittedAt || !!evalResult;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <Navbar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <Button variant="ghost" asChild className="mb-6 -ml-2">
          <Link to="/dashboard/expert">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Google Meet */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Video className="h-5 w-5 text-primary" />
                  Google Meet Interview
                </CardTitle>
                <CardDescription>
                  {candidateName} — {formatSlot(session.scheduledAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="font-medium mb-2">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Go to Google Meet (button below) and create a new meeting.</li>
                    <li>Copy the meeting link and paste it here.</li>
                    <li>Click &quot;Send link to job seeker&quot; — the link will appear on the job seeker&apos;s verification page.</li>
                    <li>Both you and the job seeker join the same Google Meet. Conduct the interview there.</li>
                    <li>After the interview, return here and submit the evaluation below.</li>
                  </ol>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a href="https://meet.google.com/landing" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Google Meet
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">Create a meeting, copy the link, paste below.</p>
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
                  {savingLink ? "Sending..." : "Send link to job seeker"}
                </Button>
                {session.meetingLink && (
                  <p className="text-xs text-green-600">Link sent. Job seeker can see it on their verification page.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Candidate + Evaluation */}
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
                  <div><span className="text-muted-foreground">Name:</span> {candidateName}</div>
                  <div><span className="text-muted-foreground">Experience:</span> {profile?.experienceYears ?? "—"} yrs</div>
                  <div><span className="text-muted-foreground">College:</span> {profile?.college ?? "—"}</div>
                  <div><span className="text-muted-foreground">Role:</span> {profile?.currentRole ?? "—"}</div>
                </div>
                {profile?.skills && Array.isArray(profile.skills) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(profile.skills as string[]).slice(0, 6).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Evaluation
                </CardTitle>
                <CardDescription>After the interview, rate the candidate on each capability (0–100). Pass threshold 70%.</CardDescription>
              </CardHeader>
              <CardContent>
                {isEvaluated ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Evaluation submitted.</p>
                    {evalResult && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-lg font-semibold">
                          ProvenHire Score: {evalResult.total}%
                        </p>
                        <p className={`text-sm font-medium ${evalResult.pass ? "text-green-600" : "text-amber-600"}`}>
                          {evalResult.pass ? "✓ Candidate passed — ProvenHire badge awarded" : "Did not meet threshold — No badge"}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(SCORE_WEIGHTS).map(([key, { label, weight }]) => (
                      <div key={key}>
                        <Label className="text-xs">{label} ({weight}%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={evalScores[key] || ""}
                          onChange={(e) => setEvalScores((p) => ({ ...p, [key]: Number(e.target.value) }))}
                          className="h-8"
                        />
                      </div>
                    ))}
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        value={evalNotes}
                        onChange={(e) => setEvalNotes(e.target.value)}
                        placeholder="Comments..."
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
