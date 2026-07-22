import type {
  Workspace,
  WorkspaceDetailsDraft,
  WorkspaceRound,
  WorkspaceRoundDraft,
  WorkspaceStatus,
} from "./types";

export const WORKSPACE_STATUSES: Array<WorkspaceStatus | "all"> = [
  "all",
  "draft",
  "published",
  "started",
  "ended",
  "archived",
];

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toDateTimeLocal(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function statusLabel(status: WorkspaceStatus): string {
  return status.replace(/_/g, " ");
}

export function statusBadgeClass(status: WorkspaceStatus): string {
  if (status === "draft")
    return "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300";
  if (status === "published")
    return "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300";
  if (status === "started")
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300";
  if (status === "ended")
    return "bg-amber-500/10 text-amber-800 border-amber-500/30 dark:text-amber-200";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

export function defaultWorkspaceDetails(): WorkspaceDetailsDraft {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    name: "",
    organization: "",
    targetRole: "",
    responsibilities: "",
    startAt: toDateTimeLocal(start),
    endAt: toDateTimeLocal(end),
    totalRounds: "1",
    accessMode: "public",
  };
}

export function detailsFromWorkspace(
  workspace: Workspace,
): WorkspaceDetailsDraft {
  return {
    name: workspace.name,
    organization: workspace.organization,
    targetRole: workspace.targetRole,
    responsibilities: (workspace.hiringRubric?.responsibilities ?? []).join(
      "\n",
    ),
    startAt: toDateTimeLocal(workspace.startAt),
    endAt: toDateTimeLocal(workspace.endAt),
    totalRounds: String(workspace.totalRounds),
    accessMode: workspace.accessMode,
  };
}

export function parseIntegerDraft(
  value: string,
  min: number,
  max: number,
): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function defaultRound(order: number): WorkspaceRoundDraft {
  return {
    order,
    name: `Round ${order}`,
    type: "mcq",
    questionType: "random",
    questionCount: "20",
    timeLimitMins: "30",
    scoreWeightage: "100",
    easyCount: "8",
    mediumCount: "8",
    hardCount: "4",
  };
}

function roundToDraft(
  round: WorkspaceRound | WorkspaceRoundDraft,
): WorkspaceRoundDraft {
  return {
    ...round,
    questionCount: String(round.questionCount),
    timeLimitMins: String(round.timeLimitMins),
    scoreWeightage: String(round.scoreWeightage),
    easyCount: String(round.easyCount),
    mediumCount: String(round.mediumCount),
    hardCount: String(round.hardCount),
  };
}

export function normalizeRounds(
  rounds: Array<WorkspaceRound | WorkspaceRoundDraft> | undefined,
  totalRounds: number,
): WorkspaceRoundDraft[] {
  const byOrder = new Map(
    (rounds ?? []).map((round) => [round.order, roundToDraft(round)]),
  );
  return Array.from({ length: totalRounds }, (_, index) => {
    const order = index + 1;
    return (
      byOrder.get(order) ?? {
        ...defaultRound(order),
        scoreWeightage: String(
          Math.floor(100 / totalRounds) + (order <= 100 % totalRounds ? 1 : 0),
        ),
      }
    );
  });
}

export function workspaceDetailsToPayload(details: WorkspaceDetailsDraft) {
  const totalRounds = parseIntegerDraft(details.totalRounds, 1, 5);
  if (totalRounds == null) return null;
  return {
    name: details.name.trim(),
    organization: details.organization.trim(),
    targetRole: details.targetRole.trim(),
    responsibilities: details.responsibilities
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    startAt: fromDateTimeLocal(details.startAt),
    endAt: fromDateTimeLocal(details.endAt),
    totalRounds,
    accessMode: details.accessMode,
  };
}

export function roundsToPayload(
  rounds: WorkspaceRoundDraft[],
): WorkspaceRound[] | null {
  const mapped: WorkspaceRound[] = [];
  for (const round of rounds) {
    const questionCount = parseIntegerDraft(round.questionCount, 1, 200);
    const timeLimitMins = parseIntegerDraft(round.timeLimitMins, 1, 480);
    const scoreWeightage = parseIntegerDraft(round.scoreWeightage, 1, 100);
    const easyCount = parseIntegerDraft(round.easyCount, 0, 200);
    const mediumCount = parseIntegerDraft(round.mediumCount, 0, 200);
    const hardCount = parseIntegerDraft(round.hardCount, 0, 200);
    if (
      questionCount == null ||
      timeLimitMins == null ||
      scoreWeightage == null ||
      easyCount == null ||
      mediumCount == null ||
      hardCount == null
    ) {
      return null;
    }
    mapped.push({
      ...round,
      questionCount,
      timeLimitMins,
      scoreWeightage,
      easyCount,
      mediumCount,
      hardCount,
    });
  }
  return mapped;
}

export function validateWorkspaceDetails(
  details: WorkspaceDetailsDraft,
): string | null {
  if (!details.name.trim()) return "Workspace name is required.";
  if (!details.organization.trim()) return "Organization is required.";
  if (!details.targetRole.trim()) return "Employer target role is required.";
  const responsibilities = details.responsibilities
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (responsibilities.length < 3) {
    return "Add at least three employer-approved role responsibilities.";
  }
  if (!details.startAt || !details.endAt)
    return "Start and end time are required.";
  if (
    new Date(details.startAt).getTime() >= new Date(details.endAt).getTime()
  ) {
    return "Workspace start time must be before end time.";
  }
  if (parseIntegerDraft(details.totalRounds, 1, 5) == null) {
    return "Total rounds must be between 1 and 5.";
  }
  return null;
}

export function validateRounds(
  rounds: WorkspaceRoundDraft[],
  totalRounds: number,
): string | null {
  if (rounds.length !== totalRounds)
    return `Configure exactly ${totalRounds} round${totalRounds === 1 ? "" : "s"}.`;
  const payload = roundsToPayload(rounds);
  if (!payload) return "Round numeric fields must be valid whole numbers.";
  const weightTotal = payload.reduce(
    (sum, round) => sum + round.scoreWeightage,
    0,
  );
  if (weightTotal !== 100) return "Round score weightage must total 100.";
  for (const round of payload) {
    if (!round.name.trim()) return `Round ${round.order} needs a name.`;
    if (round.questionCount < 1)
      return `Round ${round.order} needs at least 1 question.`;
    if (round.timeLimitMins < 1)
      return `Round ${round.order} needs a positive time limit.`;
    const difficultyTotal =
      round.easyCount + round.mediumCount + round.hardCount;
    if (difficultyTotal !== round.questionCount) {
      return `Difficulty counts must add up to question count for round ${round.order}.`;
    }
  }
  return null;
}

export function canArchive(
  workspace?: Pick<Workspace, "status"> | null,
): boolean {
  return !!workspace && ["published", "ended"].includes(workspace.status);
}

export function canStart(
  workspace?: Pick<Workspace, "status"> | null,
): boolean {
  return !!workspace && workspace.status === "published";
}

export function canDelete(
  workspace?: Pick<Workspace, "status"> | null,
): boolean {
  return !!workspace && workspace.status === "draft";
}

export function canEnd(
  workspace?: Pick<Workspace, "status"> | null,
): boolean {
  return !!workspace && workspace.status === "started";
}

export function canEditDraft(
  workspace?: Pick<Workspace, "status"> | null,
): boolean {
  return !!workspace && workspace.status === "draft";
}
