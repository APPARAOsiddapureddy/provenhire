import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, hasAuthToken, setAuthToken, setRefreshToken } from "@/lib/api";
import { signInWithGooglePopup, getGoogleRedirectIdToken, isFirebaseConfigured } from "@/lib/firebase";

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

  useEffect(() => {
    const bootstrap = async () => {
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
      try {
        const { user } = await api.get<{ user: User }>("/api/auth/me");
        setUser(user);
        setUserRole(user.role);
      } catch {
        setUser(null);
        setUserRole(null);
        setAuthToken(null);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
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
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      setUser(data.user);
      setUserRole(data.user.role);
      if (role === "recruiter") {
        await api.post("/api/users/recruiter-profile", { companyName, companySize });
      }
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
    } catch (err: unknown) {
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
    try {
      const data = await api.post<{ user: User | null }>("/api/auth/google/select-role", {
        role,
        ...(role === "recruiter" && { companyName, companySize }),
        ...(role === "jobseeker" && roleType && { roleType }),
      });
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
      const msg = err instanceof Error ? err.message : "Failed to save role";
      toast.error(msg);
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
