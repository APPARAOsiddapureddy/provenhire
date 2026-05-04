const LOCAL_ANTIGRAVITY_URL = "http://localhost:8000";

function normalizeBaseUrl(raw: string): string {
  const normalized = raw.trim().replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized.slice(0, -4) : normalized;
}

export function getAntigravityServiceUrl(): string {
  const configured = process.env.ANTIGRAVITY_API_URL?.trim();
  if (configured) return normalizeBaseUrl(configured);

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_ANTIGRAVITY_URL;
  }

  throw new Error("ANTIGRAVITY_API_URL is required in production.");
}

export function getAntigravityApiBaseUrl(): string {
  return `${getAntigravityServiceUrl()}/api`;
}

export function getAntigravityFrontendUrl(): string {
  const configured =
    process.env.ANTIGRAVITY_FRONTEND_URL?.trim() ||
    process.env.ANTIGRAVITY_PUBLIC_URL?.trim();
  if (configured) return normalizeBaseUrl(configured);

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new Error("ANTIGRAVITY_FRONTEND_URL is required in production.");
}

export function isAntigravityConfigured(): boolean {
  try {
    void getAntigravityServiceUrl();
    return true;
  } catch {
    return false;
  }
}

export function antigravityUnavailableMessage() {
  return {
    error:
      "Antigravity integration is not configured. Set ANTIGRAVITY_API_URL on the ProvenHire API server.",
  };
}
