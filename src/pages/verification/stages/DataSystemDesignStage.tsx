import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { Volume2, ArrowLeft, Send } from "lucide-react";

async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  try {
    const res = await fetch("/api/interview/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const contentType = res.headers.get("Content-Type") || "";
    const looksLikeAudio = contentType.includes("audio") || contentType.includes("octet-stream");
    if (looksLikeAudio) {
      const blob = await res.blob();
      if (blob.size === 0) return;
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.src = url;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        void audio.play().catch(() => cleanup());
      });
    }
  } catch {
    /* optional TTS */
  }
}

export interface DataSystemDesignStageProps {
  targetJobTitle?: string;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
  nextStageLabel?: string;
}

export default function DataSystemDesignStage({
  targetJobTitle = "Data Engineer",
  onSessionComplete,
  onReturnToDashboard,
  nextStageLabel,
}: DataSystemDesignStageProps) {
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [phase, setPhase] = useState<"lld" | "hld">("lld");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [turnBusy, setTurnBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [outcome, setOutcome] = useState<{ pass?: boolean; totalScore?: number } | null>(null);

  const ttsAbortRef = useRef<AbortController | null>(null);

  const playQuestion = useCallback(async (text: string) => {
    ttsAbortRef.current?.abort();
    const ac = new AbortController();
    ttsAbortRef.current = ac;
    await speakText(text, ac.signal);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{
          interviewId: string;
          question: string;
          phase: "lld" | "hld";
        }>("/api/interview/data-system-design/start", {
          jobRole: targetJobTitle.trim() || "Data Engineer",
        });
        if (cancelled) return;
        setInterviewId(res.interviewId);
        setCurrentQuestion(res.question);
        setPhase(res.phase);
        setLoading(false);
        void playQuestion(res.question);
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          toast({
            title: "Could not start session",
            description: (e as Error)?.message ?? "Try again from the dashboard.",
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      ttsAbortRef.current?.abort();
    };
  }, [targetJobTitle, playQuestion]);

  const submit = async () => {
    const id = interviewId;
    const composed = answer.trim();
    if (!id || !composed || turnBusy || complete) return;
    if (composed.length < 25) {
      toast.error("Please write a bit more detail before submitting.", { duration: 3000 });
      return;
    }
    setTurnBusy(true);
    try {
      const turn = await api.post<{
        response: string;
        phase: "lld" | "hld";
        complete: boolean;
        pass?: boolean;
        totalScore?: number;
        timeExpired?: boolean;
      }>("/api/interview/data-system-design/turn", {
        interviewId: id,
        answer: composed,
      });
      setPhase(turn.phase);
      setAnswer("");
      if (turn.complete) {
        setComplete(true);
        setOutcome({ pass: turn.pass, totalScore: turn.totalScore });
        toast({
          title: turn.pass ? "Session complete" : "Session complete",
          description: turn.pass
            ? `Score: ${turn.totalScore ?? "—"}. ${nextStageLabel ? `Next: ${nextStageLabel}` : ""}`
            : (turn.timeExpired ? "Time limit reached." : "Below the verification bar — you can retry after cooldown."),
        });
        onSessionComplete();
        return;
      }
      setCurrentQuestion(turn.response);
      void playQuestion(turn.response);
    } catch (err) {
      toast({
        title: "Submit failed",
        description: (err as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setTurnBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!interviewId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session unavailable</CardTitle>
          <CardDescription>Return to the dashboard and open Data System Design from your pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {onReturnToDashboard && (
            <Button variant="outline" onClick={onReturnToDashboard}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Data System Design</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void playQuestion(currentQuestion)}
              disabled={!currentQuestion}
            >
              <Volume2 className="h-4 w-4 mr-1" />
              Play question
            </Button>
          </div>
          <CardDescription>
            Phase: {phase === "lld" ? "Low-level data design" : "High-level platform design"} — answer in clear written form (you can use lists and short paragraphs).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {currentQuestion}
          </div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Structure your answer: assumptions, design, trade-offs, and how you would validate in production."
            rows={10}
            disabled={complete}
            className="font-sans text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submit()} disabled={turnBusy || complete}>
              <Send className="h-4 w-4 mr-2" />
              {turnBusy ? "Sending…" : "Submit answer"}
            </Button>
            {onReturnToDashboard && (
              <Button type="button" variant="ghost" onClick={onReturnToDashboard}>
                Dashboard
              </Button>
            )}
          </div>
          {complete && outcome && (
            <p className="text-sm text-muted-foreground">
              Result: {outcome.pass ? "Passed" : "Did not pass"} — overall score {outcome.totalScore ?? "—"}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
