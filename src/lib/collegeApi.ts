/**
 * Minimal API client for the college portal (/c/*).
 *
 * Deliberately separate from `@/lib/api`: college logins are not User rows, so they get
 * no refresh token, and the shared client's 401 handling clears `ph_jwt` and bounces the
 * session — which would sign an admin out of the main app in the same browser.
 */

const COLLEGE_TOKEN_KEY = "ph_college_jwt";
const COLLEGE_USER_KEY = "ph_college_user";

export type CollegeSession = {
  userId: string;
  workspaceId: string;
};

export function getCollegeToken(): string {
  try {
    return localStorage.getItem(COLLEGE_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function hasCollegeToken(): boolean {
  return !!getCollegeToken();
}

export function getCollegeSession(): CollegeSession | null {
  try {
    const raw = localStorage.getItem(COLLEGE_USER_KEY);
    return raw ? (JSON.parse(raw) as CollegeSession) : null;
  } catch {
    return null;
  }
}

export function setCollegeSession(token: string, college: CollegeSession) {
  try {
    localStorage.setItem(COLLEGE_TOKEN_KEY, token);
    localStorage.setItem(COLLEGE_USER_KEY, JSON.stringify(college));
  } catch {
    /* storage unavailable (private mode) — the session simply will not persist */
  }
}

export function clearCollegeSession() {
  try {
    localStorage.removeItem(COLLEGE_TOKEN_KEY);
    localStorage.removeItem(COLLEGE_USER_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type CollegeApiError = Error & {
  status?: number;
  code?: string;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getCollegeToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    const err = new Error(
      "Could not reach the server. Please check your connection and try again.",
    ) as CollegeApiError;
    err.status = 503;
    throw err;
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    const err = new Error(body?.error || "Request failed") as CollegeApiError;
    err.status = res.status;
    err.code = body?.code;
    // An expired or revoked session must not leave a stale token behind.
    if (res.status === 401 || body?.code === "ACCOUNT_INACTIVE") clearCollegeSession();
    throw err;
  }

  return body as T;
}

export const collegeApi = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, payload?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
