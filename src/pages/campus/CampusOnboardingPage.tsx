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
    <div className="min-h-screen bg-background text-foreground">
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

      <section className="container mx-auto max-w-6xl px-6 pt-20 pb-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary mb-6">
          For colleges &amp; universities
        </p>
        <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.08] tracking-tight">
          Know which students are placement&#8209;ready
          <span className="text-muted-foreground"> — before recruiters arrive.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
          Run your batch through four assessed rounds and get one clear read on where they stand.
        </p>
        <div className="mt-10">
          <Button size="lg" className="h-12 px-7 text-base" asChild>
            <a href="#start">
              Create your placement cell account
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* ---- The four rounds: numbered step diagram, one line each ---- */}
      <section className="border-t border-border bg-white/[0.02]">
        <div className="container mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            What your students go through
          </h2>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {ROUNDS.map((round, index) => {
              const Icon = round.icon;
              return (
                <div key={round.name} className="relative">
                  {/* Connector, desktop only - implies order without an arrow graphic */}
                  {index < ROUNDS.length - 1 && (
                    <div
                      aria-hidden="true"
                      className="hidden lg:block absolute top-5 left-[calc(2.5rem+1rem)] right-[-2rem] h-px bg-border"
                    />
                  )}
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-5 text-xs font-medium text-primary">
                    Round {index + 1}
                  </p>
                  <h3 className="mt-1.5 text-lg font-semibold">{round.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {round.line}
                  </p>
                </div>
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
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              One read on the whole batch
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Not a spreadsheet of scores. You see how many students are ready, which topics are
              holding the rest back, and who needs attention first.
            </p>
            <ul className="mt-8 space-y-3.5">
              {[
                "Placement-ready count, updated as students finish",
                "The topics costing you the most students",
                "Per-student detail when you need to act on it",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-7">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Illustration
            </p>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-5xl font-semibold tabular-nums">148</span>
              <span className="text-sm text-muted-foreground">
                of 214 placement&#8209;ready
              </span>
            </div>
            <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="bg-primary" style={{ width: "69%" }} />
              <div className="bg-primary/30" style={{ width: "21%" }} />
            </div>
            <div className="mt-8 space-y-4 border-t border-border pt-6">
              {[
                { label: "Weakest topic", value: "Dynamic Programming" },
                { label: "Behind in 2+ rounds", value: "18 students" },
                { label: "Strongest area", value: "Arrays & Strings" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Setup, so the effort is legible before they commit ---- */}
      <section className="border-t border-border bg-white/[0.02]">
        <div className="container mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Setting up takes minutes
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {SETUP_STEPS.map((step, index) => (
              <div key={step.title}>
                <span className="text-sm font-medium tabular-nums text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Signup: three fields, nothing else ---- */}
      <section id="start" className="border-t border-border scroll-mt-8">
        <div className="container mx-auto max-w-6xl px-6 py-20 grid gap-14 lg:grid-cols-2 lg:items-start">
          <div>
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
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-card p-7 space-y-5"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="institution-name">Institution name</Label>
              <Input
                id="institution-name"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. Ramaiah Institute of Technology"
                autoComplete="organization"
                className="h-11"
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
                className="h-11"
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
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, including a letter and a number.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full h-12" disabled={submitting}>
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
