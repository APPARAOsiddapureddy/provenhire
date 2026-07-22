import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import UserWorkspaceShell from "./UserWorkspaceShell";
import type {
  UserWorkspace,
  UserWorkspaceLeaderboardResponse,
  UserWorkspaceRegistration,
  UserWorkspaceRound,
  UserWorkspaceRoundAttempt,
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
        <div
          key={item}
          className="grid grid-cols-[64px_1fr_90px_120px] gap-4 rounded-lg border border-[var(--dash-navy-border)] p-3"
        >
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
  const [registration, setRegistration] =
    useState<UserWorkspaceRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadWorkspace = useCallback(async (silent = false) => {
    const workspaceCode = normalizeWorkspaceCode(decodeURIComponent(code));
    if (!workspaceCode) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get<{
        workspace: UserWorkspace;
        registration: UserWorkspaceRegistration | null;
      }>(`/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/me`);
      setWorkspace(res.workspace);
      setRegistration(res.registration);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load assessment",
      );
      navigate("/dashboard/jobseeker/workspaces");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [code, navigate]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const hasPendingPlacementReport = Boolean(
    registration?.roundAttempts?.some(
      (attempt) =>
        attempt.roundType === "interview" &&
        attempt.status === "active" &&
        ["started", "processing"].includes(
          attempt.placementReadinessHandoff?.status || "",
        ),
    ),
  );

  useEffect(() => {
    if (!hasPendingPlacementReport) return;
    const timer = window.setInterval(() => void loadWorkspace(true), 5_000);
    return () => window.clearInterval(timer);
  }, [hasPendingPlacementReport, loadWorkspace]);

  const joinWorkspace = async () => {
    if (!workspace) return;
    setJoining(true);
    try {
      await api.post(
        `/api/user/workspaces/code/${encodeURIComponent(workspace.code)}/join`,
        {},
      );
      toast.success("Assessment added.");
      await loadWorkspace();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not join assessment",
      );
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
            Assessments
          </Link>
        </Button>

        <div className="dashboard-hero-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="dashboard-eyebrow">{workspace.organization}</div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="dashboard-hero-title">{workspace.name}</h1>
                <Badge
                  variant="outline"
                  className={workspaceStatusClass(workspace.status)}
                >
                  {workspaceStatusLabel(workspace.status)}
                </Badge>
              </div>
              <p className="dashboard-hero-subtitle">
                Invitation code{" "}
                <span className="font-mono text-[var(--dash-gold)]">
                  {workspace.code}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canJoin && (
                <Button onClick={joinWorkspace} disabled={joining}>
                  {joining ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4 mr-2" />
                  )}
                  Join assessment
                </Button>
              )}
              {registration && (
                <Badge
                  variant="outline"
                  className={
                    isRemoved
                      ? "border-red-400/30 bg-red-400/10 text-red-200"
                      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  }
                >
                  {isRemoved ? "Access removed" : "Joined"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isRemoved && (
          <Card className="border-red-400/30 bg-red-400/5">
            <CardContent className="p-4 text-sm text-red-100">
              Your access to this assessment was removed. Contact the organizer if this looks wrong.
            </CardContent>
          </Card>
        )}

        {hasPendingPlacementReport && (
          <Card className="border-amber-400/30 bg-amber-400/5">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-300" />
                <div>
                  <h2 className="font-semibold text-amber-100">Interview complete</h2>
                  <p className="mt-1 text-sm leading-6 text-amber-100/80">Your interview is saved. We are preparing your feedback, which is usually ready within five minutes. You can safely leave this page and return to Results later.</p>
                  <Button className="mt-3" size="sm" variant="outline" asChild>
                    <Link to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}/reports?module=interview`}>Check feedback</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="rounds" className="min-w-0 space-y-4">
          <TabsList className="workspace-dashboard-tabs border border-[var(--dash-navy-border)] bg-white/[0.04]">
            <TabsTrigger value="overview">Details</TabsTrigger>
            <TabsTrigger value="rounds">Assessment plan</TabsTrigger>
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <WorkspaceOverview
              workspace={workspace}
              registration={registration}
            />
          </TabsContent>

          <TabsContent value="rounds">
            <WorkspaceRounds
              workspace={workspace}
              registration={registration}
            />
          </TabsContent>

          <TabsContent value="leaderboard">
            <WorkspaceLeaderboard workspaceCode={workspace.code} />
          </TabsContent>
        </Tabs>
      </div>
    </UserWorkspaceShell>
  );
}

function WorkspaceOverview({
  workspace,
  registration,
}: {
  workspace: UserWorkspace;
  registration: UserWorkspaceRegistration | null;
}) {
  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <CardTitle className="text-base text-[var(--dash-text-primary)] flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[var(--dash-gold)]" />
          Assessment details
        </CardTitle>
        <CardDescription>
          Review the schedule and access rules for this assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Info
          label="Access"
          value={
            workspace.accessMode === "invite_only" ? "Invite-only" : "Public"
          }
        />
        <Info label="Starts" value={formatWorkspaceDate(workspace.startAt)} />
        <Info label="Ends" value={formatWorkspaceDate(workspace.endAt)} />
        <Info
          label="Your access"
          value={registration ? (registration.status === "registered" ? "Joined" : registration.status) : "Not joined"}
        />
      </CardContent>
    </Card>
  );
}

function WorkspaceRounds({
  workspace,
  registration,
}: {
  workspace: UserWorkspace;
  registration: UserWorkspaceRegistration | null;
}) {
  const attempts = new Map(
    (registration?.roundAttempts ?? []).map((attempt) => [
      attempt.workspaceRoundId,
      attempt,
    ]),
  );
  const completedCount = (registration?.roundAttempts ?? []).filter(
    (attempt) =>
      attempt.status === "completed" || attempt.status === "auto_completed",
  ).length;
  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-[var(--dash-text-primary)]">
              Assessment plan
            </CardTitle>
            <CardDescription>
              Complete the rounds in order. Your progress is saved after each round.
            </CardDescription>
          </div>
          {registration && completedCount > 0 ? (
            <Button size="sm" asChild>
              <Link
                to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}/reports?module=overview`}
              >
                View results and feedback ({completedCount}/{workspace.rounds.length})
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:hidden">
          {workspace.rounds.map((round) => {
            const attempt = attempts.get(round.id);
            const previousComplete = workspace.rounds
              .filter((candidate) => candidate.order < round.order)
              .every((candidate) => {
                const previous = attempts.get(candidate.id);
                return previous?.status === "completed" || previous?.status === "auto_completed";
              });
            const typeLabel = { mcq: "Aptitude", coding: "Coding", sql: "SQL", interview: "AI interview" }[round.type];
            const isComplete = attempt?.status === "completed" || attempt?.status === "auto_completed";
            return (
              <article key={round.id} className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-[var(--dash-gold)]">Round {round.order}</div>
                    <h3 className="mt-1 font-semibold leading-6 text-[var(--dash-text-primary)]">{round.name}</h3>
                  </div>
                  <Badge variant="outline">{typeLabel}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-[var(--dash-text-muted)]">Questions</dt><dd className="mt-1 font-medium text-[var(--dash-text-primary)]">{round.questionCount}</dd></div>
                  <div><dt className="text-xs text-[var(--dash-text-muted)]">Time</dt><dd className="mt-1 font-medium text-[var(--dash-text-primary)]">{round.timeLimitMins} min</dd></div>
                  <div><dt className="text-xs text-[var(--dash-text-muted)]">Score weight</dt><dd className="mt-1 font-medium text-[var(--dash-text-primary)]">{round.scoreWeightage}%</dd></div>
                </dl>
                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--dash-navy-border)] pt-4">
                  <div className="text-sm text-[var(--dash-text-muted)]">
                    {isComplete ? <span className="font-semibold text-emerald-200">Score: {attempt?.percentageScore ?? attempt?.score ?? "—"}/100</span> : attempt?.status === "active" ? <span className="text-amber-200">In progress</span> : "Not started"}
                  </div>
                  <div className="flex justify-stretch [&>*]:w-full">
                    <RoundAction round={round} workspace={workspace} registered={registration?.status === "registered"} attempt={attempt} previousComplete={previousComplete} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Round</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Result</TableHead>
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
                    return (
                      previous?.status === "completed" ||
                      previous?.status === "auto_completed"
                    );
                  });
                return (
                  <TableRow key={round.id}>
                    <TableCell>
                      <div className="font-medium text-[var(--dash-text-primary)]">
                        {round.name}
                      </div>
                      <div className="text-xs text-[var(--dash-text-muted)]">
                        Round {round.order}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {{
                          mcq: "Aptitude",
                          coding: "Coding / DSA",
                          sql: "SQL",
                          interview: "AI interview",
                        }[round.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>{round.questionCount}</TableCell>
                    <TableCell>{round.timeLimitMins} min</TableCell>
                    <TableCell>{round.scoreWeightage}%</TableCell>
                    <TableCell>
                      {attempt?.status === "completed" ||
                      attempt?.status === "auto_completed" ? (
                        <span className="font-semibold text-emerald-200">
                          {attempt.percentageScore ?? attempt.score ?? "—"}/100
                        </span>
                      ) : attempt?.status === "active" ? (
                        <span className="text-amber-200">In progress</span>
                      ) : attempt?.status === "discarded" ? (
                        <span className="font-medium text-red-200">Invalidated</span>
                      ) : (
                        <span className="text-[var(--dash-text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RoundAction
                        round={round}
                        workspace={workspace}
                        registered={registration?.status === "registered"}
                        attempt={attempt}
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
  attempt,
  previousComplete,
}: {
  round: UserWorkspaceRound;
  workspace: UserWorkspace;
  registered: boolean;
  attempt?: UserWorkspaceRoundAttempt;
  previousComplete: boolean;
}) {
  if (attempt?.status === "discarded") {
    return (
      <div className="flex items-center justify-end gap-2 text-red-200">
        <ShieldAlert className="h-4 w-4" />
        <span className="text-sm font-medium">Integrity review required</span>
      </div>
    );
  }
  if (attempt?.status === "completed" || attempt?.status === "auto_completed") {
    const module = {
      mcq: "aptitude",
      coding: "dsa",
      sql: "sql",
      interview: "interview",
    }[round.type];
    return (
      <div className="flex items-center justify-end gap-2">
        <Badge
          variant="outline"
          className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          Completed
        </Badge>
        <Button size="sm" variant="outline" asChild>
          <Link
            to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}/reports?module=${module}`}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            View report
          </Link>
        </Button>
      </div>
    );
  }
  const placementStatus = attempt?.placementReadinessHandoff?.status;
  if (
    round.type === "interview" &&
    attempt?.status === "active" &&
    ["started", "processing"].includes(placementStatus || "")
  ) {
    return (
      <div className="max-w-56 space-y-1 text-right">
        <Badge
          variant="outline"
          className="border-amber-400/30 bg-amber-400/10 text-amber-100"
        >
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          Report processing
        </Badge>
        <p className="text-xs leading-5 text-muted-foreground">
          Your interview is saved. Feedback is usually ready within five minutes.
        </p>
      </div>
    );
  }
  if (
    registered &&
    workspace.status === "started" &&
    previousComplete &&
    (round.type === "mcq" ||
      round.type === "coding" ||
      round.type === "sql" ||
      round.type === "interview")
  ) {
    return (
      <Button size="sm" asChild>
        <Link
          to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}/rounds/${encodeURIComponent(round.id)}`}
        >
          {round.type === "interview" && placementStatus === "failed"
            ? "Retry interview"
            : attempt?.status === "active"
              ? round.type === "interview"
                ? "Retry launch"
                : "Continue"
              : "Start"}
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
  const [rows, setRows] = useState<
    UserWorkspaceLeaderboardResponse["leaderboard"]
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "20" });
      if (cursor) qs.set("cursor", cursor);
      const res = await api.get<UserWorkspaceLeaderboardResponse>(
        `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/leaderboard?${qs.toString()}`,
      );
      setRows((prev) =>
        cursor ? [...prev, ...res.leaderboard] : res.leaderboard,
      );
      setNextCursor(res.nextCursor);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load leaderboard",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceCode]);

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <Card className="workspace-dashboard-panel">
      <CardHeader>
        <CardTitle className="text-base text-[var(--dash-text-primary)] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--dash-gold)]" />
          Rankings
        </CardTitle>
        <CardDescription>Candidate identities are hidden. Scores appear after round completion.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <LeaderboardSkeleton />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[var(--dash-text-muted)]">
            No scores yet.
          </div>
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
                    <TableRow key={`${row.rank}-${row.candidateLabel}`}>
                      <TableCell>#{row.rank}</TableCell>
                      <TableCell>
                        <div className="font-medium text-[var(--dash-text-primary)]">
                          {row.candidateLabel}
                        </div>
                      </TableCell>
                      <TableCell>{row.totalScore}</TableCell>
                      <TableCell>{row.completedRounds}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextCursor && (
              <Button
                variant="outline"
                onClick={() => load(nextCursor)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
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
      <div className="mt-1 font-medium text-[var(--dash-text-primary)]">
        {value}
      </div>
    </div>
  );
}
