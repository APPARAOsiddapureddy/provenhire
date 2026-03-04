import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";
import ProctoringNotice from "@/components/ProctoringNotice";

interface ExpertInterviewStageProps {
  onComplete: () => void;
}

const ExpertInterviewStage = ({ onComplete }: ExpertInterviewStageProps) => {
  const [jobRole, setJobRole] = useState("Frontend Developer");
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const startInterview = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ interviewId: string; question: string }>("/api/interview/start", {
        jobRole,
      });
      setInterviewId(res.interviewId);
      setQuestion(res.question);
    } catch (error: any) {
      toast.error(error?.message || "Failed to start interview.");
    } finally {
      setLoading(false);
    }
  };

  const sendAnswer = async () => {
    if (!interviewId || !answer.trim()) return;
    setLoading(true);
    try {
      const res = await api.post<any>("/api/interview/respond", {
        interviewId,
        answer,
      });
      setAnswer("");
      if (res.completed) {
        setResult(res);
        await api.post("/api/verification/stages/update", { stageName: "expert_interview", status: "completed" });
        onComplete();
      } else {
        setQuestion(res.question);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit answer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Expert Interview</CardTitle>
        <CardDescription>Answer the questions one at a time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProctoringNotice />
        {!interviewId && (
          <div className="space-y-3">
            <Input value={jobRole} onChange={(e) => setJobRole(e.target.value)} />
            <Button onClick={startInterview} disabled={loading}>
              {loading ? "Starting..." : "Start Interview"}
            </Button>
          </div>
        )}

        {question && (
          <div className="space-y-3">
            <div className="font-medium">{question}</div>
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer" />
            <Button onClick={sendAnswer} disabled={loading}>
              {loading ? "Submitting..." : "Submit Answer"}
            </Button>
          </div>
        )}

        {result && (
          <div className="text-sm text-muted-foreground">
            Interview completed. Score: {result.totalScore} ({result.badgeLevel})
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExpertInterviewStage;
