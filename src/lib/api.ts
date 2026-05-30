// Always use relative URLs: dev = Vite proxy, prod = Vercel rewrites /api to backend. Avoids CORS.
const API_BASE = "";
const isDev = import.meta.env.DEV;

/** After a 503, block further API requests for this long to avoid a flood of errors (e.g. dashboard firing 5+ calls). */
const BACKEND_DOWN_COOLDOWN_MS = 25_000;
const REQUEST_TIMEOUT_MS = isDev ? 20_000 : 25_000;
let backendDownUntil = 0;
let didEmit503Event = false;

/** Exported so dashboards/NotificationInbox can skip fetches when backend is already known down (avoids 503 flood after Google SSO). */
export function isBackendDownCooldown(): boolean {
  return Date.now() < backendDownUntil;
}

function setBackendDownCooldown() {
  backendDownUntil = Date.now() + BACKEND_DOWN_COOLDOWN_MS;
  if (typeof window !== "undefined" && !didEmit503Event) {
    didEmit503Event = true;
    window.dispatchEvent(new CustomEvent("ph_backend_503"));
  }
}

/** Call when a request succeeds so the cooldown is cleared when the backend is back. */
function clearBackendDownCooldown() {
  backendDownUntil = 0;
  didEmit503Event = false;
}

/** Read current JWT (e.g. to pass explicitly for select-role after Google SSO). */
export function getAuthToken(): string {
  try {
    return localStorage.getItem("ph_jwt") || "";
  } catch {
    return "";
  }
}

/** True if a JWT exists; use to skip /api/auth/me when unauthenticated. */
export function hasAuthToken(): boolean {
  return !!getAuthToken();
}


function getRefreshToken() {
  try {
    return localStorage.getItem("ph_refresh") || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token: string | null | undefined) {
  try {
    if (token != null && token !== "") localStorage.setItem("ph_jwt", token);
    else if (token === null) localStorage.removeItem("ph_jwt");
    // undefined: do not overwrite or clear (avoids clearing when server returns unexpected shape)
  } catch {}
}

export function setRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem("ph_refresh", token);
    else localStorage.removeItem("ph_refresh");
  } catch {}
}

/** Single in-flight refresh so parallel API calls don't stampede /api/auth/refresh (fixes flaky 401s + removeChild). */
let refreshMutex: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (refreshMutex) return refreshMutex;
  refreshMutex = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.token) {
        setAuthToken(data.token);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshMutex = null;
    }
  })();
  return refreshMutex;
}

let lastSessionExpiredEmit = 0;
const SESSION_EXPIRED_DEBOUNCE_MS = 800;

function emitSessionExpiredOnce(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSessionExpiredEmit < SESSION_EXPIRED_DEBOUNCE_MS) return;
  lastSessionExpiredEmit = now;
  window.dispatchEvent(new CustomEvent("ph_session_expired"));
}

function isAuthMePath(path: string): boolean {
  return path === "/api/auth/me" || path.endsWith("/api/auth/me");
}

/** Decode JWT `exp` (seconds) for proactive refresh — not verified; server still validates. */
function getAccessTokenExpMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Refresh access token before a request if it's missing or expires soon.
 * Avoids a visible 401 on the first fetch (browser DevTools still may show rare edge cases).
 */
async function ensureFreshAccessTokenIfNeeded(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  const expMs = getAccessTokenExpMs(token);
  if (expMs == null) return;
  // Refresh when expired or within 3 minutes of expiry (access JWT is 15m).
  const REFRESH_SKEW_MS = 3 * 60 * 1000;
  if (expMs - Date.now() > REFRESH_SKEW_MS) return;
  await refreshAccessToken();
}

/** Single user-facing message when backend is down (dev or prod). Export for toasts and UI. */
export const BACKEND_DOWN_MSG = isDev
  ? "Backend isn't running. From the project root run: npm run dev (starts both frontend and backend)."
  : "Service temporarily unavailable. Please try again in a moment.";

