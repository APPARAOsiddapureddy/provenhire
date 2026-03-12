/**
 * Hook to fetch platform feature flags (proctoring/integrity modes).
 * Used by assessment components to decide OFF / MONITOR / STRICT behavior.
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export type FeatureFlagMode = "OFF" | "MONITOR" | "STRICT";

export interface FeatureFlag {
  featureName: string;
  mode: FeatureFlagMode;
  description: string | null;
  updatedAt: string;
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, FeatureFlagMode>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<{ flags: FeatureFlag[] }>("/api/feature-flags");
      const map: Record<string, FeatureFlagMode> = {};
      (res.flags ?? []).forEach((f) => {
        map[f.featureName] = f.mode;
      });
      setFlags(map);
    } catch (e) {
      setError((e as Error)?.message ?? "Failed to load feature flags");
      setFlags({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const getMode = (featureName: string): FeatureFlagMode =>
    flags[featureName] ?? "OFF";

  const isEnabled = (featureName: string): boolean => {
    const m = getMode(featureName);
    return m === "MONITOR" || m === "STRICT";
  };

  const isStrict = (featureName: string): boolean =>
    getMode(featureName) === "STRICT";

  const isMonitor = (featureName: string): boolean =>
    getMode(featureName) === "MONITOR";

  return {
    flags,
    loading,
    error,
    refetch: fetchFlags,
    getMode,
    isEnabled,
    isStrict,
    isMonitor,
  };
}
