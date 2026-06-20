const DEV_PREVIEW_FLAG = "preview";
export const DEV_PREVIEW_TOKEN_KEY = "ph_preview_token";
export const DEV_PREVIEW_TOKEN_FALLBACK = "preview-dev-token";

const getStoredPreviewToken = (): string | null => {
  try {
    return localStorage.getItem(DEV_PREVIEW_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const isDevDashboardPreviewMode = (): boolean => {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(DEV_PREVIEW_FLAG) === "1") return true;
  const storedToken = getStoredPreviewToken();
  return storedToken === DEV_PREVIEW_TOKEN_FALLBACK;
};

export const isDevPreviewToken = (token: string | null | undefined): boolean => {
  if (!isDevDashboardPreviewMode()) return false;
  const storedToken = getStoredPreviewToken();
  return token === DEV_PREVIEW_TOKEN_FALLBACK || (!!storedToken && token === storedToken);
};
