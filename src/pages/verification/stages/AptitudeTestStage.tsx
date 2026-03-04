import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { toast } from "sonner";

const ELIGIBILITY_THRESHOLD = 60;
const PLACEHOLDER_QUESTIONS = [
  { id: "q1", question: "A train travels 120 km in 2 hours. What is its average speed in km/h?", options: ["40", "60", "80", "100"], correct: 1 },
  { id: "q2", question: "If 3x + 7 = 22, what is x?", options: ["3", "4", "5", "6"], correct: 2 },
  { id: "q3", question: "Which number comes next in the sequence: 2, 6, 12, 20, 30, ?", options: ["40", "42", "44", "46"], correct: 1 },
  { id: "q4", question: "A shirt costs $40 after a 20% discount. What was the original price?", options: ["$48", "$50", "$52", "$55"], correct: 1 },
  { id: "q5", question: "In a group of 60 people, 40% are women. How many men are there?", options: ["24", "30", "36", "40"], correct: 2 },
];

interface AptitudeTestStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
}

const AptitudeTestStage = ({ stageStatus, stageScore, onComplete }: AptitudeTestStageProps) => {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const isFailed = stageStatus === "failed" || submitted;
  const displayScore = submittedScore ?? stageScore ?? 0;

  const handleSubmit = async () => {
    const correctCount = PLACEHOLDER_QUESTIONS.filter((q, i) => answers[q.id] === q.correct).length;
    const score = PLACEHOLDER_QUESTIONS.length > 0
      ? Math.round((correctCount / PLACEHOLDER_QUESTIONS.length) * 100)
      : 0;
    setLoading(true);
    try {
      await api.post("/api/verification/aptitude", { score, answers: { questions: PLACEHOLDER_QUESTIONS.length, correct: correctCount } });
      if (score >= ELIGIBILITY_THRESHOLD) {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "completed", score });
        toast.success(`Aptitude test completed. Score: ${score}/100. You are eligible for the next stage.`);
        onComplete();
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

  const correctCount = PLACEHOLDER_QUESTIONS.filter((q) => answers[q.id] === q.correct).length;
  const score = PLACEHOLDER_QUESTIONS.length > 0 ? Math.round((correctCount / PLACEHOLDER_QUESTIONS.length) * 100) : 0;
  const allAnswered = PLACEHOLDER_QUESTIONS.every((q) => answers[q.id] !== undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aptitude Test</CardTitle>
        <CardDescription>
          Answer the following questions. You need at least {ELIGIBILITY_THRESHOLD}/100 to proceed to the next stage.
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
        ) : (
          <>
            <div className="space-y-6">
              {PLACEHOLDER_QUESTIONS.map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <p className="font-medium">Q{idx + 1}: {q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt, i) => (
                      <Button
                        key={i}
                        variant={answers[q.id] === i ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
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
