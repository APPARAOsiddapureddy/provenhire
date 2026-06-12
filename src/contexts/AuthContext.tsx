/**
 * Authentication — two isolated flows:
 *
 * 1) Email/password: `signUp` → POST /api/auth/register (then optional profile); `signIn` → POST /api/auth/login.
 *    Does not touch Firebase. Does not set Google-specific flags.
 *
 * 2) Google SSO: Firebase getIdToken → POST /api/auth/google → app JWT. Optional later: POST /api/auth/google/select-role
 *    from dashboards (JobSeeker). Uses `isGoogleSignInBusy` only during the Google handoff.
 *
 * `isInitializing` is strictly session restore on cold load (token + /api/auth/me, or OAuth return at /__/auth/handler).
 * It must not be toggled by email login/signup so those flows do not block each other or the rest of the app.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, hasAuthToken, getAuthToken, setAuthToken, setRefreshToken, isBackendDownCooldown, BACKEND_DOWN_MSG } from "@/lib/api";
import { savePendingEmailVerification } from "@/lib/emailVerification";
import {
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  getGoogleRedirectIdToken,
  isFirebaseConfigured,
  preferGoogleRedirectSignIn,
} from "@/lib/firebase";

type UserRole = "recruiter" | "jobseeker" | "admin" | "expert_interviewer" | null;

type User = {
  id: string;
  name?: string | null;
  email: string;
  role: UserRole;
  authProvider?: string | null;
};

type AuthSessionResponse = {
  user: User;
  token: string;
  refreshToken?: string;
};

type EmailVerificationResponse = {
  ok: boolean;
  requiresEmailVerification?: boolean;
  email?: string;
  role?: UserRole;
  message?: string;
  expiresAt?: string;
};

interface AuthContextType {
  user: User | null;
  userRole: UserRole;
  /** True until first session bootstrap finishes (JWT restore or Google redirect handling). */
  isInitializing: boolean;
  /** True only while the Google popup/redirect handoff to the backend is in flight. */
  isGoogleSignInBusy: boolean;
  needsGoogleRoleSelection: boolean;
  completeGoogleSignUpRole: (
    role: "jobseeker" | "recruiter",
    companyName?: string,
    companySize?: string,
    roleType?: "technical" | "non_technical"
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    fullName?: string,
    companyName?: string,
    companySize?: string,
    roleType?: "technical" | "non_technical"
  ) => Promise<EmailVerificationResponse | AuthSessionResponse>;
  signIn: (email: string, password: string, role?: UserRole) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<User>;
  resendEmailVerification: (email: string) => Promise<EmailVerificationResponse>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isGoogleSignInBusy, setIsGoogleSignInBusy] = useState(false);
  const [needsGoogleRoleSelection, setNeedsGoogleRoleSelection] = useState(false);
  const navigate = useNavigate();
  const skipNextMeRef = useRef(false);

  /** Exchange Firebase id token for app session. Returns false on API failure (toast already shown). */
  const applyGoogleSignInSession = useCallback(async (idToken: string): Promise<boolean> => {
    try {
      const data = await api.post<{ user: User; token: string; refreshToken?: string; isNewUser?: boolean }>(
        "/api/auth/google",
        { idToken }
      );
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      setUser(data.user);
      setUserRole(data.user.role);
      skipNextMeRef.current = true;
      setNeedsGoogleRoleSelection(false);
      toast.success("Signed in with Google successfully.");
      navigate(
        data.user.role === "admin"
          ? "/admin/dashboard"
          : data.user.role === "recruiter"
            ? "/dashboard/recruiter"
            : data.user.role === "expert_interviewer"
              ? "/dashboard/expert"
              : "/dashboard/jobseeker",
        { replace: true }
      );
      return true;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const apiData =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { code?: string; error?: string } } }).response?.data
          : undefined;
      const msg = err instanceof Error ? err.message : "";
      if (status === 403 && apiData?.code === "EMAIL_BLOCKED") {
        toast.error(apiData.error || "This email cannot be used to sign in.");
      } else if (status === 403) {
        toast.error(apiData?.error || "Sign-in was denied for this account.");
      } else if (status === 401) {
        toast.error(msg && msg !== "Request failed" ? msg : "Invalid or expired Google sign-in. Please try again.");
      } else {
        toast.error(msg && msg !== "Request failed" ? msg : "Google sign-in failed. Please try again.");
      }
      return false;
    }
  }, [navigate]);

  useEffect(() => {
    const bootstrap = async () => {
      if (skipNextMeRef.current) {
        skipNextMeRef.current = false;
        setIsInitializing(false);
        return;
      }

      const path =
        typeof window !== "undefined"
          ? (window.location.pathname || "").replace(/\/+$/, "") || "/"
          : "/";
      const isGoogleRedirectHandler = path === "/__/auth/handler";

      if (isGoogleRedirectHandler && isFirebaseConfigured()) {
        try {
          const idToken = await getGoogleRedirectIdToken();
          if (!idToken) {
            navigate("/auth", { replace: true });
            setIsInitializing(false);
            return;
          }
          const googleOk = await applyGoogleSignInSession(idToken);
          setIsInitializing(false);
          if (!googleOk) {
            navigate("/auth", { replace: true });
          }
          return;
        } catch (err) {
          console.warn("[AuthContext] Google redirect result failed:", err);
          navigate("/auth", { replace: true });
          setIsInitializing(false);
          return;
        }
      }

      if (!hasAuthToken()) {
        setUser(null);
        setUserRole(null);
        setIsInitializing(false);
        return;
      }
      if (isBackendDownCooldown()) {
        setIsInitializing(false);
        return;
      }
      // Capture once so stale `/me` responses can't clear a newer session.
      const tokenAtMeRequest = getAuthToken();
      try {
        // If the user signs in/out while this request is in flight (e.g. after manual signup),
        // ignore stale responses so we don't clear a fresh session.
        const fetchMe = async (): Promise<User> => {
          const { user: u } = await api.get<{ user: User }>("/api/auth/me");
          return u;
        };
        let u: User;
        try {
          u = await fetchMe();
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : "";
          const isBackendDown =
            status === 503 ||
            msg.includes("Service unavailable") ||
            msg.includes("temporarily unavailable") ||
            msg.includes("Backend not running") ||
            msg.includes("taking too long");
          if (!isBackendDown) throw err;
          // Retry once to smooth over Render cold starts / transient gateway timeouts.
          await new Promise((r) => setTimeout(r, 800));
          u = await fetchMe();
        }
        if (getAuthToken() !== tokenAtMeRequest) return;
        setUser(u);
        setUserRole(u.role);
      } catch (err: unknown) {
        // Same stale-response protection: don't clear the session if a new JWT
        // was already stored while `/api/auth/me` was in flight.
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "";
        const isBackendDown =
          status === 503 ||
          msg.includes("Service unavailable") ||
          msg.includes("temporarily unavailable") ||
          msg.includes("Backend not running") ||
          msg.includes("npm run dev");
        if (isBackendDown) {
          // keep token; BackendGate / toasts handle UX
        } else {
          // If Google sign-in is in flight, do not clear the JWT based on
          // a transient `/api/auth/me` race. We'll validate once the token is set.
          if (getAuthToken() === tokenAtMeRequest && !skipNextMeRef.current) {
            setUser(null);
            setUserRole(null);
            setAuthToken(null);
            setRefreshToken(null);
          }
        }
      } finally {
        setIsInitializing(false);
      }
    };
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; pathname read from window inside effect
  }, [applyGoogleSignInSession, navigate]);

  useEffect(() => {
    const onBackend503 = () => {
      const p = (window.location.pathname || "").split("?")[0];
      if (p !== "/auth") return;
      toast.error(BACKEND_DOWN_MSG);
    };
    window.addEventListener("ph_backend_503", onBackend503);
    return () => window.removeEventListener("ph_backend_503", onBackend503);
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null);
      setUserRole(null);
      setAuthToken(null);
      setRefreshToken(null);
      setNeedsGoogleRoleSelection(false);
      if ((window.location.pathname || "").split("?")[0] !== "/auth") {
        toast.error("Session expired. Please sign in again.");
      }
      navigate("/auth", { replace: true });
    };
    window.addEventListener("ph_session_expired", onSessionExpired);
    return () => window.removeEventListener("ph_session_expired", onSessionExpired);
  }, [navigate]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      role: UserRole,
      fullName?: string,
      companyName?: string,
      companySize?: string,
      roleType?: "technical" | "non_technical"
    ) => {
      // Email registration creates an unverified account; the session is created after code verification.
      const data = await api.post<EmailVerificationResponse | AuthSessionResponse>("/api/auth/register", {
        email: email.trim().toLowerCase(),
        password,
        role: role ?? "jobseeker",
        name: fullName ?? undefined,
        roleType: roleType ?? undefined,
        ...(role === "recruiter" && { companyName, companySize }),
      });

      if ("requiresEmailVerification" in data && data.requiresEmailVerification) {
        setAuthToken(null);
        setRefreshToken(null);
        setUser(null);
        setUserRole(null);
        setNeedsGoogleRoleSelection(false);
        savePendingEmailVerification({
          email: data.email || email.trim().toLowerCase(),
          role: data.role ?? role,
          expiresAt: data.expiresAt,
          message: data.message,
        });
        return data;
      }

      if (!("token" in data) || !data?.token) {
        throw new Error("Invalid response from server. Please try again.");
      }
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      setUser(data.user);
      setUserRole(data.user.role);
      setNeedsGoogleRoleSelection(false);
      return data;
    },
    []
  );

  const verifyEmailCode = useCallback(async (email: string, code: string): Promise<User> => {
    const data = await api.post<AuthSessionResponse & { ok: boolean; message?: string }>(
      "/api/auth/email-verification/verify",
      {
        email: email.trim().toLowerCase(),
        code,
      }
    );
    if (!data?.token || !data?.user) {
      throw new Error("Invalid verification response. Please try again.");
    }
    setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    setUser(data.user);
    setUserRole(data.user.role);
    setNeedsGoogleRoleSelection(false);
    return data.user;
  }, []);

  const resendEmailVerification = useCallback(async (email: string): Promise<EmailVerificationResponse> => {
    const data = await api.post<EmailVerificationResponse>("/api/auth/email-verification/send", {
      email: email.trim().toLowerCase(),
    });
    savePendingEmailVerification({
      email: data.email || email.trim().toLowerCase(),
      role: data.role,
      expiresAt: data.expiresAt,
      message: data.message,
    });
    return data;
  }, []);

  const signIn = useCallback(async (email: string, password: string, _role?: UserRole) => {
    void _role; // demo / UI only; login API does not accept role
    const data = await api.post<{ user: User; token: string; refreshToken?: string }>("/api/auth/login", {
      email: email.trim().toLowerCase(),
      password,
    });
    setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    setUser(data.user);
    setUserRole(data.user.role);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      toast.error("Google sign-in is not configured. Please use email and password.");
      return;
    }

    // Prevent bootstrap from clearing a JWT during the Google auth exchange.
    skipNextMeRef.current = true;
    setIsGoogleSignInBusy(true);
    try {
      if (preferGoogleRedirectSignIn()) {
        try {
          toast.info("Redirecting to Google…");
          await signInWithGoogleRedirect();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Google sign-in failed";
          toast.error(msg);
        }
        return;
      }

      try {
        const idToken = await signInWithGooglePopup();
        await applyGoogleSignInSession(idToken);
      } catch (err: unknown) {
        const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
        const message = err instanceof Error ? err.message : "";

        if (
          code === "auth/popup-blocked" ||
          /cross-origin-opener-policy|window\.closed|blocked by the browser|policy would block the window\.close/i.test(
            message,
          )
        ) {
          toast.info("Continuing Google sign-in in this window…");
          try {
            await signInWithGoogleRedirect();
          } catch (redirErr: unknown) {
            const rmsg = redirErr instanceof Error ? redirErr.message : "Redirect sign-in failed";
            toast.error(rmsg);
          }
          return;
        }
        const msg = err instanceof Error ? err.message : "Google sign-in failed";
        toast.error(msg);
      }
    } finally {
      setIsGoogleSignInBusy(false);
    }
  }, [applyGoogleSignInSession]);

  const completeGoogleSignUpRole = useCallback(
    async (
      role: "jobseeker" | "recruiter",
      companyName?: string,
      companySize?: string,
      roleType?: "technical" | "non_technical"
    ) => {
      const token = getAuthToken();
      if (!token) {
        toast.error("Session lost. Please sign in with Google again.");
        setNeedsGoogleRoleSelection(false);
        navigate("/auth", { replace: true });
        return;
      }
      try {
        const data = await api.post<{ user: User | null; token?: string; refreshToken?: string }>(
          "/api/auth/google/select-role",
          {
            role,
            ...(role === "recruiter" && { companyName, companySize }),
            ...(role === "jobseeker" && roleType && { roleType }),
          },
          { token }
        );
        if (data.token) setAuthToken(data.token);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        if (data.user) {
          setUser(data.user);
          setUserRole(data.user.role);
        }
        setNeedsGoogleRoleSelection(false);
        toast.success("Welcome! Redirecting to your dashboard.");
        navigate(role === "recruiter" ? "/dashboard/recruiter" : "/dashboard/jobseeker", { replace: true });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "Failed to save role";
        const isBackendDown = status === 503 || msg.includes("Run npm run dev") || msg.includes("Backend not running");
        if (!isBackendDown) toast.error(msg);
        throw err;
      }
    },
    [navigate]
  );

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setRefreshToken(null);
    setUser(null);
    setUserRole(null);
    setNeedsGoogleRoleSelection(false);
    toast.success("Signed out successfully");
    navigate("/");
  }, [navigate]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      const data = await api.post<{ ok: boolean; resetLink?: string; message?: string }>("/api/auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });
      if (data.message) {
        toast.info(data.message);
      } else {
        toast.success("If an account exists, check your email for a reset link.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reset link";
      toast.error(msg);
      throw err;
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      toast.error(msg);
      throw err;
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userRole,
      isInitializing,
      isGoogleSignInBusy,
      needsGoogleRoleSelection,
      completeGoogleSignUpRole,
      signInWithGoogle,
      signUp,
      signIn,
      verifyEmailCode,
      resendEmailVerification,
      signOut,
      resetPassword,
      changePassword,
    }),
    [
      user,
      userRole,
      isInitializing,
      isGoogleSignInBusy,
      needsGoogleRoleSelection,
      completeGoogleSignUpRole,
      signInWithGoogle,
      signUp,
      signIn,
      verifyEmailCode,
      resendEmailVerification,
      signOut,
      resetPassword,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
