// Always use relative URLs: dev = Vite proxy, prod = Vercel rewrites /api to backend. Avoids CORS.
const API_BASE = "";
const isDev = import.meta.env.DEV;

/** After a 503, block further API requests for this long to avoid a flood of errors (e.g. dashboard firing 5+ calls). */
const BACKEND_DOWN_COOLDOWN_MS = 25_000;
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

function getAuthToken() {
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

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem("ph_jwt", token);
    else localStorage.removeItem("ph_jwt");
  } catch {}
}

export function setRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem("ph_refresh", token);
    else localStorage.removeItem("ph_refresh");
  } catch {}
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
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
  }
}

const BACKEND_DOWN_MSG = isDev ? "Run npm run dev from the project root to start the backend." : "Service temporarily unavailable. Please try again.";

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  if (isBackendDownCooldown()) {
    const err = new Error(BACKEND_DOWN_MSG) as Error & { status?: number };
    err.status = 503;
    throw err;
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    const isNetworkError =
      msg.includes("fetch") ||
      msg.includes("Failed") ||
      msg.includes("NetworkError") ||
      msg.includes("Connection refused") ||
      msg.includes("Load failed") ||
      msg.includes("blocked");
    if (isNetworkError) {
      setBackendDownCooldown();
      throw new Error(isDev ? "Run npm run dev from the project root to start the backend." : "Unable to connect. Please check your connection and try again.");
    }
    throw e;
  }

  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
    // Refresh failed — clear session so AuthContext can redirect to login
    setAuthToken(null);
    setRefreshToken(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ph_session_expired"));
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const msg = (errorBody?.message ?? errorBody?.error ?? "Request failed") as string;
    if (path.startsWith("/api/") && res.status === 404) {
      throw new Error(isDev ? "Run npm run dev from the project root to start the backend." : "Service temporarily unavailable. Please try again later.");
    }
    if (path.startsWith("/api/") && res.status === 502) {
      if (msg && msg !== "Request failed" && !msg.toLowerCase().includes("proxy")) {
        throw new Error(msg);
      }
      throw new Error(
        isDev
          ? "Run npm run dev from the project root to start the backend."
          : "Backend is starting up. Please wait 30 seconds and try again."
      );
    }
    if (path.startsWith("/api/") && (res.status === 500 || res.status === 503)) {
      if (res.status === 503) setBackendDownCooldown();
      const code = (errorBody as { code?: string })?.code;
      const fullMsg = msg && msg !== "Request failed" ? msg : "Something went wrong. Please try again in a moment.";
      const err = new Error(code ? `${fullMsg} [${code}]` : fullMsg) as Error & { status?: number };
      err.status = res.status;
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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
