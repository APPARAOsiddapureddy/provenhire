/**
 * Interview Room — embedded video call + candidate profile + evaluation.
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
import { VideoCallSection } from "@/components/interview/VideoCallSection";
import {
  Video,
  User,
  FileText,
  ArrowLeft,
  Loader2,
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
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
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

  const createRoom = async () => {
    setRoomLoading(true);
    try {
      const res = await api.post<{ roomUrl: string; token?: string }>(`/api/expert/sessions/${sessionId}/create-room`);
      setRoomUrl(res.roomUrl);
      setRoomToken(res.token ?? null);
    } catch (err: any) {
      toast.error(err?.message || "Unable to start video call. Please refresh.");
    } finally {
      setRoomLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId || userRole !== "expert_interviewer") return;
    fetchSession();
  }, [sessionId, userRole]);

  useEffect(() => {
    if (!session || roomUrl) return;
    createRoom();
  }, [session?.id]);

  const handleSubmitEval = async () => {
    const allFilled = Object.values(evalScores).every((v) => v >= 0 && v <= 100);
    if (!allFilled) {
      toast.error("Fill all scores (0–100)");
      return;
    }
    setEvalSubmitting(true);
    try {
      await api.post(`/api/expert/sessions/${sessionId}/evaluate`, { ...evalScores, notes: evalNotes });
      toast.success("Evaluation submitted");
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
  const isEvaluated = !!session.evaluationSubmittedAt;

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
          {/* Left: Video call */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Video className="h-5 w-5 text-primary" />
                  Video Call
                </CardTitle>
                <CardDescription>
                  {candidateName} — {formatSlot(session.scheduledAt)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {roomLoading && !roomUrl ? (
                  <div className="aspect-video flex items-center justify-center bg-muted rounded-xl">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                ) : (
                  <VideoCallSection
                    roomUrl={roomUrl ?? ""}
                    token={roomToken}
                    isOwner
                    onCreateRoom={createRoom}
                  />
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
                <CardDescription>Pass threshold 70%</CardDescription>
              </CardHeader>
              <CardContent>
                {isEvaluated ? (
                  <p className="text-sm text-muted-foreground">Evaluation submitted.</p>
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
