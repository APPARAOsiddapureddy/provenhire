import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, LogOut, Play, Square } from "lucide-react";
import { toast } from "sonner";
import {
  clearCollegeSession,
  collegeApi,
  getCollegeSession,
  hasCollegeToken,
  type CollegeApiError,
} from "@/lib/collegeApi";
import CollegeConfirmModal from "./CollegeConfirmModal";
import CollegeLeaderboardTab from "./CollegeLeaderboardTab";
import CollegeRegistrationsTab from "./CollegeRegistrationsTab";
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
  const [lifecycleAction, setLifecycleAction] = useState<"start" | "end" | null>(
    null,
  );
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const session = getCollegeSession();

  const signOut = useCallback(
    (message?: string) => {
      clearCollegeSession();
      if (message) toast.error(message);
      navigate("/c/login", { replace: true });
    },
    [navigate],
  );

  const loadWorkspace = useCallback(async () => {
    try {
      const res = await collegeApi.get<CollegeWorkspaceResponse>("/api/college/me");
      setWorkspace(res.workspace);
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
        signOut("Your session has ended. Please sign in again.");
        return;
      }
      toast.error(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (!hasCollegeToken()) {
      navigate("/c/login", { replace: true });
      return;
    }
    void loadWorkspace();
  }, [navigate, loadWorkspace]);

  const runLifecycleAction = async () => {
    if (!lifecycleAction) return;
    setLifecycleSubmitting(true);
    try {
      await collegeApi.post(`/api/college/workspace/${lifecycleAction}`);
      toast.success(
        lifecycleAction === "start"
          ? "Workspace is now open for attempts."
          : "Workspace ended.",
      );
      setLifecycleAction(null);
      await loadWorkspace();
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
        signOut("Your session has ended. Please sign in again.");
        return;
      }
      toast.error(err.message || "Action failed");
    } finally {
      setLifecycleSubmitting(false);
    }
  };

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
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={STATUS_CLASS[workspace.status]}>
              {STATUS_LABEL[workspace.status]}
            </Badge>
            {workspace.status === "published" && (
              <Button size="sm" onClick={() => setLifecycleAction("start")}>
                <Play className="mr-2 h-4 w-4" aria-hidden />
                Start
              </Button>
            )}
            {workspace.status === "started" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setLifecycleAction("end")}
              >
                <Square className="mr-2 h-4 w-4" aria-hidden />
                End
              </Button>
            )}
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
            <TabsTrigger value="users">Joined Users</TabsTrigger>
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
          <TabsContent value="users" className="mt-6">
            <CollegeRegistrationsTab
              active={tab === "users"}
              onUnauthorized={() =>
                signOut("Your session has ended. Please sign in again.")
              }
            />
          </TabsContent>
        </Tabs>
      </main>

      <CollegeConfirmModal
        open={lifecycleAction !== null}
        title={
          lifecycleAction === "start"
            ? "Start this workspace?"
            : "End this workspace?"
        }
        description={
          lifecycleAction === "start"
            ? "Registered candidates will be able to begin their assigned rounds."
            : "Every assessment still in progress will be submitted and scored as-is. This cannot be undone."
        }
        confirmLabel="Yes"
        cancelLabel="No"
        variant={lifecycleAction === "end" ? "destructive" : "default"}
        loading={lifecycleSubmitting}
        onOpenChange={(open) => {
          if (!open) setLifecycleAction(null);
        }}
        onConfirm={runLifecycleAction}
      />
    </div>
  );
}
