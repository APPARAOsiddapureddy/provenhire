import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import type { WorkspaceAnalyticsSnapshot } from "./workspaceAnalyticsTypes";
import {
  WorkspaceModuleBreakdown,
  WorkspaceReadinessSummary,
  WorkspaceRetakeTable,
} from "@/components/admin/WorkspaceAnalyticsCharts";

const POLL_INTERVAL_MS = 45_000;

export default function WorkspaceAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAnalytics = useCallback(
    async (showToast = false) => {
      if (!id) return;
      if (showToast) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.get<{ analytics: WorkspaceAnalyticsSnapshot }>(
          `/api/workspaces/${id}/analytics`,
        );
        setAnalytics(res.analytics);
        if (showToast) toast.success("Analytics refreshed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load analytics");
        if (!showToast) navigate(`/admin/workspaces/${id}`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, navigate],
  );

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    pollRef.current = setInterval(() => void fetchAnalytics(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAnalytics]);

  if (loading || !analytics) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const generatedAtLabel = new Date(analytics.generatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Button asChild variant="outline" size="sm">
                <Link to={`/admin/workspaces/${analytics.workspace.id}`}>
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Workspace</span>
                </Link>
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate">{analytics.workspace.name}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {analytics.workspace.totalCandidates} candidates &middot; generated at {generatedAtLabel}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchAnalytics(true)} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <WorkspaceReadinessSummary readiness={analytics.readiness} />
        <WorkspaceModuleBreakdown modules={analytics.modules} />
        <WorkspaceRetakeTable retakeList={analytics.retakeList} />
      </main>
    </div>
  );
}