async function request<T>(path: string, options: RequestInit = {}, retried = false, tokenOverride?: string): Promise<T> {
  if (isBackendDownCooldown()) {
    const err = new Error(BACKEND_DOWN_MSG) as Error & { status?: number; isBackendUnavailable?: boolean };
    err.status = 503;
    err.isBackendUnavailable = true;
    throw err;
  }

  // Proactive refresh for protected calls (skip when caller passes an explicit token, e.g. select-role).
  const isPublicAuthEndpoint =
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/register") ||
    path.startsWith("/api/auth/forgot-password") ||
    path.startsWith("/api/auth/reset-password") ||
    path.startsWith("/api/auth/google") ||
    path.startsWith("/api/auth/email-verification") ||
    path.startsWith("/api/auth/refresh");

  if (tokenOverride === undefined && !isPublicAuthEndpoint && !retried) {
    await ensureFreshAccessTokenIfNeeded();
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenOverride !== undefined ? tokenOverride : getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  let res: Response;
  try {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // If caller provided a signal, abort our controller when it aborts.
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    res = await fetch(url, { ...options, headers, signal: controller.signal });
    globalThis.clearTimeout(timeoutId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    const isTimeout =
      (e instanceof DOMException && e.name === "AbortError") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("timeout");
    const isNetworkError =
      msg.includes("fetch") ||
      msg.includes("Failed") ||
      msg.includes("NetworkError") ||
      msg.includes("Connection refused") ||
      msg.includes("Load failed") ||
      msg.includes("blocked");
    if (isTimeout || isNetworkError) {
      setBackendDownCooldown();
      const err = new Error(
        isTimeout ? "The request is taking too long. Please try again." : BACKEND_DOWN_MSG
      ) as Error & { status?: number; isBackendUnavailable?: boolean };
      err.status = 503;
      err.isBackendUnavailable = true;
      throw err;
    }
    throw e;
  }

  // On 401, we normally try to refresh the JWT. However, auth endpoints like
  // `/api/auth/login` are expected to return 401 for invalid credentials and
  // should NOT trigger the "session expired" UX (that toast is meant for protected calls).
  if (res.status === 401 && !retried && tokenOverride === undefined && !isPublicAuthEndpoint) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
    // Don't clear session for select-role 401 so user can retry (e.g. after Google SSO)
    if (path.includes("google/select-role")) {
      const errorBody = await res.json().catch(() => ({}));
      const msg = (errorBody?.error ?? errorBody?.message ?? "Unauthorized") as string;
      const err = new Error(msg) as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    // Refresh failed — clear session. Bootstrap /api/auth/me handles UX without a global redirect storm.
    setAuthToken(null);
    setRefreshToken(null);
    if (typeof window !== "undefined" && !isAuthMePath(path)) {
      emitSessionExpiredOnce();
    }
    const errorBody401 = await res.json().catch(() => ({}));
    const msg401 = (errorBody401?.message ?? errorBody401?.error ?? "Unauthorized") as string;
    const err401 = new Error(msg401) as Error & { response?: { data?: unknown }; status?: number };
    err401.response = { data: errorBody401 };
    err401.status = 401;
    throw err401;
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const msg = (errorBody?.message ?? errorBody?.error ?? "Request failed") as string;
    if (path.startsWith("/api/") && res.status === 404) {
      const err = new Error(BACKEND_DOWN_MSG) as Error & { status?: number; isBackendUnavailable?: boolean };
      err.status = 404;
      err.isBackendUnavailable = true;
      throw err;
    }
    if (path.startsWith("/api/") && res.status === 502) {
      if (msg && msg !== "Request failed" && !msg.toLowerCase().includes("proxy")) {
        throw new Error(msg);
      }
      const err = new Error(BACKEND_DOWN_MSG) as Error & { status?: number; isBackendUnavailable?: boolean };
      err.status = 502;
      err.isBackendUnavailable = true;
      throw err;
    }
    if (path.startsWith("/api/") && (res.status === 500 || res.status === 503)) {
      if (res.status === 503) setBackendDownCooldown();
      const code = (errorBody as { code?: string })?.code;
      const fullMsg = msg && msg !== "Request failed" ? msg : BACKEND_DOWN_MSG;
      const err = new Error(code ? `${fullMsg} [${code}]` : fullMsg) as Error & { status?: number; isBackendUnavailable?: boolean };
      err.status = res.status;
      err.isBackendUnavailable = res.status === 503;
      throw err;
    }
    const err = new Error(msg) as Error & { response?: { data?: unknown }; status?: number };
    err.response = { data: errorBody };
    err.status = res.status;
    throw err;
  }
  if (res.ok) clearBackendDownCooldown();
  return res.json() as Promise<T>;
}

export type ApiPostOptions = { token?: string };

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: ApiPostOptions) =>
    request<T>(
      path,
      { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) },
      false,
      opts?.token,
    ),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
