import type { UserWorkspace, UserWorkspaceRegistration, UserWorkspaceStatus } from "./types";

export function normalizeWorkspaceCode(value: string): string {
  return value.trim().toUpperCase();
}

export function formatWorkspaceDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function workspaceStatusLabel(status: UserWorkspaceStatus): string {
  return status.replace(/_/g, " ");
}

export function workspaceStatusClass(status: UserWorkspaceStatus): string {
  if (status === "published") return "border-blue-400/30 bg-blue-400/10 text-blue-200";
  if (status === "started") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "ended") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (status === "archived") return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-slate-400/30 bg-slate-400/10 text-slate-200";
}

export function registrationProgress(registration: UserWorkspaceRegistration): { completed: number; total: number } {
  const total = registration.workspace?.rounds?.length ?? registration.workspace?.totalRounds ?? 0;
  const completed = (registration.roundAttempts ?? []).filter((attempt) =>
    attempt.status === "completed" || attempt.status === "auto_completed"
  ).length;
  return { completed, total };
}

export function isJoinableWorkspace(workspace?: Pick<UserWorkspace, "status"> | null): boolean {
  return !!workspace && (workspace.status === "published" || workspace.status === "started");
}
