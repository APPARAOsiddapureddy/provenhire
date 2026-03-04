import { useEffect, useState, useCallback } from "react";

export const useSignedUrl = (storedUrl: string | null | undefined) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setSignedUrl(storedUrl || null);
    } catch (err: any) {
      setError(err?.message || "Failed to resolve URL");
      setSignedUrl(storedUrl || null);
    } finally {
      setLoading(false);
    }
  }, [storedUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { signedUrl, loading, error, refresh };
};

export const getSignedResumeUrl = async (storedUrl: string) => storedUrl || null;
