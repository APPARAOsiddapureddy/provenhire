/**
 * AntigravityStageAdapter — drop-in replacement for ExpertInterviewStage that
 * integrates the Antigravity AI Adversarial Interview Engine into ProvenHire's
 * verification pipeline.
 *
 * Architecture:
 *   1. Setup form   — candidate pastes resume, confirms role/experience
 *   2. Launch       — POST /api/ai-interview-adapter/start (Express → Antigravity)
 *   3. Interview    — fixed-position iframe overlay loading the Antigravity UI
 *   4. Completion   — poll /api/ai-interview-adapter/status every 15 s;
 *                     on complete: show result card + call onInterviewAwaitingReview
 *
 * The iframe itself handles all interview interaction (Deepgram ASR, ElevenLabs TTS,
 * adversarial turns). This component only manages the lifecycle around it.
 *
 * Props: identical to ExpertInterviewStageProps so VerificationFlow can swap
 * components with a single conditional.
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AntigravityBridge } from "@/components/ai-interview/AntigravityBridge";
import type { ExpertInterviewStageProps } from "./ExpertInterviewStage";

// ─── Config ─────────────────────────────────────────────────────────────────────

const EXPERIENCE_OPTIONS = [
  { value: "junior", label: "0–2 years (Junior)" },
  { value: "mid", label: "2–5 years (Mid)" },
  { value: "senior", label: "5+ years (Senior)" },
] as const;

/** Map profile experience years → Antigravity band label. */
function yearsToLevel(years?: number): string {
  if (!years || years <= 2) return "junior";
  if (years <= 5) return "mid";
  return "senior";
}

// ─── Types ───────────────────────────────────────────────────────────────────────

type Phase = "setup" | "interview" | "done";

interface CompletionResult {
  score: number | null;
  badge: string | null;
  verdict: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function AntigravityStageAdapter({
  targetJobTitle,
  experienceYears,
  onInterviewAwaitingReview,
  onReturnToDashboard,
}: ExpertInterviewStageProps) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [resume, setResume] = useState("");
  const [githubLinks, setGithubLinks] = useState("");
  const [targetRole, setTargetRole] = useState(targetJobTitle ?? "");
  const [expLevel, setExpLevel] = useState(yearsToLevel(experienceYears));
  const [starting, setStarting] = useState(false);
  const [launchStatusIndex, setLaunchStatusIndex] = useState(0);

