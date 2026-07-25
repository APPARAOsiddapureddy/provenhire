import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BrainCircuit,
  Code2,
  Database,
  Loader2,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { savePendingEmailVerification } from "@/lib/emailVerification";
import { GrowBar, Reveal } from "./Reveal";
import CampusJourneyCard from "./CampusJourneyCard";

/// The four rounds a campus drive runs, in order. This is the single most
/// load-bearing graphic on the page: it answers "what will my students actually
/// do" without a paragraph of prose.
const ROUNDS = [
  {
    icon: BrainCircuit,
    name: "Aptitude",
    line: "Quantitative, logical and verbal reasoning, scored by topic.",
  },
  {
    icon: Code2,
    name: "Coding",
    line: "Real code, run against real test cases — not multiple choice.",
  },
  {
    icon: Database,
    name: "SQL",
    line: "Queries executed against a live database and graded on output.",
  },
  {
    icon: MessagesSquare,
    name: "AI Interview",
    line: "A spoken interview that probes their own projects and answers.",
  },
] as const;

const SETUP_STEPS = [
  {
    title: "Create your account",
    line: "Institution name, email, password. That's the whole form.",
  },
  {
    title: "Add your batch",
    line: "Paste or upload student emails. They join with a code.",
  },
  {
    title: "Open the drive",
    line: "Students work through the rounds; results arrive as they finish.",
  },
] as const;

