/**
 * Runs a single /api/health check before rendering children. When the backend is down
 * this triggers the circuit breaker so children (ExpertDashboard, NotificationInbox)
 * skip their fetches and we get at most one 503 instead of many (e.g. after Google SSO).
 */
import { useEffect, useState } from "react";
import { api, isBackendDownCooldown } from "@/lib/api";
import { PageLoaderFullScreen } from "@/components/PageLoader";

export default function BackendGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isBackendDownCooldown()) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        await api.get<{ ok?: boolean }>("/api/health");
      } catch {
        // Circuit breaker is set by api; children will skip their fetches
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <PageLoaderFullScreen />;
  return <>{children}</>;
}
