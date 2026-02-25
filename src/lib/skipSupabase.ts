/**
 * When true, the app is using bypass auth (no real Supabase session).
 * Skip all Supabase data/function requests so the app works without auth.
 * Once you integrate real authentication, bypass mode will be off and Supabase will be used.
 */
const BYPASS_USER_KEY = "ph_bypass_user";

export function skipSupabaseRequests(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(BYPASS_USER_KEY);
    return Boolean(raw);
  } catch {
    return false;
  }
}