export default function CampusOnboardingPage() {
  const navigate = useNavigate();
  const [institutionName, setInstitutionName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const name = institutionName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (name.length < 2) return setError("Enter your institution's name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return setError("Enter a valid email address.");
    }
    if (password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
      return setError("Password needs at least 8 characters, including a letter and a number.");
    }

    setSubmitting(true);
    try {
      const result = await api.post<{
        requiresEmailVerification?: boolean;
        email?: string;
        role?: string;
        expiresAt?: string;
        message?: string;
      }>("/api/auth/register-institution", {
        institutionName: name,
        email: normalizedEmail,
        password,
      });

      if (result.requiresEmailVerification) {
        savePendingEmailVerification({
          email: result.email || normalizedEmail,
          role: result.role || "institution",
          expiresAt: result.expiresAt,
          message: result.message,
        });
        toast.success("Account created. Verify your email to continue.");
        navigate(`/verify-email?email=${encodeURIComponent(result.email || normalizedEmail)}`, {
          replace: true,
        });
        return;
      }
      navigate("/campus/overview", { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create the account. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-campus-surface className="min-h-screen bg-background text-foreground">
      {/* ---- Hero: exactly one focal point, one CTA ---- */}
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            ProvenHire
          </Link>
          <Link
            to="/campus/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Already onboarded? Sign in
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        {/* Ambient gold bloom behind the headline, at very low opacity so it
            adds depth without touching contrast. Deliberately a radial gradient
            rather than a blurred element: a 120px filter on a box this size
            creates its own compositing layer, which was measurably expensive
            and dropped the whole section from paint on weaker GPUs. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 -left-32 h-[36rem] w-[36rem] bg-[radial-gradient(circle,hsl(var(--gold)/0.10)_0%,hsl(var(--gold)/0.04)_38%,transparent_70%)]"
        />
        <div className="relative container mx-auto max-w-6xl px-6 pt-20 pb-24 grid gap-14 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div>
          <Reveal immediate>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              For colleges &amp; universities
            </p>
          </Reveal>
          <Reveal immediate delayMs={70}>
            <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.08] tracking-tight">
              Know which students are placement&#8209;ready
              <span className="text-muted-foreground"> — before recruiters arrive.</span>
            </h1>
          </Reveal>
          <Reveal immediate delayMs={140}>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
              Run your batch through four assessed rounds and get one clear read on where they
              stand.
            </p>
          </Reveal>
          <Reveal immediate delayMs={210}>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button
                size="lg"
                className="group h-12 px-7 text-base shadow-[0_6px_24px_hsl(var(--primary)/0.28)] transition-all duration-300 hover:shadow-[0_10px_34px_hsl(var(--primary)/0.42)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                asChild
              >
                <a href="#start">
                  Create your placement cell account
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
                </a>
              </Button>
              <span className="text-sm text-muted-foreground">
                Three fields. No card required.
              </span>
            </div>
          </Reveal>
          </div>

          <Reveal immediate delayMs={280} motion="none">
            <CampusJourneyCard />
          </Reveal>
        </div>
      </section>

      {/* ---- The four rounds: numbered step diagram, one line each ---- */}
      <section className="border-t border-border bg-white/[0.02]">
        <div className="container mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              What your students go through
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROUNDS.map((round, index) => {
              const Icon = round.icon;
              return (
                <Reveal key={round.name} delayMs={index * 110}>
                  {/* group + a real hover state: these read as inspectable
                      objects rather than static text. The card lifts, its
                      border warms, and the icon fills. */}
                  <div className="group relative h-full rounded-xl border border-transparent p-5 -mx-1 transition-all duration-300 hover:border-primary/20 hover:bg-primary/[0.04] hover:-translate-y-1 motion-reduce:hover:translate-y-0">
                    {/* Connector, desktop only - implies order without an arrow graphic */}
                    {index < ROUNDS.length - 1 && (
                      <div
                        aria-hidden="true"
                        className="hidden lg:block absolute top-[2.25rem] left-[calc(1.25rem+2.5rem+0.75rem)] right-[-1.75rem] h-px bg-border"
                      />
                    )}
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 transition-all duration-300 group-hover:border-primary/50 group-hover:bg-primary/20 group-hover:scale-110 motion-reduce:group-hover:scale-100">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="mt-5 text-xs font-medium text-primary">Round {index + 1}</p>
                    <h3 className="mt-1.5 text-lg font-semibold">{round.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {round.line}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- The outcome. This is what actually converts a placement officer:
             reporting visibility. Explicitly labelled as an illustration so
             nobody mistakes the shape of the report for real numbers. ---- */}
      <section className="border-t border-border">
        <div className="container mx-auto max-w-6xl px-6 py-20 grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              One read on the whole batch
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Not a spreadsheet of scores. You see how many students are ready, which topics are
              holding the rest back, and who needs attention first.
            </p>
            <ul className="mt-8 space-y-1">
              {[
                "Placement-ready count, updated as students finish",
                "The topics costing you the most students",
                "Per-student detail when you need to act on it",
              ].map((item) => (
                <li
                  key={item}
                  className="group flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 text-sm transition-colors duration-200 hover:bg-white/[0.03]"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-hover:scale-110 motion-reduce:group-hover:scale-100" />
                  <span className="text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delayMs={140} motion="none">
            {/* Deliberately a different cut of the data from the hero journey
                card, which already shows the headline placement-ready count.
                Repeating it here would waste the second-best slot on the page. */}
            <div className="group rounded-xl border border-border bg-card p-7 transition-all duration-500 hover:border-primary/25 hover:shadow-[0_0_40px_hsl(var(--gold)/0.10)]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Illustration &middot; where the batch is losing marks
              </p>
              <div className="mt-6 space-y-4">
                {[
                  { topic: "Dynamic Programming", round: "Coding", pct: 31 },
                  { topic: "Window Functions", round: "SQL", pct: 34 },
                  { topic: "Graphs", round: "Coding", pct: 36 },
                  { topic: "Verbal Reasoning", round: "Aptitude", pct: 63 },
                ].map((row, index) => (
                  <div key={row.topic}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">
                        {row.topic}
                        <span className="ml-2 text-xs text-muted-foreground">{row.round}</span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">{row.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <GrowBar
                        percent={row.pct}
                        delayMs={index * 120}
                        className={row.pct < 50 ? "bg-red-400" : "bg-amber-400"}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground leading-relaxed">
                Fixing Dynamic Programming alone would move more students than any other single
                topic.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Setup, so the effort is legible before they commit ---- */}
      <section className="border-t border-border bg-white/[0.02]">
        <div className="container mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Setting up takes minutes
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {SETUP_STEPS.map((step, index) => (
              <Reveal key={step.title} delayMs={index * 120}>
                <div className="group relative h-full rounded-xl border border-transparent p-5 -mx-1 transition-all duration-300 hover:border-primary/20 hover:bg-primary/[0.04]">
                  {/* The step number is the affordance: it brightens and grows
                      on hover, marking which step you're inspecting. */}
                  <span className="inline-block text-sm font-medium tabular-nums text-primary/70 transition-all duration-300 group-hover:text-primary group-hover:scale-110 motion-reduce:group-hover:scale-100">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.line}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Signup: three fields, nothing else ---- */}
      <section id="start" className="border-t border-border scroll-mt-8">
        <div className="container mx-auto max-w-6xl px-6 py-20 grid gap-14 lg:grid-cols-2 lg:items-start">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Create your placement cell account
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Three fields to start. Address, affiliation and the rest live in Settings — add them
              whenever it suits you.
            </p>
            <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
              You can build your first drive straight away. We verify your institution before it
              opens to students.
            </p>
          </Reveal>

          <Reveal
            delayMs={120}
            motion="none"
            className="rounded-xl border border-border bg-card p-7 transition-colors duration-500 focus-within:border-primary/30"
          >
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="institution-name">Institution name</Label>
              <Input
                id="institution-name"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. Ramaiah Institute of Technology"
                autoComplete="organization"
                className="h-11 transition-all duration-200 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="institution-email">Work email</Label>
              <Input
                id="institution-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="placements@yourcollege.edu"
                autoComplete="email"
                className="h-11 transition-all duration-200 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="institution-password">Password</Label>
              <Input
                id="institution-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="h-11 transition-all duration-200 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, including a letter and a number.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive animate-fade-in-scale"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 shadow-[0_4px_18px_hsl(var(--primary)/0.22)] transition-all duration-300 hover:shadow-[0_8px_28px_hsl(var(--primary)/0.36)] disabled:shadow-none"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already onboarded?{" "}
              <Link to="/campus/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          ProvenHire · Campus placement readiness
        </div>
      </footer>
    </div>
  );
}
