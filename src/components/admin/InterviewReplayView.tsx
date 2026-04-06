import { ScrollArea } from "@/components/ui/scroll-area";

export type InterviewReplayTurnLogEntry = {
  turnId?: string;
  questionIndex?: number;
  weaknessSeverity?: string;
  followupDecision?: string;
  questionSource?: string;
  timestamp?: string;
  whisperLatencyMs?: number | null;
  agentPipelineMs?: number | null;
  questionGenerationMs?: number | null;
  totalTurnLatencyMs?: number | null;
  pasteCount?: number;
  timeToSubmitSeconds?: number | null;
  answerLengthChars?: number;
  answerSnapshot?: string;
};

export type InterviewReplayPayload = {
  interview: {
    id: string;
    totalScore: number | null;
    badgeLevel: string | null;
    claimCredibilityRisk: string | null;
    engineeringSignal: string | null;
    coverageRatio: number | null;
    integrityFlag: string | null;
    riskScore: number | null;
    evaluationPassCount: number | null;
    evaluationScoreVariance: unknown;
    status: string;
    completedAt: string | null;
    createdAt: string;
  };
  messages: Array<{
    id: string;
    sender: string;
    message: string;
    createdAt: string;
    flagAntiGaming?: boolean;
    pasteCount?: number;
    timeToSubmitSeconds?: number | null;
  }>;
  questionResults: Array<{
    questionIndex: number;
    questionType: string;
    scoreConceptual: number | null;
    scoreReasoning: number | null;
    scoreCommunication: number | null;
    rationale: string | null;
  }>;
  turnLog: InterviewReplayTurnLogEntry[];
  proctoringEvents: Array<{
    type: string;
    createdAt: string;
    message?: string | null;
    severity?: string | null;
  }>;
};

