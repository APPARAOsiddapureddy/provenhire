import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api, hasAuthToken, getAuthToken, setAuthToken, setRefreshToken, isBackendDownCooldown, BACKEND_DOWN_MSG } from "@/lib/api";
import {
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  getGoogleRedirectIdToken,
  isFirebaseConfigured,
} from "@/lib/firebase";

type UserRole = "recruiter" | "jobseeker" | "admin" | "expert_interviewer" | null;

type User = {
  id: string;
  name?: string | null;
  email: string;
  role: UserRole;
};

interface AuthContextType {
  user: User | null;
  userRole: UserRole;
  loading: boolean;
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
  ) => Promise<void>;
  signIn: (email: string, password: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [needsGoogleRoleSelection, setNeedsGoogleRoleSelection] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname || "";
  // Skip redundant /api/auth/me on the next run after we've just completed Google *redirect* sign-in (avoids 401 race right after navigate).
  const skipNextMeRef = useRef(false);

  /** Shared: exchange Firebase id token for app session (popup or redirect return). */
  const applyGoogleSignInSession = useCallback(async (idToken: string) => {
    const data = await api.post<{ user: User; token: string; refreshToken?: string; isNewUser?: boolean }>(
      "/api/auth/google",
      { idToken }
    );
    setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    setUser(data.user);
    setUserRole(data.user.role);
    skipNextMeRef.current = true;
    if (data.isNewUser) {
      setNeedsGoogleRoleSelection(true);
      toast.success("Choose your role to continue");
      navigate("/auth", { replace: true });
    } else {
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
    }
  }, [navigate]);

  useEffect(() => {
    const bootstrap = async () => {
      // If we just completed Google redirect sign-in and navigated, we already have user + token; skip /api/auth/me once.
      if (skipNextMeRef.current) {
        skipNextMeRef.current = false;
        setLoading(false);
        return;
      }

      // Handle Google redirect result first (user returning from OAuth — e.g. popup blocked / mobile)
      if (isFirebaseConfigured()) {
        try {
          const REDIRECT_TIMEOUT_MS = 20_000;
          // Only time out on the OAuth return URL; elsewhere getRedirectResult() is a quick no-op.
          const idToken =
            pathname === "/__/auth/handler"
              ? await Promise.race([
                  getGoogleRedirectIdToken(),
                  new Promise<string | null>((_, reject) =>
                    setTimeout(() => reject(new Error("Sign-in took too long. Please try again.")), REDIRECT_TIMEOUT_MS)
                  ),
                ])
              : await getGoogleRedirectIdToken();
          if (!idToken && pathname === "/__/auth/handler") {
            navigate("/auth", { replace: true });
            setLoading(false);
            return;
          }
          if (idToken) {
            await applyGoogleSignInSession(idToken);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("[AuthContext] Google redirect result failed:", err);
          toast.error(err instanceof Error ? err.message : "Google sign-in failed");
          setLoading(false);
          if (pathname === "/__/auth/handler") navigate("/auth", { replace: true });
          return;
        }
      }

      if (!hasAuthToken()) {
        setUser(null);
        setUserRole(null);
        setLoading(false);
        return;
      }
      // If backend is already known down, don't call API.
      if (isBackendDownCooldown()) {
        setLoading(false);
        return;
      }
      // When we have a token, always restore session via /me (including on /auth), like the pre-redirect-only flow.
      try {
        const { user } = await api.get<{ user: User }>("/api/auth/me");
        setUser(user);
        setUserRole(user.role);
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "";
        const isBackendDown =
          status === 503 ||
          msg.includes("Service unavailable") ||
          msg.includes("temporarily unavailable") ||
          msg.includes("Backend not running") ||
          msg.includes("npm run dev");
        if (isBackendDown) {
          // Don't clear user/token; toast is shown once via ph_backend_503.
        } else {
          setUser(null);
          setUserRole(null);
          setAuthToken(null);
          setRefreshToken(null);
        }
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, [navigate, pathname, applyGoogleSignInSession]);

  // Show backend-down toast only on /auth so we don't annoy users on About, Jobs, or dashboard (dashboard has its own card).
  useEffect(() => {
    const onBackend503 = () => {
      const path = (window.location.pathname || "").split("?")[0];
      if (path !== "/auth") return;
      toast.error(BACKEND_DOWN_MSG);
    };
    window.addEventListener("ph_backend_503", onBackend503);
    return () => window.removeEventListener("ph_backend_503", onBackend503);
  }, []);

  // When any API call gets 401 after failed refresh, api.ts clears tokens and dispatches this event.
  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null);
      setUserRole(null);
      setAuthToken(null);
      setRefreshToken(null);
      setNeedsGoogleRoleSelection(false);
      toast.error("Session expired. Please sign in again.");
      navigate("/auth", { replace: true });
    };
    window.addEventListener("ph_session_expired", onSessionExpired);
    return () => window.removeEventListener("ph_session_expired", onSessionExpired);
  }, [navigate]);

  const signUp = async (
    email: string,
    password: string,
    role: UserRole,
    fullName?: string,
    companyName?: string,
    companySize?: string,
    roleType?: "technical" | "non_technical"
  ) => {
    setLoading(true);
    try {
      const data = await api.post<{ user: User; token: string; refreshToken?: string }>("/api/auth/register", {
        email: email.trim().toLowerCase(),
        password,
        role: role ?? "jobseeker",
        name: fullName ?? undefined,
        roleType: roleType ?? undefined,
      });
      if (!data?.token) {
        throw new Error("Invalid response from server. Please try again.");
      }
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      if (role === "recruiter") {
        await api.post(
          "/api/users/recruiter-profile",
          { companyName, companySize },
          { token: data.token },
        );
      }
      setUser(data.user);
      setUserRole(data.user?.role ?? null);
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await api.post<{ user: User; token: string; refreshToken?: string }>("/api/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      setUser(data.user);
      setUserRole(data.user.role);
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured()) {
      toast.error("Google sign-in is not configured. Please use email and password.");
      return;
    }
    setLoading(true);
    try {
      const idToken = await signInWithGooglePopup();
      await applyGoogleSignInSession(idToken);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
      const message = err instanceof Error ? err.message : "";
      // Popup blocked or COOP / closed signal — fall back to full-page redirect (still supported via /__/auth/handler).
      if (
        code === "auth/popup-blocked" ||
        /cross-origin-opener-policy|window\.closed|blocked by the browser/i.test(message)
      ) {
        toast.info("Continuing Google sign-in in this window…");
        signInWithGoogleRedirect();
        return;
      }
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const completeGoogleSignUpRole = async (
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
      const data = await api.post<{ user: User | null }>(
        "/api/auth/google/select-role",
        {
          role,
          ...(role === "recruiter" && { companyName, companySize }),
          ...(role === "jobseeker" && roleType && { roleType }),
        },
        { token }
      );
      if (data.user) {
        setUser(data.user);
        setUserRole(data.user.role);
      }
      setNeedsGoogleRoleSelection(false);
      toast.success("Welcome! Redirecting to your dashboard.");
      navigate(
        role === "recruiter" ? "/dashboard/recruiter" : "/dashboard/jobseeker",
        { replace: true }
      );
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : "Failed to save role";
      const isBackendDown = status === 503 || msg.includes("Run npm run dev") || msg.includes("Backend not running");
      if (!isBackendDown) toast.error(msg);
      throw err;
    }
  };

  const signOut = async () => {
    setAuthToken(null);
    setRefreshToken(null);
    setUser(null);
    setUserRole(null);
    setNeedsGoogleRoleSelection(false);
    toast.success("Signed out successfully");
    navigate("/");
  };

  const resetPassword = async (email: string) => {
    try {
      const data = await api.post<{ ok: boolean; resetLink?: string; message?: string }>("/api/auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });
      if (data.message) {
        toast.info(data.message);
      } else {
        toast.success("If an account exists, check your email for a reset link.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send reset link");
      throw err;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password updated successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to change password");
      throw err;
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userRole,
      loading,
      needsGoogleRoleSelection,
      completeGoogleSignUpRole,
      signInWithGoogle,
      signUp,
      signIn,
      signOut,
      resetPassword,
      changePassword,
    }),
    [user, userRole, loading, needsGoogleRoleSelection]
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
