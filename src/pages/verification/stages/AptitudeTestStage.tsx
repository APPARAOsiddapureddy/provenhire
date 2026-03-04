import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";
import ProctoringNotice from "@/components/ProctoringNotice";
import { Loader2 } from "lucide-react";

const ELIGIBILITY_THRESHOLD = 60;

interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
}

interface AptitudeTestStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
}

const AptitudeTestStage = ({ stageStatus, stageScore, onComplete }: AptitudeTestStageProps) => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const isFailed = stageStatus === "failed" || (submitted && !justPassed);
  const displayScore = submittedScore ?? stageScore ?? 0;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ questions: AptitudeQuestion[] }>("/api/verification/aptitude/questions");
        setQuestions(res.questions ?? []);
      } catch (e) {
        toast.error("Failed to load aptitude questions. Please refresh.");
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    setLoading(true);
    try {
      const res = await api.post<{ result: { score?: number }; score?: number }>(
        "/api/verification/aptitude",
        { answers }
      );
      const score = res.score ?? res.result?.score ?? 0;
      if (score >= ELIGIBILITY_THRESHOLD) {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "completed", score });
        toast.success(`Aptitude test completed. Score: ${score}/100.`);
        setJustPassed(true);
      } else {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score });
        setSubmittedScore(score);
        setSubmitted(true);
        toast.error(`Score ${score}/100. Minimum ${ELIGIBILITY_THRESHOLD} required to proceed. You can retry when ready.`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit aptitude test.");
    } finally {
      setLoading(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null && answers[q.id] !== "");

  if (loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading aptitude questions...</p>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0 && !loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground">No aptitude questions available. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aptitude Test</CardTitle>
        <CardDescription>
          Answer all {questions.length} questions. You need at least {ELIGIBILITY_THRESHOLD}/100 to proceed to the next stage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFailed ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your score: {displayScore}/100. Minimum {ELIGIBILITY_THRESHOLD} required to proceed to the DSA round.
            </p>
            <p className="mt-2 text-sm">Use the &quot;Retry This Step&quot; button above when you are ready to retake the test.</p>
          </div>
        ) : justPassed ? (
          <div className="p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Aptitude test passed! What&apos;s next?</h3>
            <p className="text-sm text-muted-foreground">You can go to the homepage or continue to the DSA round.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button onClick={() => onComplete()}>
                Continue to DSA Round
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ProctoringNotice />
            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <p className="font-medium">Q{idx + 1}: {q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt, i) => (
                      <Button
                        key={i}
                        variant={answers[q.id] === opt ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleSubmit} disabled={loading || !allAnswered}>
              {loading ? "Submitting..." : "Submit test"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AptitudeTestStage;