function decisionStyles(decision: string | undefined): string {
  switch (decision) {
    case "forced_sprint":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/30";
    case "discrepancy_probe":
      return "bg-red-500/15 text-red-900 dark:text-red-100 border-red-500/30";
    case "weakness_probe":
      return "bg-yellow-500/15 text-yellow-900 dark:text-yellow-100 border-yellow-500/30";
    case "followup_deepen":
      return "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border-emerald-500/30";
    case "prefetch":
      return "bg-blue-500/15 text-blue-900 dark:text-blue-100 border-blue-500/30";
    case "sprint_question":
      return "bg-slate-500/15 text-slate-800 dark:text-slate-100 border-slate-500/25";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatMs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)} ms`;
}

export function InterviewReplayView({ data }: { data: InterviewReplayPayload }) {
  const { interview, messages, questionResults, turnLog, proctoringEvents } = data;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground font-medium">Score</p>
          <p className="font-semibold tabular-nums">{interview.totalScore ?? "—"}</p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground font-medium">Badge</p>
          <p className="font-semibold truncate">{interview.badgeLevel ?? "—"}</p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground font-medium">Claim risk</p>
          <p className="font-semibold truncate">{interview.claimCredibilityRisk ?? "—"}</p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground font-medium">Engineering</p>
          <p className="font-semibold truncate">{interview.engineeringSignal ?? "—"}</p>
        </div>
        <div className="rounded border border-border p-2 col-span-2">
          <p className="text-muted-foreground font-medium">Integrity / proctoring rows</p>
          <p className="font-semibold">
            {interview.integrityFlag ?? "—"}
            {interview.riskScore != null ? (
              <span className="text-muted-foreground font-normal"> · {interview.riskScore} events</span>
            ) : null}
          </p>
        </div>
        <div className="rounded border border-border p-2 col-span-2">
          <p className="text-muted-foreground font-medium">Multi-pass eval</p>
          <p className="font-semibold tabular-nums">
            {interview.evaluationPassCount != null ? `${interview.evaluationPassCount} passes` : "—"}
            {Array.isArray(interview.evaluationScoreVariance) ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                [{(interview.evaluationScoreVariance as number[]).join(", ")}]
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Turn timeline
        </p>
        <ScrollArea className="h-[min(40vh,22rem)] rounded-md border border-border pr-3">
          <ul className="space-y-3 py-2">
            {turnLog.length === 0 ? (
              <li className="text-muted-foreground text-xs px-1">No turn log (legacy interview).</li>
            ) : (
              turnLog.map((t, i) => (
                <li
                  key={`${t.turnId ?? i}-${t.timestamp ?? i}`}
                  className="rounded-lg border border-border/80 bg-card/50 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${decisionStyles(t.followupDecision)}`}
                    >
                      {t.followupDecision ?? "unknown"}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      Q{t.questionIndex ?? "—"} · weak {t.weaknessSeverity || "—"}
                    </span>
                    {t.timestamp && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{t.timestamp}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Whisper: {formatMs(t.whisperLatencyMs ?? undefined)}</span>
                    <span>Agents: {formatMs(t.agentPipelineMs ?? undefined)}</span>
                    <span>Q-gen: {formatMs(t.questionGenerationMs ?? undefined)}</span>
                    <span>Total: {formatMs(t.totalTurnLatencyMs ?? undefined)}</span>
                  </div>
                  {(t.pasteCount != null && t.pasteCount > 0) || t.timeToSubmitSeconds != null ? (
                    <p className="text-[11px] text-muted-foreground">
                      Paste: {t.pasteCount ?? 0} · Submit delay:{" "}
                      {t.timeToSubmitSeconds != null ? `${t.timeToSubmitSeconds}s` : "—"} · Chars:{" "}
                      {t.answerLengthChars ?? "—"}
                    </p>
                  ) : null}
                  {t.answerSnapshot ? (
                    <p className="text-[11px] text-foreground/90 line-clamp-2 whitespace-pre-wrap">
                      {t.answerSnapshot}
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Messages
          </p>
          <ScrollArea className="h-[min(36vh,18rem)] rounded-md border border-border pr-3">
            <ul className="space-y-2 py-2 text-xs">
              {messages.map((m) => (
                <li key={m.id} className="border-b border-border/60 pb-2 last:border-0">
                  <span
                    className={`font-semibold ${m.sender === "user" ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {m.sender}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </span>
                  {m.flagAntiGaming ? (
                    <span className="ml-2 text-[10px] text-amber-600">anti-gaming</span>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-foreground/90">{m.message}</p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Per-question scores
          </p>
          <ScrollArea className="h-[min(36vh,18rem)] rounded-md border border-border pr-3">
            <ul className="space-y-2 py-2 text-xs">
              {questionResults.length === 0 ? (
                <li className="text-muted-foreground px-1">No rows.</li>
              ) : (
                questionResults.map((r) => (
                  <li key={r.questionIndex} className="border-b border-border/60 pb-2 last:border-0">
                    <span className="font-semibold">#{r.questionIndex}</span>{" "}
                    <span className="text-muted-foreground">{r.questionType}</span>
                    <p className="tabular-nums mt-1">
                      C {r.scoreConceptual ?? "—"} · R {r.scoreReasoning ?? "—"} · Comm{" "}
                      {r.scoreCommunication ?? "—"}
                    </p>
                    {r.rationale ? (
                      <p className="text-muted-foreground mt-1 line-clamp-3">{r.rationale}</p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Proctoring events ({proctoringEvents.length})
        </p>
        <ScrollArea className="max-h-40 rounded-md border border-border pr-3">
          <ul className="py-2 text-xs space-y-1">
            {proctoringEvents.length === 0 ? (
              <li className="text-muted-foreground px-1">None logged.</li>
            ) : (
              proctoringEvents.map((e, i) => (
                <li key={`${e.type}-${i}`} className="flex flex-wrap gap-x-2 px-1">
                  <span className="font-medium">{e.type}</span>
                  <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                  {e.message ? <span className="text-muted-foreground">{e.message}</span> : null}
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
}
