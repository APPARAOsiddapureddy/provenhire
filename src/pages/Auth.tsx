import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mail, Lock, User, Briefcase, Shield, Award, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";

type AuthMode = "login" | "signup" | "forgot" | "reset";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const roleFromUrl = searchParams.get("role");
  const modeFromUrl = searchParams.get("mode");
  const referralCodeFromUrl = searchParams.get("ref");
  const emailFromUrl = searchParams.get("email");
  const resetTokenFromUrl = searchParams.get("token");
  const resetSuccess = searchParams.get("reset") === "1";

  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    if (modeFromUrl === "reset") return "reset";
    if (modeFromUrl === "signup") return "signup";
    if (modeFromUrl === "login") return "login";
    return roleFromUrl === "recruiter" ? "signup" : referralCodeFromUrl ? "signup" : "login";
  });

  useEffect(() => {
    if (modeFromUrl === "reset") setAuthMode("reset");
    else if (modeFromUrl === "signup") setAuthMode("signup");
    else if (modeFromUrl === "login") setAuthMode("login");
  }, [modeFromUrl]);

  const isLogin = authMode === "login";
  const isSignup = authMode === "signup";
  const isForgot = authMode === "forgot";
  const isReset = authMode === "reset";
  const showSignUp = isSignup;

  // Login
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [loginRole, setLoginRole] = useState<"jobseeker" | "recruiter" | "admin" | "expert_interviewer">(
    roleFromUrl === "recruiter" ? "recruiter" : "jobseeker"
  );

  // Sign Up (fullName removed — fetched in profile setup)
  const [email, setEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [role, setRole] = useState<"jobseeker" | "recruiter">(roleFromUrl === "recruiter" ? "recruiter" : "jobseeker");
  const [jobSeekerTrack, setJobSeekerTrack] = useState<"tech" | "non_tech">("tech");
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState("");

  // Forgot / Reset
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetUserEmail, setResetUserEmail] = useState("");
  const [resetUpdating, setResetUpdating] = useState(false);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const { signUp, signIn, user, userRole, loading, resetPassword } = useAuth();
  const navigate = useNavigate();

  const isRedirecting = Boolean(user && userRole === null && authMode !== "reset" && !isReset);

  useEffect(() => {
    if (!user || authMode === "reset") return;
    if (userRole === "admin") navigate("/admin/dashboard", { replace: true });
    else if (userRole === "recruiter") navigate("/dashboard/recruiter", { replace: true });
    else if (userRole === "expert_interviewer") navigate("/dashboard/expert", { replace: true });
    else if (userRole === "jobseeker") navigate("/dashboard/jobseeker", { replace: true });
  }, [user, userRole, navigate, authMode]);

  useEffect(() => {
    if (emailFromUrl) setSignInEmail(emailFromUrl);
  }, [emailFromUrl]);

  useEffect(() => {
    if (isReset && emailFromUrl) setResetUserEmail(emailFromUrl);
  }, [isReset, emailFromUrl]);

  const switchMode = (mode: "login" | "signup") => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (roleFromUrl) params.set("role", roleFromUrl);
    if (referralCodeFromUrl) params.set("ref", referralCodeFromUrl);
    if (mode === "login" && email?.trim()) params.set("email", email.trim());
    navigate(`/auth?${params.toString()}`, { replace: true });
    setAuthMode(mode);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail?.trim()) {
      toast.error("Please enter your email");
      return;
    }
    const isDemo = searchParams.get("demo") === "1";
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
    if (!signUpPassword || !signUpConfirmPassword) {
      toast.error("Please enter and confirm your password");
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (signUpPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (role === "recruiter" && !companyName) {
      toast.error("Please enter your company name");
      return;
    }
    try {
      const roleType = role === "jobseeker" ? (jobSeekerTrack === "tech" ? "technical" : "non_technical") : undefined;
      await signUp(
        email,
        signUpPassword,
        role,
        undefined,
        role === "recruiter" ? companyName : undefined,
        role === "recruiter" ? companySize : undefined,
        roleType
      );
      switchMode("login");
      setSignInEmail(email.trim());
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
    if (!resetTokenFromUrl) {
      toast.error("Please use the reset link from your email. The link contains a secure token.");
      return;
    }
    try {
      setResetUpdating(true);
      await api.post("/api/auth/reset-password", {
        token: resetTokenFromUrl,
        newPassword,
      });
      toast.success("Password updated successfully. Please sign in again.");
      navigate("/auth?mode=login&reset=1", { replace: true });
    } catch (error: any) {
      toast.error(error?.message || "Password reset failed.");
    } finally {
      setResetUpdating(false);
    }
  };

  // Forgot Password
  if (isForgot) {
    return (
      <div className="auth-page min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6 bg-[hsl(var(--background))]">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8 border border-border">
            <button
              type="button"
              onClick={() => navigate("/auth?mode=login", { replace: true })}
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
              <p className="text-muted-foreground mt-2">Enter your email and we'll send you a link to reset your password.</p>
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
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <div className="mt-6 text-center">
              <span className="text-muted-foreground">Remember your password? </span>
              <button type="button" onClick={() => navigate("/auth?mode=login", { replace: true })} className="text-primary font-semibold hover:underline">
                Sign In
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Redirecting
  if (isRedirecting) {
    return (
      <div className="auth-page min-h-screen flex flex-col items-center justify-center bg-[hsl(var(--background))]">
        <Navbar />
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  // Reset Password
  if (isReset) {
    return (
      <div className="auth-page min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6 bg-[hsl(var(--background))]">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-xl p-8 border border-border">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Create Your Password</h1>
              <p className="text-muted-foreground mt-2">Create a new password to activate your account.</p>
            </div>
            {!resetTokenFromUrl && (
              <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Use the reset link from your email. The link contains a secure token required to set a new password.
              </div>
            )}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={resetUserEmail || emailFromUrl || ""}
                    readOnly
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-muted/50 text-muted-foreground"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showConfirmNewPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={resetUpdating || !resetTokenFromUrl}
                className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {resetUpdating ? "Updating..." : !resetTokenFromUrl ? "Reset link required" : "Update Password"}
              </button>
            </form>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const TICKER_SIGNIN = ["Skill-Certified Hiring", "Not Resume-Approved", "5-Stage Verification", "Expert Interviews", "Skill Passport", "India's First"];
  const TICKER_SIGNUP = ["Get Verified Free", "Aptitude Test", "DSA Round", "AI Interview", "Human Expert Interview", "Earn Skill Passport"];

  const SignInBenefits = () => (
    <div className="auth-panel-benefits">
      <div className="auth-orb auth-orb-1" aria-hidden />
      <div className="auth-orb auth-orb-2" aria-hidden />
      <div className="auth-orb auth-orb-3" aria-hidden />
      <div className="auth-ticker-bar">
        <div className="auth-ticker-inner">
          {[...TICKER_SIGNIN, ...TICKER_SIGNIN].flatMap((t, i) => [<span key={`t1-${i}`}>{t}</span>, <span key={`s1-${i}`} className="auth-ticker-sep">✦</span>])}
        </div>
      </div>
      <div className="auth-benefits-content">
        <div className="auth-benefits-eyebrow">
          <div className="auth-benefits-dot" />
          India's First Skill-Certified Hiring Network
        </div>
        <h2 className="auth-benefits-headline">
          <span className="block">Résumés are <span className="dd">claims.</span></span>
          <span className="block gg">We deal in proof.</span>
        </h2>
        <p className="auth-benefits-desc">Only 18% of candidates make it through our 5-stage verification. Your skills get proven, not assumed.</p>
        <div className="auth-stat-row">
          <div className="auth-stat-cell">
            <div className="auth-stat-num">18%</div>
            <div className="auth-stat-label">Pass Rate</div>
          </div>
          <div className="auth-stat-cell">
            <div className="auth-stat-num">24H</div>
            <div className="auth-stat-label">To Certify</div>
          </div>
          <div className="auth-stat-cell">
            <div className="auth-stat-num">5</div>
            <div className="auth-stat-label">Stages</div>
          </div>
        </div>
      </div>
    </div>
  );

  const SignUpBenefits = () => (
    <div className="auth-panel-benefits">
      <div className="auth-orb auth-orb-1" aria-hidden />
      <div className="auth-orb auth-orb-2" aria-hidden />
      <div className="auth-orb auth-orb-3" aria-hidden />
      <div className="auth-ticker-bar">
        <div className="auth-ticker-inner">
          {[...TICKER_SIGNUP, ...TICKER_SIGNUP].flatMap((t, i) => [<span key={`t2-${i}`}>{t}</span>, <span key={`s2-${i}`} className="auth-ticker-sep">✦</span>])}
        </div>
      </div>
      <div className="auth-benefits-content">
        <div className="auth-benefits-eyebrow">
          <div className="auth-benefits-dot" />
          The Verification Journey Starts Here
        </div>
        <h2 className="auth-benefits-headline">
          <span className="block gg">Your college name</span>
          <span className="block">won't get you hired.</span>
          <span className="block dd">Your skills will.</span>
        </h2>
        <p className="auth-benefits-desc">Prove them. Once. Forever. Stage 1 → 5: Profile → Aptitude → DSA → AI Interview → Human Expert Interview.</p>
        <div className="auth-stat-row">
          <div className="auth-stat-cell">
            <div className="auth-stat-num">5</div>
            <div className="auth-stat-label">Stages</div>
          </div>
          <div className="auth-stat-cell">
            <div className="auth-stat-num">65%</div>
            <div className="auth-stat-label">To Advance</div>
          </div>
          <div className="auth-stat-cell">
            <div className="auth-stat-num">₹0</div>
            <div className="auth-stat-label">Cost</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="auth-page min-h-screen flex flex-col">
      <Navbar />

      {/* Desktop: split sliding layout */}
      <div className="auth-split-stage hidden lg:flex flex-1 pt-16">
        <div className={`auth-track flex-shrink-0 ${showSignUp ? "auth-track-signup" : ""}`} style={{ minHeight: "calc(100vh - 4rem)" }}>
          {/* Half 1: Sign In (form left, benefits right) */}
          <div className="auth-half flex">
            <div className="auth-panel-form flex-shrink-0">
              <div className="auth-form-eyebrow">Sign In</div>
              <h1 className="auth-form-title">Welcome<br /><span className="gold">Back.</span></h1>
              <p className="auth-form-sub">Your verified profile is waiting. Pick up where you left off.</p>

              <form onSubmit={handleSignIn} className="space-y-0">
                <div>
                  <label className="auth-label">Email</label>
                  <div className="auth-input-wrap">
                    <Mail className="iw-icon" />
                    <input type="email" placeholder="you@example.com" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} required autoComplete="email" />
                  </div>
                </div>
                <div>
                  <label className="auth-label">Password</label>
                  <div className="auth-input-wrap">
                    <Lock className="iw-icon" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="Your password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                    />
                    <button type="button" className="iw-eye" onClick={() => setShowLoginPassword((p) => !p)} aria-label="Toggle password">
                      {showLoginPassword ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <div className="text-right mb-3">
                  <button type="button" onClick={() => setAuthMode("forgot")} className="text-xs font-semibold text-primary hover:underline transition-opacity">
                    Forgot password?
                  </button>
                </div>
                <button type="submit" className="auth-cta w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In →"}</button>
              </form>

              <p className="auth-switch">
                No account? <a onClick={() => switchMode("signup")}>Create one free →</a>
              </p>
            </div>
            <SignInBenefits />
          </div>

          {/* Half 2: Sign Up (benefits left, form right) */}
          <div className="auth-half flex">
            <SignUpBenefits />
            <div className="auth-panel-form auth-panel-form-right flex-shrink-0">
              <div className="auth-form-eyebrow">Create Account</div>
              <h1 className="auth-form-title">Start Your<br /><span className="gold">Verification.</span></h1>
              <p className="auth-form-sub">Join free. Prove your skills. Get hired by companies that trust evidence.</p>

              <form onSubmit={handleSignUp} className="space-y-0">
                <div>
                  <label className="auth-label">Email</label>
                  <div className="auth-input-wrap">
                    <Mail className="iw-icon" />
                    <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label className="auth-label">I am a</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button type="button" onClick={() => setRole("jobseeker")} className={`auth-role-tile ${role === "jobseeker" ? "on" : ""}`}>
                      <User className="h-4 w-4" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">Job Seeker</div>
                        <div className="text-[10px] text-muted-foreground">Get verified</div>
                      </div>
                    </button>
                    <button type="button" onClick={() => setRole("recruiter")} className={`auth-role-tile ${role === "recruiter" ? "on" : ""}`}>
                      <Briefcase className="h-4 w-4" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">Recruiter</div>
                        <div className="text-[10px] text-muted-foreground">Hire talent</div>
                      </div>
                    </button>
                  </div>
                </div>
                {role === "jobseeker" && (
                  <div>
                    <label className="auth-label">Track</label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button type="button" onClick={() => setJobSeekerTrack("tech")} className={`auth-role-tile ${jobSeekerTrack === "tech" ? "on" : ""}`}>
                        <div className="text-left w-full">
                          <div className="text-sm font-semibold">Technical</div>
                          <div className="text-[10px] text-muted-foreground">5 stages</div>
                        </div>
                      </button>
                      <button type="button" onClick={() => setJobSeekerTrack("non_tech")} className={`auth-role-tile ${jobSeekerTrack === "non_tech" ? "on" : ""}`}>
                        <div className="text-left w-full">
                          <div className="text-sm font-semibold">Non-Technical</div>
                          <div className="text-[10px] text-muted-foreground">3 stages</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
                {role === "recruiter" && (
                  <>
                    <div>
                      <label className="auth-label">Company Name *</label>
                      <div className="auth-input-wrap">
                        <Briefcase className="iw-icon" />
                        <input type="text" placeholder="Your company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required={role === "recruiter"} />
                      </div>
                    </div>
                    <div>
                      <label className="auth-label">Team Size</label>
                      <select
                        value={companySize}
                        onChange={(e) => setCompanySize(e.target.value)}
                        required={role === "recruiter"}
                        className="w-full py-3 px-4 rounded-md bg-white/5 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                      >
                        <option value="">Select</option>
                        <option value="1-10">1-10</option>
                        <option value="11-50">11-50</option>
                        <option value="51-200">51-200</option>
                        <option value="201-500">201-500</option>
                        <option value="501+">501+</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className="auth-label">Password</label>
                  <div className="auth-input-wrap">
                    <Lock className="iw-icon" />
                    <input
                      type={showSignUpPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button type="button" className="iw-eye" onClick={() => setShowSignUpPassword((p) => !p)}>{showSignUpPassword ? "🙈" : "👁"}</button>
                  </div>
                </div>
                <div>
                  <label className="auth-label">Confirm Password</label>
                  <div className="auth-input-wrap">
                    <Lock className="iw-icon" />
                    <input
                      type={showSignUpConfirmPassword ? "text" : "password"}
                      placeholder="Repeat password"
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button type="button" className="iw-eye" onClick={() => setShowSignUpConfirmPassword((p) => !p)}>{showSignUpConfirmPassword ? "🙈" : "👁"}</button>
                  </div>
                </div>
                <button type="submit" className="auth-cta w-full" disabled={loading}>{loading ? "Creating..." : "Start Verification →"}</button>
              </form>

              <p className="auth-switch">
                Already verified? <a onClick={() => switchMode("login")}>Sign in →</a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: single form, switch link */}
      <div className="lg:hidden flex-1 flex items-center justify-center p-6 pt-20 bg-[hsl(var(--background))]">
        <div className="w-full max-w-md">
          {isLogin ? (
            <>
              <div className="auth-form-eyebrow mb-3">Sign In</div>
              <h1 className="auth-form-title mb-2">Welcome <span className="gold">Back</span></h1>
              <p className="auth-form-sub mb-6">Sign in to your account.</p>
              {resetSuccess && (
                <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">Password updated. Please sign in.</div>
              )}
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="Password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => setShowLoginPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => setAuthMode("forgot")} className="text-sm text-primary hover:underline">Forgot password?</button>
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <p className="auth-switch mt-4">
                No account? <a onClick={() => switchMode("signup")}>Sign Up</a>
              </p>
            </>
          ) : (
            <>
              <div className="auth-form-eyebrow mb-2">Create Account</div>
              <h1 className="auth-form-title mb-1">Start Your <span className="gold">Verification</span></h1>
              <p className="auth-form-sub mb-6">Join free. Prove your skills.</p>
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">I am a</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setRole("jobseeker")} className={`p-3 rounded-lg border-2 ${role === "jobseeker" ? "border-primary bg-primary/10" : "border-border"}`}>
                      <User className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-sm font-medium">Job Seeker</span>
                    </button>
                    <button type="button" onClick={() => setRole("recruiter")} className={`p-3 rounded-lg border-2 ${role === "recruiter" ? "border-primary bg-primary/10" : "border-border"}`}>
                      <Briefcase className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-sm font-medium">Recruiter</span>
                    </button>
                  </div>
                </div>
                {role === "jobseeker" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Track</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setJobSeekerTrack("tech")} className={`p-3 rounded-lg border-2 ${jobSeekerTrack === "tech" ? "border-primary bg-primary/10" : "border-border"}`}>
                        Technical (5 stages)
                      </button>
                      <button type="button" onClick={() => setJobSeekerTrack("non_tech")} className={`p-3 rounded-lg border-2 ${jobSeekerTrack === "non_tech" ? "border-primary bg-primary/10" : "border-border"}`}>
                        Non-Technical
                      </button>
                    </div>
                  </div>
                )}
                {role === "recruiter" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Company Name *</label>
                      <input type="text" placeholder="Your company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full px-4 py-3 border border-border rounded-lg bg-background" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Team Size *</label>
                      <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} required className="w-full px-4 py-3 border border-border rounded-lg bg-background">
                        <option value="">Select</option>
                        <option value="1-10">1-10</option>
                        <option value="11-50">11-50</option>
                        <option value="51-200">51-200</option>
                        <option value="201-500">201-500</option>
                        <option value="501+">501+</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showSignUpPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-3 border border-border rounded-lg bg-background"
                    />
                    <button type="button" onClick={() => setShowSignUpPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showSignUpConfirmPassword ? "text" : "password"}
                      placeholder="Repeat password"
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-3 border border-border rounded-lg bg-background"
                    />
                    <button type="button" onClick={() => setShowSignUpConfirmPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showSignUpConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </form>
              <p className="auth-switch mt-4">
                Already have an account? <a onClick={() => switchMode("login")}>Sign In</a>
              </p>
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Auth;
