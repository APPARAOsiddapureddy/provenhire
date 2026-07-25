import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearPendingEmailVerification,
  getPendingEmailVerification,
  savePendingEmailVerification,
} from "@/lib/emailVerification";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dashboardForRole(role?: string | null): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "recruiter") return "/dashboard/recruiter";
  if (role === "expert_interviewer") return "/dashboard/expert";
  if (role === "institution") return "/campus/overview";
  return "/dashboard/jobseeker";
}

const EmailVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userRole, isInitializing, verifyEmailCode, resendEmailVerification } = useAuth();
  const pending = useMemo(() => getPendingEmailVerification(), []);
  const initialEmail = (searchParams.get("email") || pending?.email || "").trim().toLowerCase();

  const [email] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(pending?.expiresAt || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (isInitializing) return;
    if (user) {
      navigate(dashboardForRole(userRole), { replace: true });
      return;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      navigate("/auth?mode=signup", { replace: true });
    }
  }, [email, isInitializing, navigate, user, userRole]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.replace(/\D/g, "");
    if (normalizedCode.length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const verifiedUser = await verifyEmailCode(email, normalizedCode);
      clearPendingEmailVerification();
      toast.success("Email verified. Welcome to ProvenHire.");
      navigate(dashboardForRole(verifiedUser.role), { replace: true });
    } catch (err: any) {
      const data = err?.response?.data as { code?: string; remainingAttempts?: number; error?: string } | undefined;
      if (data?.code === "VERIFICATION_CODE_EXPIRED") {
        setError("That code has expired. Request a new verification code.");
      } else if (data?.code === "VERIFICATION_CODE_LOCKED") {
        setError("Too many incorrect attempts. Request a new verification code.");
      } else if (data?.remainingAttempts != null) {
        setError(`Invalid code. ${data.remainingAttempts} attempt${data.remainingAttempts === 1 ? "" : "s"} remaining.`);
      } else {
        setError(data?.error || err?.message || "Verification failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setError("");
    setResending(true);
    try {
      const response = await resendEmailVerification(email);
      setExpiresAt(response.expiresAt || "");
      savePendingEmailVerification({
        email,
        role: response.role,
        expiresAt: response.expiresAt,
        message: response.message,
      });
      setCooldown(60);
      toast.success(response.message || "Verification code sent.");
    } catch (err: any) {
      const data = err?.response?.data as { code?: string; retryAfterSeconds?: number; error?: string } | undefined;
      if (data?.code === "VERIFICATION_RESEND_COOLDOWN") {
        const retryAfter = Number(data.retryAfterSeconds || 60);
        setCooldown(retryAfter);
        setError(data.error || `Please wait ${retryAfter} seconds before requesting another code.`);
      } else {
        setError(data?.error || err?.message || "Could not resend the verification code.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--background))]">
      <SEO
        title="Verify Email | ProvenHire"
        description="Verify your email address to finish creating your ProvenHire account."
        path="/verify-email"
      />
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl sm:p-8">
          <button
            type="button"
            onClick={() => navigate(`/auth?mode=signup&email=${encodeURIComponent(email)}`, { replace: true })}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to signup
          </button>

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the code sent to <span className="font-medium text-foreground">{email}</span>.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5" noValidate>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Verification code</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  maxLength={6}
                  className={`w-full rounded-lg border bg-background py-3 pl-10 pr-4 text-center text-lg font-semibold tracking-[0.45em] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                    error ? "border-red-500/80 bg-red-500/5" : "border-border"
                  }`}
                />
              </div>
              {expiresAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Code expires at {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                </p>
              )}
              {error && <p className="mt-2 text-xs text-red-400/95">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Verifying..." : "Verify and continue"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Did not receive it?</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="inline-flex items-center gap-2 font-semibold text-primary transition hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending..." : "Resend code"}
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default EmailVerification;
