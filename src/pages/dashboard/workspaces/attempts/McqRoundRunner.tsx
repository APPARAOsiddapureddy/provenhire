import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WorkspaceConfirmDialog from "@/components/WorkspaceConfirmDialog";
import RoundAttemptShell from "./RoundAttemptShell";

type McqQuestion = {
  id: string;
  question: string;
  options: string[];
  marks?: number;
};

type McqSnapshot = {
  session: {
    id: string;
    status: "active" | "submitted" | "auto_submitted" | "discarded";
    secondsRemaining: number;
    currentQuestionId: string | null;
    score?: number | null;
    correctCount?: number | null;
    incorrectCount?: number | null;
    skippedCount?: number | null;
  };
  questions: McqQuestion[];
  answers: Record<string, string>;
  workspaceAttempt: {
    id: string;
    status: string;
    percentageScore?: number | null;
    weightedScore?: number | null;
    round: { name: string; order: number };
  } | null;
};

export default function McqRoundRunner({ workspaceCode, attemptId, sessionId }: { workspaceCode: string; attemptId: string; sessionId: string }) {
  const [snapshot, setSnapshot] = useState<McqSnapshot | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get<McqSnapshot>(`/api/session/mcq/${encodeURIComponent(sessionId)}`);
    setSnapshot(res);
    setSelected(res.answers ?? {});
    const idx = res.session.currentQuestionId
      ? res.questions.findIndex((question) => question.id === res.session.currentQuestionId)
      : 0;
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [sessionId]);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load MCQ session"));
  }, [load]);

  const current = snapshot?.questions[activeIndex] ?? null;
  const isFinalized = snapshot?.session.status === "submitted" || snapshot?.session.status === "auto_submitted";
  const answeredCount = useMemo(() => Object.keys(selected).filter((id) => selected[id]?.trim()).length, [selected]);

  const saveAndMove = async (nextIndex: number) => {
    if (!snapshot || !current || isFinalized) return;
    setSaving(true);
    try {
      const value = selected[current.id];
      const body = {
        currentQuestionId: snapshot.questions[nextIndex]?.id ?? current.id,
        ...(value ? { answer: { questionId: current.id, selectedOption: value } } : {}),
      };
      const res = await api.patch<McqSnapshot>(`/api/session/mcq/${encodeURIComponent(sessionId)}`, body);
      setSnapshot(res);
      setSelected(res.answers ?? {});
      setActiveIndex(nextIndex);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save answer");
    } finally {
      setSaving(false);
    }
  };

  const submit = async (auto = false) => {
    setSubmitting(true);
    try {
      const answer = current && selected[current.id] ? { questionId: current.id, selectedOption: selected[current.id] } : undefined;
      const res = await api.post<McqSnapshot>(`/api/session/mcq/${encodeURIComponent(sessionId)}/submit`, { answer });
      setSnapshot(res);
      setSelected(res.answers ?? {});
      setSubmitConfirmOpen(false);
      toast.success(auto ? "MCQ time expired. Round submitted." : "MCQ round submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit MCQ round");
    } finally {
      setSubmitting(false);
    }
  };

  if (!snapshot || !current) {
    return (
      <RoundAttemptShell workspaceCode={workspaceCode} attemptId={attemptId} sessionId={sessionId} testType="aptitude" title="MCQ Round" subtitle="Loading session" secondsRemaining={null}>
        <div className="min-h-[360px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
        </div>
      </RoundAttemptShell>
    );
  }

  return (
    <RoundAttemptShell
      workspaceCode={workspaceCode}
      attemptId={attemptId}
      sessionId={sessionId}
      testType="aptitude"
      title={snapshot.workspaceAttempt?.round.name ?? "MCQ Round"}
      subtitle={`Question ${activeIndex + 1} of ${snapshot.questions.length}`}
      secondsRemaining={snapshot.session.secondsRemaining}
      onExpired={() => void submit(true)}
      isFinalized={isFinalized}
    >
      {isFinalized ? (
        <Card className="border-emerald-400/30 bg-emerald-400/10">
          <CardContent className="p-5 text-emerald-100">
            Submitted. Score: {snapshot.workspaceAttempt?.percentageScore ?? 0}% · Weighted: {snapshot.workspaceAttempt?.weightedScore ?? 0}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="text-lg text-[var(--dash-text-primary)]">{current.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {current.options.map((option, index) => {
              const key = String.fromCharCode("A".charCodeAt(0) + index);
              const checked = selected[current.id] === option || selected[current.id] === key;
              const disabled = isFinalized || submitting;
              return (
                <button
                  key={`${current.id}-${key}`}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setSelected((prev) => ({ ...prev, [current.id]: option }));
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-gold)] disabled:cursor-not-allowed disabled:opacity-70 ${
                    checked
                      ? "border-[var(--dash-gold)] bg-[var(--dash-gold)]/10 text-[var(--dash-text-primary)]"
                      : "border-[var(--dash-navy-border)] bg-white/[0.02] text-[var(--dash-text-muted)] hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      checked
                        ? "border-[var(--dash-gold)] bg-[var(--dash-gold)] text-black"
                        : "border-[var(--dash-navy-border)] text-[var(--dash-text-muted)]"
                    }`}
                  >
                    {key}
                  </span>
                  <span className="min-w-0 flex-1">{option}</span>
                </button>
              );
            })}
            <div className="flex flex-wrap justify-between gap-2 pt-3">
              <Button variant="outline" disabled={activeIndex === 0 || saving || isFinalized} onClick={() => saveAndMove(activeIndex - 1)}>
                Previous
              </Button>
              <div className="flex gap-2">
                {activeIndex < snapshot.questions.length - 1 ? (
                  <Button disabled={saving || isFinalized} onClick={() => saveAndMove(activeIndex + 1)}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save & Next
                  </Button>
                ) : (
                  <Button disabled={submitting || isFinalized} onClick={() => setSubmitConfirmOpen(true)}>
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit Round
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="text-base text-[var(--dash-text-primary)]">Navigator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-[var(--dash-text-muted)]">
              Answered {answeredCount}/{snapshot.questions.length}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {snapshot.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => saveAndMove(index)}
                  className={`h-9 rounded-md border text-sm ${
                    index === activeIndex
                      ? "border-[var(--dash-gold)] text-[var(--dash-gold)]"
                      : selected[question.id]
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-[var(--dash-navy-border)] text-[var(--dash-text-muted)]"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <Badge variant="outline">{snapshot.session.status}</Badge>
          </CardContent>
        </Card>
      </div>
      <WorkspaceConfirmDialog
        open={submitConfirmOpen}
        title="Submit this MCQ round?"
        description="You cannot edit answers after submission."
        confirmLabel="Yes, Submit"
        cancelLabel="No"
        loading={submitting}
        onOpenChange={setSubmitConfirmOpen}
        onConfirm={() => void submit(false)}
      />
    </RoundAttemptShell>
  );
}
