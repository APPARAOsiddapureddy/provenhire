import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function CampusLoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // The shared ProtectedRoute redirect sends an institution user to
      // /campus/overview; any other role lands on their own dashboard.
      navigate("/campus/overview", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Check your details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-campus-surface className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-6 py-5">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            ProvenHire
          </Link>
        </div>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-6 py-16 overflow-hidden">
        {/* Radial gradient rather than a blurred box - see the note on the
            onboarding page hero. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,hsl(var(--gold)/0.09)_0%,hsl(var(--gold)/0.03)_40%,transparent_70%)]"
        />
        <div className="relative w-full max-w-sm animate-fade-in-scale">
          <h1 className="text-2xl font-semibold tracking-tight">Placement cell sign in</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Use the email you onboarded your institution with.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="campus-email">Email</Label>
              <Input
                id="campus-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-11 transition-all duration-200 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus-password">Password</Label>
              <Input
                id="campus-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11 transition-all duration-200 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
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
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-8 text-sm text-muted-foreground">
            Not onboarded yet?{" "}
            <Link to="/campus" className="text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
