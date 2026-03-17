import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api, hasAuthToken, getAuthToken, setAuthToken, setRefreshToken, isBackendDownCooldown, BACKEND_DOWN_MSG } from "@/lib/api";
import { signInWithGoogleRedirect, getGoogleRedirectIdToken, isFirebaseConfigured } from "@/lib/firebase";

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
  updatePassword: (newPassword: string) => Promise<UserRole | void>;
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
  // Per-pathname so we don't double-run in Strict Mode, and we re-run when navigating away from /auth
  const lastBootstrapPathRef = useRef<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      // Avoid double run in React Strict Mode for the same pathname.
      if (lastBootstrapPathRef.current === pathname) {
        setLoading(false);
        return;
      }
      lastBootstrapPathRef.current = pathname;

      // Handle Google redirect result first (user returning from OAuth)
      if (isFirebaseConfigured()) {
        try {
          const idToken = await getGoogleRedirectIdToken();
          if (idToken) {
            const data = await api.post<{ user: User; token: string; refreshToken?: string; isNewUser?: boolean }>("/api/auth/google", {
              idToken,
            });
            setAuthToken(data.token);
            if (data.refreshToken) setRefreshToken(data.refreshToken);
            setUser(data.user);
            setUserRole(data.user.role);
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
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("[AuthContext] Google redirect result failed:", err);
          toast.error(err instanceof Error ? err.message : "Google sign-in failed");
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
      // Skip /api/auth/me on public routes so we don't trigger 503 when backend is down (home, about, jobs, auth).
      // Session is restored when they navigate to a protected route (effect re-runs with new pathname).
      const publicPaths = ["/", "/auth", "/about", "/jobs", "/for-employers", "/login", "/signup"];
      const isPublicPath = publicPaths.includes(pathname) || pathname === "";
      if (isPublicPath) {
        setLoading(false);
        return;
      }
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
  }, [navigate, pathname]);

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
    // Use redirect everywhere to avoid COOP "window.closed" errors from Firebase popup.
    signInWithGoogleRedirect();
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

  const updatePassword = async (_newPassword: string): Promise<UserRole | void> => {
    toast.error("Password update is not configured yet.");
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
      updatePassword,
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
