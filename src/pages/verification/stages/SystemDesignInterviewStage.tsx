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

export interface SystemDesignInterviewStageProps {
  targetJobTitle?: string;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
  nextStageLabel?: string;
}

export function SystemDesignInterviewStage({
  targetJobTitle = "Software Engineer",
  onSessionComplete,
  onReturnToDashboard,
  nextStageLabel,
}: SystemDesignInterviewStageProps) {
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [problemTitle, setProblemTitle] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [phase, setPhase] = useState<"lld" | "hld">("lld");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [turnBusy, setTurnBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [outcome, setOutcome] = useState<{
    pass?: boolean;
    totalScore?: number;
    lldScore?: number;
    hldScore?: number;
  } | null>(null);

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
        const status = await api.get<{
          activeSession?: boolean;
          interviewId?: string;
          phase?: "lld" | "hld";
          lastQuestion?: string;
          title?: string;
        }>("/api/interview/system-design/status");
        if (cancelled) return;
        if (status.activeSession && status.interviewId && status.phase) {
          setInterviewId(status.interviewId);
          setPhase(status.phase);
          setCurrentQuestion(status.lastQuestion ?? "");
          if (status.title) setProblemTitle(status.title);
          setLoading(false);
          return;
        }
      } catch {
        /* no active session — start below */
      }
      try {
        const res = await api.post<{
          interviewId: string;
          question: string;
          title?: string;
          phase: "lld" | "hld";
        }>("/api/interview/system-design/start", {
          jobRole: targetJobTitle.trim() || "Software Engineer",
        });
        if (cancelled) return;
        setInterviewId(res.interviewId);
        if (res.title) setProblemTitle(res.title);
        setCurrentQuestion(res.question);
        setPhase(res.phase);
        setLoading(false);
        void playQuestion(res.question);
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          toast.error(
            `Could not start session: ${(e as Error)?.message ?? "Try again from the dashboard."}`
          );
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
        lldScore?: number;
        hldScore?: number;
        timeExpired?: boolean;
      }>("/api/interview/system-design/turn", {
        interviewId: id,
        answer: composed,
      });
      setPhase(turn.phase);
      setAnswer("");
      if (turn.complete) {
        setComplete(true);
        setOutcome({
          pass: turn.pass,
          totalScore: turn.totalScore,
          lldScore: turn.lldScore,
          hldScore: turn.hldScore,
        });
        toast.message(
          turn.pass
            ? `Session complete — score ${turn.totalScore ?? "—"}${nextStageLabel ? `. Next: ${nextStageLabel}` : ""}`
            : turn.timeExpired
              ? "Time limit reached."
              : "Below the verification bar — you can retry after cooldown."
        );
        onSessionComplete();
        return;
      }
      setCurrentQuestion(turn.response);
      void playQuestion(turn.response);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Submit failed. Try again.");
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
          <CardDescription>Return to the dashboard and open System Design Interview from your pipeline.</CardDescription>
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

  const phaseLabel =
    phase === "lld"
      ? "Low Level Design — Class & API Design (0:00 – 15:00)"
      : "High Level Design — System Architecture (15:00 – 30:00)";
  const phaseHint =
    phase === "lld"
      ? "Design the classes, APIs, and data model for this system."
      : "Now design the full system architecture. Focus on scale, components, and trade-offs.";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">System Design Interview</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Software Design — 30 minutes</p>
            </div>
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
          {problemTitle && (
            <p className="text-sm font-medium text-foreground pt-1">Problem: {problemTitle}</p>
          )}
          <CardDescription className="space-y-2 pt-1">
            <p>
              Think through your answer before responding. In LLD: focus on classes, APIs, and data models. In HLD: focus
              on components, databases, caching, and scale.
            </p>
            <p>
              <span className="font-medium text-foreground">{phaseLabel}</span>
              <span className="block mt-1">{phaseHint}</span>
            </p>
            <p>Answer in clear written form (you can use lists and short paragraphs).</p>
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
              Result: {outcome.pass ? "Passed" : "Did not pass"} — overall {outcome.totalScore ?? "—"} (LLD{" "}
              {outcome.lldScore ?? "—"}, HLD {outcome.hldScore ?? "—"}).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemDesignInterviewStage;
