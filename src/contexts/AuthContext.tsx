import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const BYPASS_USER_KEY = 'ph_bypass_user';
const BYPASS_ROLE_KEY = 'ph_bypass_role';

type UserRole = 'recruiter' | 'jobseeker' | 'admin' | 'expert_interviewer' | null;

function getBypassUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BYPASS_USER_KEY);
    if (!raw) return null;
    const { id, email } = JSON.parse(raw) as { id: string; email: string };
    if (!id || !email) return null;
    return { id, email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '', updated_at: '' } as User;
  } catch {
    return null;
  }
}

function getBypassRole(): UserRole {
  if (typeof window === 'undefined') return null;
  const role = localStorage.getItem(BYPASS_ROLE_KEY);
  if (role === 'admin' || role === 'recruiter' || role === 'jobseeker' || role === 'expert_interviewer') return role;
  return null;
}

function getInitialAuth() {
  const u = getBypassUser();
  const r = getBypassRole();
  return { user: u, role: r, loading: !(u && r) };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  loading: boolean;
  signUp: (email: string, password: string, role: UserRole, fullName?: string, companyName?: string, referralCode?: string) => Promise<void>;
  signIn: (email: string, password: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<UserRole | void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initial = useMemo(getInitialAuth, []);
  const [user, setUser] = useState<User | null>(initial.user);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(initial.role);
  const [loading, setLoading] = useState(initial.loading);
  const navigate = useNavigate();

  useEffect(() => {
    if (initial.user && initial.role) return;

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
        const { error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });
        if (error) {
          console.error("Failed to hydrate session from URL:", error);
          return;
        }
        sessionStorage.removeItem("ph_recovery_access_token");
        sessionStorage.removeItem("ph_recovery_refresh_token");
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };

    hydrateSessionFromUrl();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (getBypassUser()) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserRole(session.user.id);
        } else {
          setUserRole(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (getBypassUser()) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [initial.user, initial.role]);

  const fetchUserRole = async (userId: string): Promise<UserRole | null> => {
    const ROLE_FETCH_TIMEOUT_MS = 12000; // If Supabase is slow (e.g. cold region), don't block dashboard forever
    let role: UserRole | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Role fetch timed out')), ROLE_FETCH_TIMEOUT_MS)
      );
      const fetchPromise = supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          return (data?.role as UserRole) ?? null;
        });
      role = await Promise.race([fetchPromise, timeoutPromise]);
      setUserRole(role);
      return role;
    } catch (error: any) {
      console.warn('Error or timeout fetching user role (defaulting to jobseeker so dashboard can load):', error?.message || error);
      setUserRole('jobseeker'); // Fallback so user is not stuck on loader; they can still use dashboard
      setLoading(false);
      return 'jobseeker';
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, role: UserRole, fullName?: string, companyName?: string, referralCode?: string) => {
    try {
      setLoading(true);
      const redirectUrl = `${window.location.origin}/auth?mode=reset&email=${encodeURIComponent(email)}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName || null,
            company_name: companyName || null,
            role: role || null
          }
        }
      });

      if (error) {
        const msg = (error.message || 'Failed to create account').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists')) {
          toast.error('An account with this email already exists. Try signing in or reset your password.');
        } else if (msg.includes('rate limit') || msg.includes('rate limit exceeded')) {
          toast.error('Email rate limit exceeded. Wait about an hour or turn off "Confirm email" in Supabase Auth for testing. See docs/SUPABASE_EMAIL_RATE_LIMIT.md');
          throw error;
        } else {
          toast.error(error.message || 'Failed to create account');
        }
        throw error;
      }

      if (data.user) {
        // user_roles and profiles are created by DB trigger (handle_new_user) on auth.users insert
        if (referralCode && referralCode.startsWith('PH-')) {
          try {
            await supabase.functions.invoke('send-referral-notification', {
              body: {
                referralCode,
                referredUserName: fullName,
                referredUserEmail: email,
                referredUserId: data.user.id
              }
            });
          } catch (referralError) {
            console.error('Error processing referral:', referralError);
          }
        }

        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: redirectUrl,
        });
        if (resetErr) {
          const resetMsg = (resetErr.message || '').toLowerCase();
          if (resetMsg.includes('rate limit') || resetMsg.includes('rate limit exceeded')) {
            toast.error('Email rate limit exceeded. Account was created; wait ~1 hour to get the set-password email, or see docs/SUPABASE_EMAIL_RATE_LIMIT.md');
          } else {
            toast.error(resetErr.message || 'Could not send set-password email.');
          }
        } else {
          toast.success('Check your email to set your password.');
        }

        if (data.session) await supabase.auth.signOut();
      }
    } catch (error: any) {
      if (error?.message === 'Failed to fetch' || (error?.name === 'TypeError' && String(error?.message).includes('fetch'))) {
        const friendly = 'Auth server unreachable. If you just resumed your Supabase project, wait 2–3 minutes. Otherwise add this app URL to Supabase: Authentication → URL Configuration → Redirect URLs.';
        toast.error(friendly);
        throw new Error(friendly);
      }
      if (!error.message?.includes('already')) {
        console.error('Sign up error:', error);
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string, role?: UserRole) => {
    setLoading(true);
    try {
      // When no role provided: first check test credentials table (bypass Supabase Auth)
      if (role === undefined) {
        const { data: credResult, error: rpcError } = await supabase.rpc('check_test_credentials', {
          p_email: email.trim(),
          p_password: password || '',
        });
        if (!rpcError && credResult && Array.isArray(credResult) && credResult.length > 0 && credResult[0]?.ok) {
          const credRole = credResult[0].role as UserRole;
          if (credRole === 'admin' || credRole === 'recruiter' || credRole === 'jobseeker' || credRole === 'expert_interviewer') {
            const mockId = 'bypass-' + (email.replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'user');
            const mockUser: User = {
              id: mockId,
              email: email.trim().toLowerCase(),
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as User;
            localStorage.setItem(BYPASS_USER_KEY, JSON.stringify({ id: mockUser.id, email: mockUser.email }));
            localStorage.setItem(BYPASS_ROLE_KEY, credRole);
            setUser(mockUser);
            setSession(null);
            setUserRole(credRole);
            setLoading(false);
            toast.success('Signed in with test credentials.');
            if (credRole === 'admin') navigate('/admin/dashboard');
            else if (credRole === 'recruiter') navigate('/dashboard/recruiter');
            else if (credRole === 'expert_interviewer') navigate('/dashboard/expert');
            else navigate('/dashboard/jobseeker');
            return;
          }
        }

        // Fallback: normal Supabase Auth sign-in
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: password || '',
        });
        if (error) {
          setLoading(false);
          const msg = error.message || '';
          if (msg.includes('Email not confirmed') || msg.includes('email not confirmed')) {
            throw new Error('Please check your email and confirm your account before signing in.');
          }
          if (msg.includes('Invalid login') || msg.includes('invalid')) {
            throw new Error('Invalid email or password.');
          }
          throw error;
        }
        toast.success('Signed in successfully!');
        return;
      }

      // Demo/bypass: role provided → use localStorage and redirect by chosen role
      const chosenRole = role ?? 'jobseeker';
      const mockId = 'bypass-' + (email.replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'user');
      const mockUser: User = {
        id: mockId,
        email: email || 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as User;

      localStorage.setItem(BYPASS_USER_KEY, JSON.stringify({ id: mockUser.id, email: mockUser.email }));
      localStorage.setItem(BYPASS_ROLE_KEY, chosenRole);

      setUser(mockUser);
      setSession(null);
      setUserRole(chosenRole);
      toast.success('Signed in successfully!');

      if (chosenRole === 'admin') navigate('/admin/dashboard');
      else if (chosenRole === 'recruiter') navigate('/dashboard/recruiter');
      else if (chosenRole === 'expert_interviewer') navigate('/dashboard/expert');
      else navigate('/dashboard/jobseeker');
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (err?.message === 'Failed to fetch' || (err?.name === 'TypeError' && String(err?.message).includes('fetch'))) {
        const friendly = 'Auth server unreachable. If you just resumed your Supabase project, wait 2–3 minutes. Otherwise add this app URL to Supabase: Authentication → URL Configuration → Redirect URLs.';
        toast.error(friendly);
        throw new Error(friendly);
      }
      if (err?.message) throw err;
      throw new Error('Sign in failed');
    }
    // Production path: loading is cleared by fetchUserRole in auth state listener
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(BYPASS_USER_KEY);
      localStorage.removeItem(BYPASS_ROLE_KEY);
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserRole(null);
      toast.success('Signed out successfully');
      navigate('/');
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/auth?mode=reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rate limit') || msg.includes('rate limit exceeded')) {
          toast.error('Email rate limit exceeded. Wait about an hour and try again, or see docs/SUPABASE_EMAIL_RATE_LIMIT.md');
        } else {
          toast.error(error.message || 'Failed to send reset email');
        }
        throw error;
      }
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Reset password error:', error);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string): Promise<UserRole | void> => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast.success('Password updated successfully!');
      // Refresh session and role immediately so redirect to dashboard is instant
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        const role = await fetchUserRole(session.user.id);
        return role ?? undefined;
      }
    } catch (error: any) {
      console.error('Update password error:', error);
      toast.error(error.message || 'Failed to update password');
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) {
      toast.error('User session not available');
      return;
    }
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw signInError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast.success('Password changed successfully!');
    } catch (error: any) {
      console.error('Change password error:', error);
      toast.error(error.message || 'Failed to change password');
      throw error;
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      userRole,
      loading,
      signUp,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      changePassword,
    }),
    [user, session, userRole, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
