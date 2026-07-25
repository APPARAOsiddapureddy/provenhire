import { useEffect, useState } from "react";
import { Check, GraduationCap, TrendingDown, Users } from "lucide-react";
import { CountUp } from "./Reveal";
import { prefersReducedMotion } from "./useRevealed";

/// Batch journey: roster added -> rounds running -> readiness read.
///
/// Same idea as VerificationStagesCard on the main landing page (a self
/// advancing storyboard that shows the product working), retold for the buyer
/// here: a placement officer cares about a *batch* moving, not one candidate.
///
/// Numbers deliberately match the static outcome card further down the page, so
/// the two never contradict each other.
type Stage = 0 | 1 | 2;

const STAGE_MS: Record<Stage, number> = { 0: 3200, 1: 4200, 2: 5000 };

const STEPS = ["Invited", "Assessed", "Readiness read"] as const;

const ROUNDS = [
  { name: "Aptitude", done: 208, total: 214, tone: "bg-primary" },
  { name: "Coding", done: 203, total: 214, tone: "bg-sky-400" },
  { name: "SQL", done: 201, total: 214, tone: "bg-teal-400" },
  { name: "AI Interview", done: 195, total: 214, tone: "bg-emerald-400" },
] as const;

export default function CampusJourneyCard() {
  const reduced = prefersReducedMotion();
  // With reduced motion we show the finished state and never advance - the
  // point of the graphic is the outcome, not the animation.
  const [current, setCurrent] = useState<Stage>(reduced ? 2 : 0);
  // Bumped on each loop so the headline number re-counts every time stage 2
  // comes round, rather than only on first mount.
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const next = current === 2 ? 0 : ((current + 1) as Stage);
    const timer = window.setTimeout(() => {
      if (next === 0) setCycle((c) => c + 1);
      setCurrent(next);
    }, STAGE_MS[current]);
    return () => window.clearTimeout(timer);
  }, [current, reduced]);

  return (
    <div className="w-full">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Batch journey · evidence before placement
      </p>

      {/* Stepper. Checkmarks only appear once a milestone is actually reached,
          so the graphic never overstates where the batch is. */}
      <ol className="mb-5 flex items-center gap-2" aria-label="Batch journey">
        {STEPS.map((label, index) => {
          const done = current > index;
          const active = current === index;
          return (
            <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-all duration-500 ${
                    done
                      ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300"
                      : active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-white/[0.03] text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={`truncate text-[11px] uppercase tracking-[0.08em] transition-colors duration-500 ${
                    done || active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <span aria-hidden className="h-px flex-1 overflow-hidden bg-border">
                  <span
                    className={`block h-full transition-all duration-700 ease-out ${
                      done ? "w-full bg-emerald-400/60" : "w-0 bg-transparent"
                    }`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Fixed height so the swapping cards never shift the page under the
          reader. */}
      <div className="relative h-[19rem] rounded-xl border border-border bg-card p-6">
        {/* --- Stage 0: roster --- */}
        <StageCard active={current === 0}>
          <Pill tone="neutral">Roster added</Pill>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-white/[0.04]">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">CSE 2026 · Final year</p>
              <p className="text-sm text-muted-foreground">214 students invited</p>
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Join code
            </p>
            <p className="mt-1 font-mono text-sm">PH-CSE-2026-4417</p>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0 text-primary" />
            Students join themselves — no accounts to hand out.
          </p>
        </StageCard>

        {/* --- Stage 1: rounds running --- */}
        <StageCard active={current === 1}>
          <Pill tone="active">Rounds running</Pill>
          <div className="mt-5 space-y-3.5">
            {ROUNDS.map((round, index) => {
              const pct = Math.round((round.done / round.total) * 100);
              return (
                <div key={round.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{round.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {round.done}/{round.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width] duration-1000 ease-out ${round.tone}`}
                      style={{
                        width: current === 1 ? `${pct}%` : "0%",
                        transitionDelay: `${index * 140}ms`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
            195 students have finished all four rounds.
          </p>
        </StageCard>

        {/* --- Stage 2: the read --- */}
        <StageCard active={current === 2}>
          <Pill tone="done">Readiness read ready</Pill>
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-4xl font-semibold tabular-nums text-primary">
              {current === 2 ? <CountUp key={cycle} value={148} durationMs={900} /> : 0}
            </span>
            <span className="text-sm text-muted-foreground">of 214 placement-ready</span>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-primary transition-[width] duration-1000 ease-out"
              style={{ width: current === 2 ? "69%" : "0%" }}
            />
            <div
              className="bg-primary/30 transition-[width] duration-1000 ease-out [transition-delay:180ms]"
              style={{ width: current === 2 ? "21%" : "0%" }}
            />
          </div>
          <div className="mt-6 space-y-2.5 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <TrendingDown className="h-4 w-4 shrink-0 text-red-400" />
                Weakest topic
              </span>
              <span className="font-medium">Dynamic Programming</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Behind in 2+ rounds</span>
              <span className="font-medium">18 students</span>
            </div>
          </div>
        </StageCard>
      </div>
    </div>
  );
}

function StageCard({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      // aria-hidden on the inactive cards so a screen reader reads one story,
      // not three interleaved ones.
      aria-hidden={!active}
      // The outgoing card leaves quickly and the incoming one waits for it, so
      // the two never overlap mid-swap - a straight crossfade renders both sets
      // of text on top of each other and reads as a glitch.
      className={`absolute inset-0 p-6 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        active
          ? "pointer-events-auto translate-y-0 opacity-100 transition-all duration-500 delay-200"
          : "pointer-events-none translate-y-2 opacity-0 transition-all duration-200"
      }`}
    >
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "neutral" | "active" | "done"; children: React.ReactNode }) {
  const styles = {
    neutral: "border-border bg-white/[0.04] text-muted-foreground",
    active: "border-primary/30 bg-primary/10 text-primary",
    done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${styles}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