  // ── Session state ───────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [result, setResult] = useState<CompletionResult | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchStatuses = [
    "Preparing interview map…",
    "Grounding follow-up tracks…",
    "Launching interview room…",
  ] as const;

  // ── On mount: check for an existing open session and resume it ──────────────
  useEffect(() => {
    let cancelled = false;
    async function checkOpen() {
      try {
        const data = await api.get<{
          open: boolean;
          session_id?: string;
          provenhire_interview_id?: string;
          reconciled?: boolean;
          score?: number | null;
          badge?: string | null;
          verdict?: string | null;
        }>("/api/ai-interview-adapter/open");

        if (cancelled) return;

        if (data.reconciled) {
          // Antigravity had already finished; the server finalized us while we were away.
          setResult({ score: data.score ?? null, badge: data.badge ?? null, verdict: data.verdict ?? null });
          setPhase("done");
          return;
        }

        if (data.open && data.session_id && data.provenhire_interview_id) {
          setSessionId(data.session_id);
          setInterviewId(data.provenhire_interview_id);
          setPhase("interview");
        }
      } catch {
        // Non-fatal — user just sees the setup form
      }
    }
    void checkOpen();
    return () => { cancelled = true; };
  }, []);

  // ── Polling — check completion every 15 s while in interview phase ──────────
  useEffect(() => {
    if (phase !== "interview" || !sessionId || !interviewId) return;

    let active = true;

    const check = async () => {
      if (!active) return;
      try {
        const data = await api.get<{
          complete: boolean;
          score?: number | null;
          badge?: string | null;
          verdict?: string | null;
        }>(`/api/ai-interview-adapter/status/${sessionId}?interviewId=${interviewId}`);

        if (data.complete && active) {
          clearInterval(pollRef.current!);
          setResult({
            score: data.score ?? null,
            badge: data.badge ?? null,
            verdict: data.verdict ?? null,
          });
          setPhase("done");
        }
      } catch {
        // Silently ignore transient poll errors — next tick will retry
      }
    };

    // First check after 45 s (interview cannot realistically complete before then)
    const initial = setTimeout(check, 45_000);
    pollRef.current = setInterval(check, 15_000);

    return () => {
      active = false;
      clearTimeout(initial);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, sessionId, interviewId]);

  // ── Notify parent shortly after done card appears ───────────────────────────
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => onInterviewAwaitingReview?.(), 4_000);
    return () => clearTimeout(t);
  }, [phase, onInterviewAwaitingReview]);

  useEffect(() => {
    if (!starting) {
      setLaunchStatusIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLaunchStatusIndex((prev) => Math.min(prev + 1, launchStatuses.length - 1));
    }, 12_000);
    return () => clearInterval(interval);
  }, [starting]);

  // ── Start interview ─────────────────────────────────────────────────────────
  async function handleStart() {
    if (!resume.trim()) {
      toast.error("Paste your resume to begin.");
      return;
    }
    if (!targetRole.trim()) {
      toast.error("Enter the target role.");
      return;
    }

    setStarting(true);
    try {
      const data = await api.post<{
        session_id: string;
        provenhire_interview_id: string;
      }>("/api/ai-interview-adapter/start", {
        resume: resume.trim(),
        github_links: githubLinks
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        target_role: targetRole.trim(),
        years_experience: expLevel,
      });

      setSessionId(data.session_id);
      setInterviewId(data.provenhire_interview_id);
      setPhase("interview");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to start interview. Please try again."
      );
      setStarting(false);
    }
  }

  // ── Render: setup form ──────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Expert Interview</CardTitle>
          <CardDescription>
            A 30-minute adversarial interview across three sprints — Project Defense,
            Foundations, and System Design. Voice-first. Make sure your microphone is
            available before starting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Resume */}
          <div className="space-y-2">
            <Label htmlFor="ag-resume">
              Resume <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ag-resume"
              placeholder="Paste your full resume text here (plain text or copy-pasted from PDF)…"
              rows={8}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Target role */}
            <div className="space-y-2">
              <Label htmlFor="ag-role">
                Target Role <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ag-role"
                placeholder="e.g. Senior Backend Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
            {/* Experience level */}
            <div className="space-y-2">
              <Label htmlFor="ag-exp">
                Experience Level <span className="text-destructive">*</span>
              </Label>
              <Select value={expLevel} onValueChange={setExpLevel}>
                <SelectTrigger id="ag-exp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GitHub links (optional) */}
          <div className="space-y-2">
            <Label htmlFor="ag-github">GitHub Links (optional)</Label>
            <Textarea
              id="ag-github"
              placeholder="One URL per line — repositories you'd like to reference in the interview…"
              rows={2}
              value={githubLinks}
              onChange={(e) => setGithubLinks(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Once started the interview cannot be paused. Ensure you are in a quiet
              environment with a working microphone and camera.
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onReturnToDashboard}>
              Back
            </Button>
            <Button onClick={handleStart} disabled={starting}>
              {starting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {launchStatuses[launchStatusIndex]}
                </>
              ) : (
                "Start Interview"
              )}
            </Button>
          </div>
          {starting && (
            <p className="text-xs text-muted-foreground">
              We prepare the interview map before launch so the follow-ups are grounded and robust. This can take up to about 2 minutes on a cold start.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Render: live interview (fixed-position iframe overlay) ──────────────────
  if (phase === "interview" && sessionId) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ height: "100dvh", background: "hsl(var(--background))" }}
      >
        {/* Minimal ProvenHire identity strip */}
        <div
          className="shrink-0 flex items-center px-4 gap-2 border-b border-white/5"
          style={{ height: 40, background: "hsl(var(--navy))" }}
        >
          <span className="text-[hsl(var(--gold))] text-[11px] font-bold tracking-wider uppercase font-mono select-none">
            ProvenHire
          </span>
          <span className="text-white/20 text-xs" aria-hidden>
            ›
          </span>
          <span className="text-white/40 text-[11px] font-mono">AI Expert Interview</span>
          <div className="ml-auto flex items-center gap-1.5" aria-label="Interview live">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-mono font-semibold tracking-widest">
              LIVE
            </span>
          </div>
        </div>
        {/* Gold accent divider */}
        <div
          className="shrink-0"
          style={{
            height: 2,
            background:
              "linear-gradient(to right, hsl(var(--gold)), hsl(var(--gold) / 0.3), transparent)",
          }}
          aria-hidden
        />
        {/* Antigravity interview UI — full remaining height */}
        <AntigravityBridge path={`/interview/${sessionId}`} className="flex-1" />
      </div>
    );
  }

  // ── Render: completion card ─────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Card className="border-2 border-emerald-500/30 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            Interview Complete
          </CardTitle>
          <CardDescription>
            Your AI expert interview has been submitted for review. You'll receive an
            email update within 10–15 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {result?.score != null && (
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
              <div>
                <p className="text-sm font-semibold">
                  Score: {result.score}/100 — {result.badge}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {result.verdict}
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Redirecting to your dashboard…
          </p>
          <Button variant="outline" size="sm" onClick={onReturnToDashboard}>
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Fallback (shouldn't reach here in normal flow)
  return null;
}
