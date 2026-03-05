import { RENDER_API_URL } from "./config";
// Dev: Vite proxy to Render. Prod: VITE_API_URL or Render URL.
const API_BASE_URL = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? RENDER_API_URL);
const isDev = import.meta.env.DEV;

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
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
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

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
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
      throw new Error(isDev ? "Cannot reach app. Start both: npm run dev:all" : "Unable to connect. Please check your connection and try again.");
    }
    throw e;
  }

  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const msg = (errorBody?.message ?? errorBody?.error ?? "Request failed") as string;
    if (path.startsWith("/api/") && res.status === 404) {
      throw new Error(isDev ? `Backend not running. Run: npm run dev:all` : "Service temporarily unavailable. Please try again later.");
    }
    if (path.startsWith("/api/") && res.status === 502) {
      if (msg && msg !== "Request failed" && !msg.toLowerCase().includes("proxy")) {
        throw new Error(msg);
      }
      throw new Error(isDev ? "Backend not running or service unavailable. Run: npm run dev:all" : "Service temporarily unavailable. Please try again later.");
    }
    if (path.startsWith("/api/") && (res.status === 500 || res.status === 503)) {
      const code = (errorBody as { code?: string })?.code;
      const fullMsg = msg && msg !== "Request failed" ? msg : "Something went wrong. Please try again in a moment.";
      throw new Error(code ? `${fullMsg} [${code}]` : fullMsg);
    }
    const err = new Error(msg) as Error & { response?: { data?: unknown } };
    err.response = { data: errorBody };
    throw err;
  }
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
