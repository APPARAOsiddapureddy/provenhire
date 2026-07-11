import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Loader2, Lock, Trophy, Users } from "lucide-react";
import UserWorkspaceShell from "./UserWorkspaceShell";
import type {
  UserWorkspace,
  UserWorkspaceLeaderboardResponse,
  UserWorkspaceRegistration,
  UserWorkspaceRound,
} from "./types";
import {
  formatWorkspaceDate,
  isJoinableWorkspace,
  normalizeWorkspaceCode,
  workspaceStatusClass,
  workspaceStatusLabel,
} from "./workspaceUserUtils";

function WorkspaceDetailSkeleton() {
  return (
    <div className="workspace-dashboard-page space-y-6">
      <Skeleton className="h-10 w-40 rounded-md" />
      <div className="dashboard-hero-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.03] p-6">
        <Skeleton className="mb-5 h-10 w-72 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="grid grid-cols-[64px_1fr_90px_120px] gap-4 rounded-lg border border-[var(--dash-navy-border)] p-3">
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-5 w-full max-w-48" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function UserWorkspaceDetailPage() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<UserWorkspace | null>(null);
  const [registration, setRegistration] = useState<UserWorkspaceRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadWorkspace = async () => {
    const workspaceCode = normalizeWorkspaceCode(decodeURIComponent(code));
    if (!workspaceCode) return;
    setLoading(true);
    try {
      const res = await api.get<{ workspace: UserWorkspace; registration: UserWorkspaceRegistration | null }>(
        `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/me`
      );
      setWorkspace(res.workspace);
      setRegistration(res.registration);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspace");
      navigate("/dashboard/jobseeker/workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [code]);

  const joinWorkspace = async () => {
    if (!workspace) return;
    setJoining(true);
    try {
      await api.post(`/api/user/workspaces/code/${encodeURIComponent(workspace.code)}/join`, {});
      toast.success("Workspace joined.");
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join workspace");
    } finally {
      setJoining(false);
    }
  };

  if (loading || !workspace) {
    return (
      <UserWorkspaceShell>
        <WorkspaceDetailSkeleton />
      </UserWorkspaceShell>
    );
  }

  const canJoin = !registration && isJoinableWorkspace(workspace);
  const isRemoved = registration?.status === "removed";

  return (
    <UserWorkspaceShell>
      <div className="workspace-dashboard-page space-y-6">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/jobseeker/workspaces">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Workspaces
          </Link>
        </Button>

        <div className="dashboard-hero-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="dashboard-eyebrow">{workspace.organization}</div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="dashboard-hero-title">{workspace.name}</h1>
                <Badge variant="outline" className={workspaceStatusClass(workspace.status)}>
                  {workspaceStatusLabel(workspace.status)}
                </Badge>
              </div>
              <p className="dashboard-hero-subtitle">
                Code <span className="font-mono text-[var(--dash-gold)]">{workspace.code}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canJoin && (
                <Button onClick={joinWorkspace} disabled={joining}>
                  {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
                  Join workspace
                </Button>
              )}
              {registration && (
                <Badge variant="outline" className={isRemoved ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}>
                  {isRemoved ? "Removed" : "Registered"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isRemoved && (
          <Card className="border-red-400/30 bg-red-400/5">
            <CardContent className="p-4 text-sm text-red-100">
              You were removed from this workspace. Contact the workspace organizer if this looks wrong.
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="min-w-0 space-y-4">
          <TabsList className="workspace-dashboard-tabs border border-[var(--dash-navy-border)] bg-white/[0.04]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="rounds">Rounds</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <WorkspaceOverview workspace={workspace} registration={registration} />
          </TabsContent>

          <TabsContent value="rounds">
            <WorkspaceRounds workspace={workspace} registration={registration} />
          </TabsContent>

          <TabsContent value="leaderboard">
            <WorkspaceLeaderboard workspaceCode={workspace.code} />
          </TabsContent>
        </Tabs>
      </div>
    </UserWorkspaceShell>
  );
}

function WorkspaceOverview({ workspace, registration }: { workspace: UserWorkspace; registration: UserWorkspaceRegistration | null }) {
  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <CardTitle className="text-base text-[var(--dash-text-primary)] flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--dash-gold)]" />
          Workspace overview
        </CardTitle>
        <CardDescription>Attempts will be available in the next workspace phase.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Info label="Access" value={workspace.accessMode === "invite_only" ? "Invite-only" : "Public"} />
        <Info label="Starts" value={formatWorkspaceDate(workspace.startAt)} />
        <Info label="Ends" value={formatWorkspaceDate(workspace.endAt)} />
        <Info label="Registration" value={registration ? registration.status : "Not joined"} />
      </CardContent>
    </Card>
  );
}

function WorkspaceRounds({ workspace, registration }: { workspace: UserWorkspace; registration: UserWorkspaceRegistration | null }) {
  const attempts = new Map((registration?.roundAttempts ?? []).map((attempt) => [attempt.workspaceRoundId, attempt]));
  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <CardTitle className="text-base text-[var(--dash-text-primary)]">Rounds</CardTitle>
        <CardDescription>Read-only round configuration for now.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Round</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.rounds.map((round) => {
                const attempt = attempts.get(round.id);
                const previousComplete = workspace.rounds
                  .filter((candidate) => candidate.order < round.order)
                  .every((candidate) => {
                    const previous = attempts.get(candidate.id);
                    return previous?.status === "completed" || previous?.status === "auto_completed";
                  });
                return (
                  <TableRow key={round.id}>
                    <TableCell>
                      <div className="font-medium text-[var(--dash-text-primary)]">{round.name}</div>
                      <div className="text-xs text-[var(--dash-text-muted)]">Round {round.order}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{round.type}</Badge>
                    </TableCell>
                    <TableCell>{round.questionCount}</TableCell>
                    <TableCell>{round.timeLimitMins} min</TableCell>
                    <TableCell>{round.scoreWeightage}%</TableCell>
                    <TableCell className="text-right">
                      <RoundAction
                        round={round}
                        workspace={workspace}
                        registered={registration?.status === "registered"}
                        attemptStatus={attempt?.status}
                        previousComplete={previousComplete}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function RoundAction({
  round,
  workspace,
  registered,
  attemptStatus,
  previousComplete,
}: {
  round: UserWorkspaceRound;
  workspace: UserWorkspace;
  registered: boolean;
  attemptStatus?: string;
  previousComplete: boolean;
}) {
  if (attemptStatus === "completed" || attemptStatus === "auto_completed") {
    return <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">Completed</Badge>;
  }
  if (
    registered &&
    workspace.status === "started" &&
    previousComplete &&
    (round.type === "mcq" || round.type === "coding" || round.type === "sql")
  ) {
    return (
      <Button size="sm" asChild>
        <Link to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}/rounds/${encodeURIComponent(round.id)}`}>
          {attemptStatus === "active" ? "Continue" : "Start"}
        </Link>
      </Button>
    );
  }
  const disabledReason = !registered
    ? "Join first"
    : workspace.status !== "started"
      ? "Starts after organizer begins"
      : !previousComplete
        ? "Locked"
        : "Coming soon";
  return (
    <Button variant="outline" size="sm" disabled>
      <Lock className="h-4 w-4 mr-2" />
      {disabledReason}
    </Button>
  );
}

function WorkspaceLeaderboard({ workspaceCode }: { workspaceCode: string }) {
  const [rows, setRows] = useState<UserWorkspaceLeaderboardResponse["leaderboard"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (cursor?: string | null) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "20" });
      if (cursor) qs.set("cursor", cursor);
      const res = await api.get<UserWorkspaceLeaderboardResponse>(
        `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/leaderboard?${qs.toString()}`
      );
      setRows((prev) => (cursor ? [...prev, ...res.leaderboard] : res.leaderboard));
      setNextCursor(res.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(null);
  }, [workspaceCode]);

  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <CardTitle className="text-base text-[var(--dash-text-primary)] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--dash-gold)]" />
          Leaderboard
        </CardTitle>
        <CardDescription>Scores appear after round completion.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <LeaderboardSkeleton />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[var(--dash-text-muted)]">No scores yet.</div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Rounds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.rank}-${row.userId}`}>
                      <TableCell>#{row.rank}</TableCell>
                      <TableCell>
                        <div className="font-medium text-[var(--dash-text-primary)]">{row.name || row.email}</div>
                        <div className="text-xs text-[var(--dash-text-muted)]">{row.email}</div>
                      </TableCell>
                      <TableCell>{row.totalScore}</TableCell>
                      <TableCell>{row.completedRounds}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextCursor && (
              <Button variant="outline" onClick={() => load(nextCursor)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Load more
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.03] px-3 py-2">
      <div className="text-xs text-[var(--dash-text-muted)]">{label}</div>
      <div className="mt-1 font-medium text-[var(--dash-text-primary)]">{value}</div>
    </div>
  );
}
