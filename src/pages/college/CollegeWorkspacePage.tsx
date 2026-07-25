import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  clearCollegeSession,
  collegeApi,
  getCollegeSession,
  hasCollegeToken,
  type CollegeApiError,
} from "@/lib/collegeApi";
import CollegeLeaderboardTab from "./CollegeLeaderboardTab";
import CollegeWorkspaceDetailsTab from "./CollegeWorkspaceDetailsTab";
import type {
  CollegeWorkspace,
  CollegeWorkspaceResponse,
  CollegeWorkspaceStatus,
} from "./types";

const STATUS_LABEL: Record<CollegeWorkspaceStatus, string> = {
  draft: "Draft",
  published: "Published",
  started: "Live",
  ended: "Ended",
  archived: "Archived",
};

const STATUS_CLASS: Record<CollegeWorkspaceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-100 text-blue-800",
  started: "bg-green-100 text-green-800",
  ended: "bg-amber-100 text-amber-800",
  archived: "bg-destructive/10 text-destructive",
};

export default function CollegeWorkspacePage() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<CollegeWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("details");
  const session = getCollegeSession();

  const signOut = useCallback(
    (message?: string) => {
      clearCollegeSession();
      if (message) toast.error(message);
      navigate("/c/login", { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (!hasCollegeToken()) {
      navigate("/c/login", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await collegeApi.get<CollegeWorkspaceResponse>("/api/college/me");
        if (!cancelled) setWorkspace(res.workspace);
      } catch (error) {
        if (cancelled) return;
        const err = error as CollegeApiError;
        if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
          signOut("Your session has ended. Please sign in again.");
          return;
        }
        toast.error(err.message || "Failed to load workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            We could not load your workspace.
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
              <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{workspace.organization}</h1>
              <p className="text-sm text-muted-foreground">
                {workspace.name} · <span className="font-mono">{workspace.code}</span>
              </p>
              {session?.userId && (
                <p className="mt-1 text-xs text-muted-foreground">{session.userId}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={STATUS_CLASS[workspace.status]}>
              {STATUS_LABEL[workspace.status]}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="details">Workspace Details</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-6">
            <CollegeWorkspaceDetailsTab workspace={workspace} />
          </TabsContent>
          <TabsContent value="leaderboard" className="mt-6">
            <CollegeLeaderboardTab
              active={tab === "leaderboard"}
              onUnauthorized={() =>
                signOut("Your session has ended. Please sign in again.")
              }
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
