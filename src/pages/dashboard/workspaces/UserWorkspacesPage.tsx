import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowRight, ClipboardList, Loader2, Search, Users } from "lucide-react";
import UserWorkspaceShell from "./UserWorkspaceShell";
import type { UserWorkspace, UserWorkspaceRegistration } from "./types";
import {
  formatWorkspaceDate,
  isJoinableWorkspace,
  normalizeWorkspaceCode,
  registrationProgress,
  workspaceStatusClass,
  workspaceStatusLabel,
} from "./workspaceUserUtils";

export default function UserWorkspacesPage() {
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<UserWorkspaceRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<UserWorkspace | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [joining, setJoining] = useState(false);

  const loadRegistrations = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ registrations: UserWorkspaceRegistration[] }>("/api/user/workspaces/me");
      setRegistrations(res.registrations ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRegistrations();
  }, []);

  const grouped = useMemo(() => {
    const active = registrations.filter((item) => item.workspace?.status === "started");
    const upcoming = registrations.filter((item) => item.workspace?.status === "published");
    const ended = registrations.filter((item) => item.workspace?.status === "ended");
    const other = registrations.filter((item) => !item.workspace || !["started", "published", "ended"].includes(item.workspace.status));
    return { active, upcoming, ended, other };
  }, [registrations]);

  const previewWorkspace = async (event?: FormEvent) => {
    event?.preventDefault();
    const workspaceCode = normalizeWorkspaceCode(code);
    if (!workspaceCode) {
      toast.error("Enter a workspace code.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.get<{ workspace: UserWorkspace }>(`/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}`);
      setPreview(res.workspace);
      setCode(res.workspace.code);
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof Error ? error.message : "Workspace not found");
    } finally {
      setPreviewing(false);
    }
  };

  const joinWorkspace = async (workspaceCode: string) => {
    setJoining(true);
    try {
      await api.post(`/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/join`, {});
      toast.success("Workspace joined.");
      await loadRegistrations();
      navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join workspace");
    } finally {
      setJoining(false);
    }
  };

  return (
    <UserWorkspaceShell>
      <div className="workspace-dashboard-page space-y-6">
        <div className="dashboard-hero-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="dashboard-eyebrow">Workspace assessments</div>
              <h1 className="dashboard-hero-title">Join and track hiring workspaces</h1>
              <p className="dashboard-hero-subtitle">
                Enter a workspace code shared by an organizer, join the event, and track your rounds from one place.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--dash-navy-border)] bg-white/5 px-4 py-3 text-sm text-[var(--dash-text-muted)]">
              Attempts open only after the organizer starts the workspace.
            </div>
          </div>
        </div>

        <Card className="workspace-dashboard-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-[var(--dash-text-primary)]">
              <Search className="h-4 w-4 text-[var(--dash-gold)]" />
              Join with code
            </CardTitle>
            <CardDescription>Preview the workspace before joining.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={previewWorkspace} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="PH-ORG-2026-1234"
                className="font-mono"
              />
              <Button type="submit" disabled={previewing}>
                {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Preview
              </Button>
            </form>

            {preview && (
              <WorkspacePreviewCard workspace={preview} joining={joining} onJoin={() => joinWorkspace(preview.code)} />
            )}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--dash-text-primary)]">My workspaces</h2>
              <p className="text-sm text-[var(--dash-text-muted)]">Registered events and progress.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadRegistrations} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[var(--dash-text-muted)]">Loading workspaces...</div>
          ) : registrations.length === 0 ? (
            <div className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.03] p-8 text-center sm:p-10">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 text-[var(--dash-text-muted)]" />
              <div className="font-semibold text-[var(--dash-text-primary)]">No joined workspaces yet</div>
              <div className="text-sm text-[var(--dash-text-muted)] mt-1">Use the code box above to join your first workspace.</div>
            </div>
          ) : (
            <div className="space-y-6">
              <WorkspaceGroup title="Active" items={grouped.active} />
              <WorkspaceGroup title="Upcoming" items={grouped.upcoming} />
              <WorkspaceGroup title="Ended" items={grouped.ended} />
              <WorkspaceGroup title="Other" items={grouped.other} />
            </div>
          )}
        </section>
      </div>
    </UserWorkspaceShell>
  );
}

function WorkspacePreviewCard({ workspace, joining, onJoin }: { workspace: UserWorkspace; joining: boolean; onJoin: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--dash-navy-border)] bg-[var(--dash-navy-light)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[var(--dash-text-primary)]">{workspace.name}</h3>
            <Badge variant="outline" className={workspaceStatusClass(workspace.status)}>
              {workspaceStatusLabel(workspace.status)}
            </Badge>
          </div>
          <p className="text-sm text-[var(--dash-text-muted)] mt-1">{workspace.organization}</p>
          <p className="text-xs font-mono text-[var(--dash-gold)] mt-2">{workspace.code}</p>
        </div>
        <Button onClick={onJoin} disabled={joining || !isJoinableWorkspace(workspace)}>
          {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
          {isJoinableWorkspace(workspace) ? "Join" : "Closed"}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
        <Info label="Starts" value={formatWorkspaceDate(workspace.startAt)} />
        <Info label="Ends" value={formatWorkspaceDate(workspace.endAt)} />
        <Info label="Rounds" value={`${workspace.rounds?.length ?? 0}/${workspace.totalRounds}`} />
      </div>
    </div>
  );
}

function WorkspaceGroup({ title, items }: { title: string; items: UserWorkspaceRegistration[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-muted)]">{title}</h3>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {items.map((registration) => (
          <RegisteredWorkspaceCard key={registration.id} registration={registration} />
        ))}
      </div>
    </div>
  );
}

function RegisteredWorkspaceCard({ registration }: { registration: UserWorkspaceRegistration }) {
  const workspace = registration.workspace;
  const progress = registrationProgress(registration);
  const progressValue = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  if (!workspace) return null;

  return (
    <Link
      to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspace.code)}`}
      className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.03] p-4 hover:bg-white/[0.06] transition block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-[var(--dash-text-primary)] truncate">{workspace.name}</h4>
            <Badge variant="outline" className={workspaceStatusClass(workspace.status)}>
              {workspaceStatusLabel(workspace.status)}
            </Badge>
          </div>
          <p className="text-sm text-[var(--dash-text-muted)] mt-1">{workspace.organization}</p>
          <p className="text-xs font-mono text-[var(--dash-gold)] mt-2">{workspace.code}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-[var(--dash-text-muted)] shrink-0" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--dash-text-muted)]">
          <span>Round progress</span>
          <span>{progress.completed}/{progress.total}</span>
        </div>
        <Progress value={progressValue} className="h-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
        <Info label="Starts" value={formatWorkspaceDate(workspace.startAt)} />
        <Info label="Ends" value={formatWorkspaceDate(workspace.endAt)} />
      </div>
    </Link>
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
