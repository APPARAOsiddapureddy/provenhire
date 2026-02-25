import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mail, Lock, User, Briefcase, CheckCircle, ArrowLeft, Shield, Award } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const roleFromUrl = searchParams.get('role');
  const modeFromUrl = searchParams.get('mode');
  const referralCodeFromUrl = searchParams.get('ref');
  const emailFromUrl = searchParams.get('email');
  const resetSuccess = searchParams.get('reset') === '1';
  
  const [authMode, setAuthMode] = useState<AuthMode>(
    modeFromUrl === 'reset' ? 'reset' : (roleFromUrl === 'recruiter' ? 'signup' : (referralCodeFromUrl ? 'signup' : 'login'))
  );

  const isLogin = authMode === 'login';
  const isSignup = authMode === 'signup';
  const isForgot = authMode === 'forgot';
  const isReset = authMode === 'reset';

  // Login State
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [loginRole, setLoginRole] = useState<"jobseeker" | "recruiter" | "admin" | "expert_interviewer">(
    roleFromUrl === 'recruiter' ? 'recruiter' : 'jobseeker'
  );

  // Register State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"jobseeker" | "recruiter">(roleFromUrl === 'recruiter' ? 'recruiter' : 'jobseeker');
  // Job seeker track (PRD v4.1: Technical vs Non-Technical)
  const [jobSeekerTrack, setJobSeekerTrack] = useState<"tech" | "non_tech">("tech");
  // Recruiter specific fields (minimal)
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState("");

  // Forgot/Reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetUserEmail, setResetUserEmail] = useState("");
  const [resetUpdating, setResetUpdating] = useState(false);

  const { signUp, signIn, user, userRole, loading, resetPassword, updatePassword } = useAuth();
  const navigate = useNavigate();

  // When user is set but role is still loading, show redirecting state so we don't flash the login form
  const isRedirecting = Boolean(user && userRole === null && authMode !== 'reset' && !isReset);

  useEffect(() => {
    if (!user || authMode === 'reset') return;
    // Only redirect when role is known so ProtectedRoute doesn't show a full-screen loader
    if (userRole === "admin") {
      navigate("/admin/dashboard", { replace: true });
    } else if (userRole === "recruiter") {
      navigate("/dashboard/recruiter", { replace: true });
    } else if (userRole === "expert_interviewer") {
      navigate("/dashboard/expert", { replace: true });
    } else if (userRole === "jobseeker") {
      navigate("/dashboard/jobseeker", { replace: true });
    }
  }, [user, userRole, navigate, authMode]);

  useEffect(() => {
    if (emailFromUrl) {
      setSignInEmail(emailFromUrl);
    }
  }, [emailFromUrl]);

  useEffect(() => {
    if (!isReset) return;
    const hydrateSessionFromUrl = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
      const searchParams = new URLSearchParams(window.location.search);
      const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token");
      if (accessToken && refreshToken) {
        sessionStorage.setItem("ph_recovery_access_token", accessToken);
        sessionStorage.setItem("ph_recovery_refresh_token", refreshToken);
      }
      const storedAccessToken = sessionStorage.getItem("ph_recovery_access_token");
      const storedRefreshToken = sessionStorage.getItem("ph_recovery_refresh_token");
      const finalAccessToken = accessToken || storedAccessToken;
      const finalRefreshToken = refreshToken || storedRefreshToken;
      if (finalAccessToken && finalRefreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });
        if (error) {
          console.error("Failed to load session from URL:", error);
        } else {
          sessionStorage.removeItem("ph_recovery_access_token");
          sessionStorage.removeItem("ph_recovery_refresh_token");
        }
        if (data?.user?.email) {
          setResetUserEmail(data.user.email);
        } else if (data?.session?.user?.email) {
          setResetUserEmail(data.session.user.email);
        }
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        setResetUserEmail(data.user.email);
      }
    };

    hydrateSessionFromUrl();
  }, [isReset]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail?.trim()) {
      toast.error("Please enter your email");
      return;
    }
    const isDemo = searchParams.get('demo') === '1';
    if (!isDemo && !signInPassword?.trim()) {
      toast.error("Please enter your password");
      return;
    }
    try {
      if (isDemo) {
        await signIn(signInEmail.trim(), signInPassword || "any", loginRole);
      } else {
        await signIn(signInEmail.trim(), signInPassword || "");
      }
    } catch (err: any) {
      const msg = err?.message ?? "Sign in failed";
      toast.error(msg.includes("Invalid") ? "Invalid email or password." : msg);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    if (role === "recruiter" && !companyName) {
      toast.error("Please enter your company name");
      return;
    }

    try {
      if (role === "jobseeker") {
        try {
          localStorage.setItem("ph_signup_track", jobSeekerTrack);
        } catch (_) {}
      }
      const tempPassword = crypto.randomUUID();
      await signUp(
        email,
        tempPassword,
        role,
        undefined,
        role === 'recruiter' ? companyName : undefined,
        referralCodeFromUrl || undefined
      );
      setAuthMode('login');
    } catch (error) {
      // Error handled in context
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }

    try {
      await resetPassword(resetEmail);
      setResetEmail("");
    } catch (error) {
      // Error handled in context
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmNewPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      setResetUpdating(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
        const searchParams = new URLSearchParams(window.location.search);
        const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token");
        const storedAccessToken = sessionStorage.getItem("ph_recovery_access_token");
        const storedRefreshToken = sessionStorage.getItem("ph_recovery_refresh_token");
        const finalAccessToken = accessToken || storedAccessToken;
        const finalRefreshToken = refreshToken || storedRefreshToken;
        if (finalAccessToken && finalRefreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: finalAccessToken,
            refresh_token: finalRefreshToken,
          });
          if (error) {
            console.error("Failed to hydrate session for reset:", error);
          } else {
            sessionStorage.removeItem("ph_recovery_access_token");
            sessionStorage.removeItem("ph_recovery_refresh_token");
          }
        }
      }
      const { data: refreshedSession } = await supabase.auth.getSession();
      if (!refreshedSession?.session) {
        toast.error("Reset session expired. Please use the email link again.");
        return;
      }

      const role = await updatePassword(newPassword);
      const emailForLogin = resetUserEmail || emailFromUrl || "";
      if (emailForLogin) {
        setSignInEmail(emailForLogin);
      }
      // Navigate straight to dashboard so the app doesn't sit on /auth waiting for refresh
      if (role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (role === "recruiter") {
        navigate("/dashboard/recruiter", { replace: true });
      } else if (role === "expert_interviewer") {
        navigate("/dashboard/expert", { replace: true });
      } else {
        navigate("/dashboard/jobseeker", { replace: true });
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update password");
    } finally {
      setResetUpdating(false);
    }
  };

  // Forgot Password Form
  if (isForgot) {
    return (
      <div className="auth-page auth-login-mode">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-subtle">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8 border border-border">
            <button
              onClick={() => setAuthMode('login')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </button>
            
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Forgot Password?</h1>
              <p className="text-muted-foreground mt-2">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-hero text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <span className="text-muted-foreground">Remember your password? </span>
              <button
                onClick={() => setAuthMode('login')}
                className="text-primary font-semibold hover:underline"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Redirecting to dashboard (user set, role still loading) — avoids flash of login form and ensures dashboard gets role before mount
  if (isRedirecting) {
    return (
      <div className="auth-page auth-login-mode min-h-screen flex items-center justify-center bg-gradient-subtle">
        <Navbar />
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  // Reset Password Form (after clicking email link)
  if (isReset) {
    return (
      <div className="auth-page auth-login-mode">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-subtle">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8 border border-border">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Create Your Password</h1>
              <p className="text-muted-foreground mt-2">
                Create a new password to activate your account.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={resetUserEmail || emailFromUrl || ""}
                    readOnly
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-muted/50 text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetUpdating}
                className="w-full py-3 px-4 bg-gradient-hero text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetUpdating ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`auth-page ${isLogin ? "auth-login-mode" : "auth-signup-mode"}`}>
      <Navbar />

      <div className="min-h-screen flex">
        {/* Sign Up: Left Side Benefits Panel */}
        {isSignup && (
          <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero p-12 flex-col justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative z-10">
              <div className="mb-4">
                <span className="bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full">
                  India's First Skill-Certified Hiring Network
                </span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">
                Join ProvenHire Today
              </h2>
              <p className="text-white/80 text-lg mb-8">
                Every candidate is technically proven, not resume approved. Only 18% of candidates pass our rigorous 3-stage verification.
              </p>

              <div className="space-y-6">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-lg font-semibold">3-Stage Verification</span>
                    <p className="text-white/70 text-sm">Aptitude, Skills & Expert Interview</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-lg font-semibold">ProvenHire Skill Passport</span>
                    <p className="text-white/70 text-sm">Your verified skills, trusted by employers</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-white">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-lg font-semibold">Certified Levels A/B/C</span>
                    <p className="text-white/70 text-sm">Get ranked based on your performance</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 p-4 bg-white/10 rounded-lg border border-white/20">
                <p className="text-white/90 italic">
                  "Recruiters don't interview — they validate fit."
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Form Area */}
        <div className={`flex-1 flex items-center justify-center p-6 ${isLogin ? "bg-gradient-subtle" : "bg-background"}`}>
          <div
            className={`w-full ${isSignup ? "max-w-xl" : "max-w-md"} bg-card rounded-2xl shadow-xl p-8 border border-border`}
          >
            {/* Login Header with Logo */}
            {isLogin && (
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <User className="h-8 w-8 text-primary" />
                </div>
              </div>
            )}

            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground">
                {isLogin ? "Welcome Back" : "Create Account"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isLogin
                  ? (searchParams.get('demo') === '1'
                      ? "Demo: choose your dashboard after sign in"
                      : "Sign in to your account. You’ll be taken to your dashboard.")
                  : "Enter your email to receive a password setup link"}
              </p>
            </div>
            {isLogin && resetSuccess && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Password updated successfully. Please sign in to continue.
              </div>
            )}

            <form
              onSubmit={isLogin ? handleSignIn : handleSignUp}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={isLogin ? signInEmail : email}
                    onChange={(e) =>
                      isLogin
                        ? setSignInEmail(e.target.value)
                        : setEmail(e.target.value)
                    }
                    required
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {isLogin && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>
                  {searchParams.get('demo') === '1' && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">
                        Go to dashboard (demo only)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button
                          type="button"
                          onClick={() => setLoginRole("jobseeker")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            loginRole === "jobseeker"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <User className="h-5 w-5" />
                          <span className="font-medium">Job Seeker</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginRole("recruiter")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            loginRole === "recruiter"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Briefcase className="h-5 w-5" />
                          <span className="font-medium">Recruiter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginRole("expert_interviewer")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            loginRole === "expert_interviewer"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Award className="h-5 w-5" />
                          <span className="font-medium">Expert</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginRole("admin")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            loginRole === "admin"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Shield className="h-5 w-5" />
                          <span className="font-medium">Admin</span>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-end text-sm">
                    <button
                      type="button"
                      onClick={() => setAuthMode('forgot')}
                      className="text-primary hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              )}

              {isSignup && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">
                      I am a...
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setRole("jobseeker")}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          role === "jobseeker"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <User className="h-6 w-6" />
                        <span className="font-medium">Job Seeker</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("recruiter")}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          role === "recruiter"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Briefcase className="h-6 w-6" />
                        <span className="font-medium">Recruiter</span>
                      </button>
                    </div>
                  </div>
                  {role === "jobseeker" && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">
                        Verification track (PRD v4.1)
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setJobSeekerTrack("tech")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            jobSeekerTrack === "tech"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span className="font-medium">Technical</span>
                          <span className="text-xs text-muted-foreground">5 stages, Skill Passport</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setJobSeekerTrack("non_tech")}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 text-sm ${
                            jobSeekerTrack === "non_tech"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span className="font-medium">Non-Technical</span>
                          <span className="text-xs text-muted-foreground">2 stages + assignments</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Simplified Recruiter Company Details */}
              {isSignup && role === "recruiter" && (
                <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h3 className="font-semibold text-foreground">Company Details</h3>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Company Name *
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="e.g. TechCorp Inc"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Team Size *
                    </label>
                    <select
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="">Select size</option>
                      <option value="1-10">1-10 employees</option>
                      <option value="11-50">11-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="501-1000">501-1000 employees</option>
                      <option value="1000+">1000+ employees</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-hero text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading
                  ? "Processing..."
                  : isLogin
                  ? "Sign In"
                  : "Send Password Link"}
              </button>
            </form>

            {/* Info Box for Job Seekers */}
            {isSignup && role === "jobseeker" && (
              <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg">
                <p className="text-sm font-semibold text-accent mb-1">
                  What happens next?
                </p>
                <p className="text-sm text-muted-foreground">
                  {jobSeekerTrack === "tech"
                    ? "Technical track: Profile → Aptitude → DSA → AI Interview → Human Expert. Get your Skill Passport (Expert Verified)."
                    : "Non-Technical track: Profile → Role AI Interview. Then per-job assignments. Get your Non-Tech Verified badge."}
                </p>
              </div>
            )}

            {isSignup && role === "recruiter" && (
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <p className="text-sm font-semibold text-primary mb-1">
                  What's Included?
                </p>
                <p className="text-sm text-muted-foreground">
                  Access skill-certified candidates. No more screening — just validate fit. Reduce time-to-hire by 60%.
                </p>
              </div>
            )}

            <div className="mt-6 text-center">
              <span className="text-muted-foreground">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                onClick={() => setAuthMode(isLogin ? 'signup' : 'login')}
                className="text-primary font-semibold hover:underline"
              >
                {isLogin ? "Sign Up" : "Sign In"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Auth;
