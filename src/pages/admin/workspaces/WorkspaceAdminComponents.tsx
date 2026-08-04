import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import WorkspaceConfirmDialog from "@/components/WorkspaceConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Copy,
  Crown,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Square,
  Trash2,
  UserPlus,
  Upload,
  Users,
} from "lucide-react";
import type {
  AllowlistImportSummary,
  SqlTaskAvailability,
  Workspace,
  WorkspaceCandidateDossier,
  WorkspaceDetailsDraft,
  WorkspaceLeaderboardResponse,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceMemberRole,
  WorkspaceRegistration,
  WorkspaceRound,
  WorkspaceRoundDraft,
  WorkspaceRoundType,
} from "./types";
import {
  formatDateTime,
  parseIntegerDraft,
  roundsToPayload,
  statusBadgeClass,
  statusLabel,
  validateRounds,
  validateWorkspaceDetails,
} from "./workspaceUtils";

type WorkspaceDetailsStepProps = {
  value: WorkspaceDetailsDraft;
  onChange: (value: WorkspaceDetailsDraft) => void;
  onSave: () => void;
  saving: boolean;
  locked?: boolean;
  workspaceCode?: string | null;
};

export function WorkspaceDetailsStep({
  value,
  onChange,
  onSave,
  saving,
  locked,
  workspaceCode,
}: WorkspaceDetailsStepProps) {
  const validation = validateWorkspaceDetails(value);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Assessment details
            </CardTitle>
            <CardDescription>
              Set the role, schedule, and candidate access. An invitation code
              is created automatically.
            </CardDescription>
          </div>
          {workspaceCode && (
            <Badge variant="outline" className="w-fit font-mono">
              {workspaceCode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Assessment name</Label>
            <Input
              id="workspace-name"
              value={value.name}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...value, name: event.target.value })
              }
              placeholder="Campus Hiring Challenge"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-org">Organization</Label>
            <Input
              id="workspace-org"
              value={value.organization}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...value, organization: event.target.value })
              }
              placeholder="Acme University"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspace-target-role">Employer target role</Label>
          <Input
            id="workspace-target-role"
            value={value.targetRole}
            disabled={locked}
            onChange={(event) =>
              onChange({ ...value, targetRole: event.target.value })
            }
            placeholder="Senior Backend Engineer"
          />
          <p className="text-xs text-muted-foreground">
            Reports and recommendations will be evaluated against this role.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspace-responsibilities">
            Role responsibilities
          </Label>
          <Textarea
            id="workspace-responsibilities"
            value={value.responsibilities}
            disabled={locked}
            onChange={(event) =>
              onChange({ ...value, responsibilities: event.target.value })
            }
            rows={6}
            placeholder={
              "One responsibility per line\nOwn reliable backend services\nDebug production incidents\nDesign observable APIs"
            }
          />
          <p className="text-xs text-muted-foreground">
            Add 3–12 concrete responsibilities, one per line. These become the
            criteria reviewers use when making a decision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-start">Start date and time</Label>
            <Input
              id="workspace-start"
              type="datetime-local"
              value={value.startAt}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...value, startAt: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-end">End date and time</Label>
            <Input
              id="workspace-end"
              type="datetime-local"
              value={value.endAt}
              disabled={locked}
              onChange={(event) =>
                onChange({ ...value, endAt: event.target.value })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-rounds">Total rounds</Label>
            <Input
              id="workspace-rounds"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={value.totalRounds}
              disabled={locked}
              onChange={(event) =>
                onChange({
                  ...value,
                  totalRounds: event.target.value.replace(/\D/g, ""),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Access mode</Label>
            <Select
              value={value.accessMode}
              disabled={locked}
              onValueChange={(
                accessMode: WorkspaceDetailsDraft["accessMode"],
              ) => onChange({ ...value, accessMode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="invite_only">Invite-only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {validation && <p className="text-sm text-destructive">{validation}</p>}
        {locked && (
          <p className="text-sm text-muted-foreground">
            Published assessment details cannot be edited.
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving || !!validation || locked}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save & Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type RoundConfigStepProps = {
  rounds: WorkspaceRoundDraft[];
  totalRounds: number;
  onChange: (rounds: WorkspaceRoundDraft[]) => void;
  onSave: () => void;
  saving: boolean;
  locked?: boolean;
};

export function RoundConfigStep({
  rounds,
  totalRounds,
  onChange,
  onSave,
  saving,
  locked,
}: RoundConfigStepProps) {
  const [activeOrder, setActiveOrder] = useState(1);
  const [sqlAvailability, setSqlAvailability] =
    useState<SqlTaskAvailability | null>(null);
  const [sqlAvailabilityError, setSqlAvailabilityError] = useState(false);
  const active =
    rounds.find((round) => round.order === activeOrder) ?? rounds[0];
  const validation = validateRounds(rounds, totalRounds);
  const weightTotal = rounds.reduce(
    (sum, round) =>
      sum + (parseIntegerDraft(round.scoreWeightage, 0, 100) ?? 0),
    0,
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ availability: SqlTaskAvailability }>(
        "/api/workspaces/question-bank/sql",
      )
      .then((res) => {
        if (!cancelled) setSqlAvailability(res.availability);
      })
      .catch(() => {
        if (!cancelled) setSqlAvailabilityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRound = (patch: Partial<WorkspaceRoundDraft>) => {
    if (!active) return;
    onChange(
      rounds.map((round) =>
        round.order === active.order ? { ...round, ...patch } : round,
      ),
    );
  };

  const activeSqlShortage =
    active && active.type === "sql" && sqlAvailability
      ? {
          Easy: Math.max(
            0,
            (parseIntegerDraft(active.easyCount, 0, 200) ?? 0) -
              sqlAvailability.byDifficulty.Easy,
          ),
          Medium: Math.max(
            0,
            (parseIntegerDraft(active.mediumCount, 0, 200) ?? 0) -
              sqlAvailability.byDifficulty.Medium,
          ),
          Hard: Math.max(
            0,
            (parseIntegerDraft(active.hardCount, 0, 200) ?? 0) -
              sqlAvailability.byDifficulty.Hard,
          ),
        }
      : null;
  const hasActiveSqlShortage =
    !!activeSqlShortage &&
    Object.values(activeSqlShortage).some((count) => count > 0);
  const saveDisabled = saving || !!validation || locked || hasActiveSqlShortage;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Configure Rounds
            </CardTitle>
            <CardDescription>
              Set timing, scoring, question selection, and difficulty mix for
              every round.
            </CardDescription>
          </div>
          <Badge
            variant={weightTotal === 100 ? "default" : "destructive"}
            className="w-fit"
          >
            Weightage {weightTotal}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-5">
          <div className="space-y-2">
            {rounds.map((round) => {
              const veryEasyCount =
                round.type === "coding"
                  ? (parseIntegerDraft(round.veryEasyCount, 0, 200) ?? 0)
                  : 0;
              const easyCount = parseIntegerDraft(round.easyCount, 0, 200) ?? 0;
              const mediumCount =
                parseIntegerDraft(round.mediumCount, 0, 200) ?? 0;
              const hardCount = parseIntegerDraft(round.hardCount, 0, 200) ?? 0;
              const questionCount =
                parseIntegerDraft(round.questionCount, 1, 200) ?? -1;
              const scoreWeightage =
                parseIntegerDraft(round.scoreWeightage, 1, 100) ?? 0;
              const difficultyTotal =
                veryEasyCount + easyCount + mediumCount + hardCount;
              const valid =
                round.name.trim() &&
                difficultyTotal === questionCount &&
                scoreWeightage > 0;
              return (
                <button
                  key={round.order}
                  type="button"
                  onClick={() => setActiveOrder(round.order)}
                  className={
                    "w-full rounded-md border px-3 py-3 text-left text-sm transition " +
                    (activeOrder === round.order
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Round {round.order}</span>
                    {valid && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {round.name || "Untitled round"}
                  </div>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Round name</Label>
                  <Input
                    value={active.name}
                    disabled={locked}
                    onChange={(event) =>
                      updateRound({ name: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Round type</Label>
                  <Select
                    value={active.type}
                    disabled={locked}
                    onValueChange={(type: WorkspaceRoundType) =>
                      updateRound({ type })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">MCQ</SelectItem>
                      <SelectItem value="coding">Coding</SelectItem>
                      <SelectItem value="sql">SQL</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Question type</Label>
                  <Select
                    value={active.questionType ?? "random"}
                    disabled={locked || active.type !== "mcq"}
                    onValueChange={(questionType: "random" | "fixed") =>
                      updateRound({ questionType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">Random</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Questions"
                  value={active.questionCount}
                  disabled={locked}
                  min={1}
                  max={200}
                  onChange={(questionCount) => updateRound({ questionCount })}
                />
                <NumberField
                  label="Minutes"
                  value={active.timeLimitMins}
                  disabled={locked}
                  min={1}
                  max={480}
                  onChange={(timeLimitMins) => updateRound({ timeLimitMins })}
                />
                <NumberField
                  label="Weightage"
                  value={active.scoreWeightage}
                  disabled={locked}
                  min={1}
                  max={100}
                  onChange={(scoreWeightage) => updateRound({ scoreWeightage })}
                />
              </div>

              <div>
                <Label>Difficulty split</Label>
                <div
                  className={`grid grid-cols-1 gap-4 mt-2 ${
                    active.type === "coding" ? "md:grid-cols-4" : "md:grid-cols-3"
                  }`}
                >
                  {/* Only the DSA bank carries a "Very Easy" tier. */}
                  {active.type === "coding" && (
                    <NumberField
                      label="Very Easy"
                      value={active.veryEasyCount}
                      disabled={locked}
                      min={0}
                      max={200}
                      onChange={(veryEasyCount) => updateRound({ veryEasyCount })}
                    />
                  )}
                  <NumberField
                    label="Easy"
                    value={active.easyCount}
                    disabled={locked}
                    min={0}
                    max={200}
                    onChange={(easyCount) => updateRound({ easyCount })}
                  />
                  <NumberField
                    label="Medium"
                    value={active.mediumCount}
                    disabled={locked}
                    min={0}
                    max={200}
                    onChange={(mediumCount) => updateRound({ mediumCount })}
                  />
                  <NumberField
                    label="Hard"
                    value={active.hardCount}
                    disabled={locked}
                    min={0}
                    max={200}
                    onChange={(hardCount) => updateRound({ hardCount })}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current total:{" "}
                  {(active.type === "coding"
                    ? (parseIntegerDraft(active.veryEasyCount, 0, 200) ?? 0)
                    : 0) +
                    (parseIntegerDraft(active.easyCount, 0, 200) ?? 0) +
                    (parseIntegerDraft(active.mediumCount, 0, 200) ?? 0) +
                    (parseIntegerDraft(active.hardCount, 0, 200) ?? 0)}
                  /{active.questionCount || 0}
                </p>
              </div>

              {active.type === "sql" && (
                <div className="rounded-md border border-[var(--dash-navy-border)] bg-white/[0.03] px-3 py-2 text-sm">
                  <div className="font-medium text-[var(--dash-text-primary)]">
                    SQL bank: E {sqlAvailability?.byDifficulty.Easy ?? "-"} / M{" "}
                    {sqlAvailability?.byDifficulty.Medium ?? "-"} / H{" "}
                    {sqlAvailability?.byDifficulty.Hard ?? "-"} eligible
                  </div>
                  {hasActiveSqlShortage && activeSqlShortage ? (
                    <div className="mt-1 text-destructive">
                      Not enough eligible SQL tasks: E {activeSqlShortage.Easy},
                      M {activeSqlShortage.Medium}, H {activeSqlShortage.Hard}{" "}
                      short.
                    </div>
                  ) : null}
                  {sqlAvailability?.missingHiddenTests ? (
                    <div className="mt-1 text-amber-500">
                      {sqlAvailability.missingHiddenTests} visible SQL task
                      {sqlAvailability.missingHiddenTests === 1
                        ? " is"
                        : "s are"}{" "}
                      excluded until hidden tests are added.
                    </div>
                  ) : null}
                  {sqlAvailability?.belowRecommendedCoverage ? (
                    <div className="mt-1 text-amber-500">
                      {sqlAvailability.belowRecommendedCoverage} eligible SQL
                      task{sqlAvailability.belowRecommendedCoverage === 1 ? " has" : "s have"}{" "}
                      fewer than six judge cases. Candidate reports will label
                      those results as limited evidence.
                    </div>
                  ) : null}
                  {sqlAvailabilityError ? (
                    <div className="mt-1 text-muted-foreground">
                      Could not load SQL bank counts.
                    </div>
                  ) : null}
                </div>
              )}

              {validation && (
                <p className="text-sm text-destructive">{validation}</p>
              )}
              {locked && (
                <p className="text-sm text-muted-foreground">
                  Published assessment rounds cannot be edited.
                </p>
              )}

              <div className="flex justify-end">
                <Button onClick={onSave} disabled={saveDisabled}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Round Config
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}

type WorkspaceReviewStepProps = {
  workspace: Workspace;
  details: WorkspaceDetailsDraft;
  rounds: WorkspaceRoundDraft[];
  publishing: boolean;
  onPublish: () => void;
  onBackToRounds: () => void;
};

export function WorkspaceReviewStep({
  workspace,
  details,
  rounds,
  publishing,
  onPublish,
  onBackToRounds,
}: WorkspaceReviewStepProps) {
  const detailsError = validateWorkspaceDetails(details);
  const totalRounds = parseIntegerDraft(details.totalRounds, 1, 5) ?? 0;
  const payloadRounds = roundsToPayload(rounds);
  const roundsError = validateRounds(rounds, totalRounds);
  const checks = [
    { label: "Assessment details saved", ok: !detailsError },
    {
      label: "Role criteria configured",
      ok:
        !!workspace.targetRole &&
        (workspace.hiringRubric?.responsibilities?.length ?? 0) >= 3,
    },
    { label: "All rounds configured", ok: !roundsError },
    {
      label: "Round weights total 100%",
      ok:
        (payloadRounds ?? []).reduce(
          (sum, round) => sum + round.scoreWeightage,
          0,
        ) === 100,
    },
    {
      label: "Question mix matches each round total",
      ok:
        !!payloadRounds &&
        payloadRounds.every(
          (round) =>
            (round.veryEasyCount ?? 0) +
              round.easyCount +
              round.mediumCount +
              round.hardCount ===
            round.questionCount,
        ),
    },
  ];
  const ready = checks.every((check) => check.ok);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            Review assessment
          </CardTitle>
          <CardDescription>
            Confirm what candidates will receive before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <SummaryItem label="Name" value={workspace.name} />
            <SummaryItem label="Organization" value={workspace.organization} />
            <SummaryItem label="Target role" value={workspace.targetRole} />
            <SummaryItem label="Invitation code" value={workspace.code} mono />
            <SummaryItem
              label="Access mode"
              value={
                workspace.accessMode === "invite_only"
                  ? "Invite-only"
                  : "Public"
              }
            />
            <SummaryItem
              label="Starts"
              value={formatDateTime(workspace.startAt)}
            />
            <SummaryItem label="Ends" value={formatDateTime(workspace.endAt)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <CheckCircle2
                  className={`h-4 w-4 ${check.ok ? "text-emerald-600" : "text-muted-foreground"}`}
                />
                <span>{check.label}</span>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Difficulty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round) => (
                  <TableRow key={round.order}>
                    <TableCell className="font-medium">{round.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{round.type}</Badge>
                    </TableCell>
                    <TableCell>{round.questionCount}</TableCell>
                    <TableCell>{round.timeLimitMins} min</TableCell>
                    <TableCell>{round.scoreWeightage}%</TableCell>
                    <TableCell>
                      {round.veryEasyCount ? `VE${round.veryEasyCount} / ` : ""}
                      E{round.easyCount} / M{round.mediumCount} / H
                      {round.hardCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {workspace.accessMode === "invite_only" && (
            <AllowedEmailsUploader workspaceId={workspace.id} workspaceCode={workspace.code} />
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button variant="outline" onClick={onBackToRounds}>
              Back to rounds
            </Button>
            <Button onClick={onPublish} disabled={publishing || !ready}>
              {publishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Publish assessment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-medium break-words ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

export function AllowedEmailsUploader({
  workspaceId,
  workspaceCode,
  readonly = false,
}: {
  workspaceId: string;
  workspaceCode: string;
  readonly?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [summary, setSummary] = useState<AllowlistImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadInvitations = useCallback(async () => {
    try {
      const response = await api.get<{ invitations: WorkspaceInvitation[] }>(
        `/api/workspaces/${workspaceId}/allowed-emails`,
      );
      setInvitations(response.invitations ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load invitations");
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const invite = async () => {
    const emails = emailDraft
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);
    if (!emails.length) return;
    setInviting(true);
    try {
      const response = await api.post<{ invitations: WorkspaceInvitation[]; added: number }>(
        `/api/workspaces/${workspaceId}/allowed-emails`,
        { emails },
      );
      setInvitations(response.invitations);
      setEmailDraft("");
      toast.success(`${response.added} invitation${response.added === 1 ? "" : "s"} added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add invitations");
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (invitation: WorkspaceInvitation) => {
    try {
      await api.del(`/api/workspaces/${workspaceId}/allowed-emails/${invitation.id}`);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      toast.success(`Invitation revoked for ${invitation.email}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke invitation");
    }
  };

  const upload = async (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Upload a CSV file.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("workspaceCode", workspaceCode);
      form.append("file", file);
      const res = await api.post<{ summary: AllowlistImportSummary }>(
        "/api/workspaces/allowed-emails/import",
        form,
      );
      setSummary(res.summary);
      await loadInvitations();
      toast.success("Candidate emails imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV import failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Candidate invitations
        </CardTitle>
        <CardDescription>
          Add the email addresses that may join this assessment, or upload a CSV
          with an email column.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={emailDraft}
            onChange={(event) => setEmailDraft(event.target.value)}
            placeholder="candidate@example.com, second@example.com"
            disabled={readonly || inviting}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void invite();
              }
            }}
          />
          <Button type="button" onClick={() => void invite()} disabled={readonly || inviting || !emailDraft.trim()}>
            {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add invitation
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => upload(event.target.files?.[0])}
            disabled={readonly || uploading}
          />
          <Button
            type="button"
            variant="outline"
            disabled={readonly || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload CSV
          </Button>
        </div>
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <SummaryMini label="Parsed" value={summary.parsed} />
            <SummaryMini label="Inserted" value={summary.inserted} />
            <SummaryMini label="Existing" value={summary.alreadyPresent} />
            <SummaryMini label="Duplicates" value={summary.duplicatesInFile} />
            <SummaryMini label="Invalid" value={summary.invalid} />
          </div>
        )}
        <div className="rounded-lg border">
          {invitations.length ? (
            <div className="divide-y">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDateTime(invitation.createdAt)}
                      {invitation.deliveryStatus === "failed" && invitation.deliveryError
                        ? ` — ${invitation.deliveryError}`
                        : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <InvitationDeliveryBadge invitation={invitation} />
                    <Button type="button" size="sm" variant="ghost" disabled={readonly} onClick={() => void revoke(invitation)} aria-label={`Revoke invitation for ${invitation.email}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No invitation emails yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InvitationDeliveryBadge({ invitation }: { invitation: WorkspaceInvitation }) {
  switch (invitation.deliveryStatus) {
    case "accepted":
      return <Badge variant="default">Joined</Badge>;
    case "sent":
      return <Badge variant="outline">Sent</Badge>;
    case "failed":
      return <Badge variant="destructive">Delivery failed</Badge>;
    case "pending":
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

const MEMBER_ROLE_ICON: Record<WorkspaceMemberRole, typeof Crown> = {
  owner: Crown,
  manager: Shield,
  reviewer: Eye,
};

const MEMBER_ROLE_LABEL: Record<WorkspaceMemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  reviewer: "Reviewer (read-only)",
};

export function WorkspaceMembersManager({
  workspaceId,
  currentUserId,
  readonly = false,
}: {
  workspaceId: string;
  currentUserId?: string | null;
  readonly?: boolean;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>("manager");
  const [submitting, setSubmitting] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const response = await api.get<{ members: WorkspaceMember[] }>(
        `/api/workspaces/${workspaceId}/members`,
      );
      setMembers(response.members ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load workspace members");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const viewerIsOwner = useMemo(
    () => members.some((member) => member.userId === currentUserId && member.role === "owner"),
    [members, currentUserId],
  );

  const addMember = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setSubmitting(true);
    try {
      const response = await api.post<{ members: WorkspaceMember[] }>(
        `/api/workspaces/${workspaceId}/members`,
        { email, role: inviteRole },
      );
      setMembers(response.members);
      setInviteEmail("");
      toast.success(`${email} added as ${MEMBER_ROLE_LABEL[inviteRole].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add member");
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (member: WorkspaceMember) => {
    try {
      const response = await api.del<{ members: WorkspaceMember[] }>(
        `/api/workspaces/${workspaceId}/members/${member.userId}`,
      );
      setMembers(response.members);
      toast.success(`${member.email} removed from this workspace.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove member");
    }
  };

  const transferOwnership = async (member: WorkspaceMember) => {
    try {
      const response = await api.post<{ members: WorkspaceMember[] }>(
        `/api/workspaces/${workspaceId}/transfer-ownership`,
        { newOwnerUserId: member.userId },
      );
      setMembers(response.members);
      toast.success(`Ownership transferred to ${member.email}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not transfer ownership");
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Workspace members
        </CardTitle>
        <CardDescription>
          Recruiters or admins with access to manage this workspace. Reviewers can
          view candidates and reports but cannot make changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {!readonly && viewerIsOwner && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="recruiter@example.com"
              disabled={submitting}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addMember();
                }
              }}
            />
            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceMemberRole)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" onClick={() => void addMember()} disabled={submitting || !inviteEmail.trim()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Add member
            </Button>
          </div>
        )}
        <div className="rounded-lg border">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading members…</p>
          ) : members.length ? (
            <div className="divide-y">
              {members.map((member) => {
                const RoleIcon = MEMBER_ROLE_ICON[member.role];
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <RoleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.name || member.email}
                          {member.userId === currentUserId ? " (you)" : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === "owner" ? "default" : "outline"}>
                        {MEMBER_ROLE_LABEL[member.role]}
                      </Badge>
                      {!readonly && viewerIsOwner && !member.isPrimaryOwner && (
                        <>
                          {member.role !== "owner" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void transferOwnership(member)}
                              aria-label={`Make ${member.email} the owner`}
                            >
                              Make owner
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeMember(member)}
                            aria-label={`Remove ${member.email}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No members yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

type WorkspaceRegistrationsPreview = {
  registrations: WorkspaceRegistration[];
  dossiers: Record<string, WorkspaceCandidateDossier>;
};

export function WorkspaceRegistrationsTable({
  workspaceId,
  readonly,
  preview,
}: {
  workspaceId: string;
  readonly?: boolean;
  preview?: WorkspaceRegistrationsPreview;
}) {
  const [registrations, setRegistrations] = useState<WorkspaceRegistration[]>(
    preview?.registrations ?? [],
  );
  const [loading, setLoading] = useState(!preview);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<WorkspaceCandidateDossier | null>(
    null,
  );
  const [dossierLoadingUserId, setDossierLoadingUserId] = useState<
    string | null
  >(null);
  const [pendingRemoval, setPendingRemoval] = useState<WorkspaceRegistration | null>(null);

  const fetchRegistrations = useCallback(async () => {
    if (preview) {
      setRegistrations(preview.registrations);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ registrations: WorkspaceRegistration[] }>(
        `/api/workspaces/${workspaceId}/registrations`,
      );
      setRegistrations(res.registrations ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load registrations",
      );
    } finally {
      setLoading(false);
    }
  }, [preview, workspaceId]);

  const openDossier = async (userId: string) => {
    if (preview) {
      setDossier(preview.dossiers[userId] ?? null);
      return;
    }
    setDossierLoadingUserId(userId);
    try {
      const res = await api.get<{ dossier: WorkspaceCandidateDossier }>(
        `/api/workspaces/${workspaceId}/registrations/${userId}/dossier`,
      );
      setDossier(res.dossier);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load candidate dossier",
      );
    } finally {
      setDossierLoadingUserId(null);
    }
  };

  useEffect(() => {
    void fetchRegistrations();
  }, [fetchRegistrations]);

  const updateStatus = async (userId: string, action: "remove" | "restore") => {
    setBusyUserId(userId);
    try {
      if (action === "remove") {
        await api.del(`/api/workspaces/${workspaceId}/registrations/${userId}`);
        toast.success("Candidate removed from this assessment.");
        setPendingRemoval(null);
      } else {
        await api.post(
          `/api/workspaces/${workspaceId}/registrations/${userId}/restore`,
          {},
        );
        toast.success("User restored.");
      }
      await fetchRegistrations();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Registration update failed",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Candidates
            </CardTitle>
            <CardDescription>
              People who joined this assessment, including removed candidates.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRegistrations}
            disabled={loading || Boolean(preview)}
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            Loading candidates…
          </div>
        ) : registrations.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No candidates have joined yet.
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {registrations.map((registration) => {
              const name =
                registration.user?.jobSeekerProfile?.fullName ||
                registration.user?.name ||
                "Candidate";
              return (
                <div key={registration.id} className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{name}</p>
                      <p className="mt-1 break-all text-sm text-muted-foreground">
                        {registration.user?.email ?? "Email unavailable"}
                      </p>
                    </div>
                    <Badge variant={registration.status === "registered" ? "default" : "destructive"}>
                      {registration.status === "registered" ? "Active" : "Removed"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Joined {formatDateTime(registration.registeredAt)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button asChild size="sm" className="col-span-2">
                      <Link
                        to={
                          workspaceId === "local-preview-workspace"
                            ? `/local-preview/workspace/candidates/${registration.userId}/reports`
                            : `/admin/workspaces/${workspaceId}/candidates/${registration.userId}/reports`
                        }
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View results
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dossierLoadingUserId === registration.userId}
                      onClick={() => openDossier(registration.userId)}
                    >
                      Summary
                    </Button>
                    {registration.status === "registered" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={readonly || busyUserId === registration.userId}
                        onClick={() => setPendingRemoval(registration)}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={readonly || busyUserId === registration.userId}
                        onClick={() => updateStatus(registration.userId, "restore")}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((registration) => {
                  const name =
                    registration.user?.jobSeekerProfile?.fullName ||
                    registration.user?.name ||
                    "Candidate";
                  return (
                    <TableRow key={registration.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{registration.user?.email ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            registration.status === "registered"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {registration.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(registration.registeredAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="default" size="sm">
                            <Link
                              to={
                                workspaceId === "local-preview-workspace"
                                  ? `/local-preview/workspace/candidates/${registration.userId}/reports`
                                  : `/admin/workspaces/${workspaceId}/candidates/${registration.userId}/reports`
                              }
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              View results
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              dossierLoadingUserId === registration.userId
                            }
                            onClick={() => openDossier(registration.userId)}
                          >
                            {dossierLoadingUserId === registration.userId ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4 mr-2" />
                            )}
                            Summary
                          </Button>
                          {registration.status === "registered" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                readonly || busyUserId === registration.userId
                              }
                              onClick={() => setPendingRemoval(registration)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                readonly || busyUserId === registration.userId
                              }
                              onClick={() =>
                                updateStatus(registration.userId, "restore")
                              }
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
      <CandidateDossierDialog
        dossier={dossier}
        onOpenChange={(open) => {
          if (!open) setDossier(null);
        }}
      />
      <WorkspaceConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove this candidate?"
        description="The candidate will lose access to this assessment. Existing results will be preserved, and you can restore access later."
        confirmLabel="Remove candidate"
        cancelLabel="Keep candidate"
        variant="destructive"
        loading={Boolean(
          pendingRemoval && busyUserId === pendingRemoval.userId,
        )}
        onOpenChange={(open) => {
          if (!open && !busyUserId) setPendingRemoval(null);
        }}
        onConfirm={() => {
          if (pendingRemoval) {
            void updateStatus(pendingRemoval.userId, "remove");
          }
        }}
      />
    </Card>
  );
}

function CandidateDossierDialog({
  dossier,
  onOpenChange,
}: {
  dossier: WorkspaceCandidateDossier | null;
  onOpenChange: (open: boolean) => void;
}) {
  const report = dossier?.modules.antigravity.latest?.report ?? {};
  const summary = String(
    report.recruiter_summary ||
      report.summary ||
      "AI interview feedback is not available yet.",
  );
  const strengths = Array.isArray(report.strengths)
    ? report.strengths.map(String)
    : [];
  const risks = Array.isArray(report.risk_flags)
    ? report.risk_flags.map(String)
    : [];
  const latestAg = dossier?.modules.antigravity.latest;
  return (
    <Dialog open={Boolean(dossier)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dossier?.candidate.jobSeekerProfile?.fullName ||
              dossier?.candidate.name ||
              "Candidate"}{" "}
            · candidate summary
          </DialogTitle>
          <DialogDescription>
            Aptitude, coding, SQL, and AI interview results in one place.
          </DialogDescription>
        </DialogHeader>
        {dossier ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <ReportMetric
                label="Aptitude"
                value={
                  dossier.modules.aptitude.latest?.score ?? "Not completed"
                }
                detail={
                  dossier.modules.aptitude.latest
                    ? formatDateTime(
                        dossier.modules.aptitude.latest.completedAt,
                      )
                    : "Not completed"
                }
              />
              <ReportMetric
                label="DSA"
                value={dossier.modules.dsa.latest?.score ?? "Not completed"}
                detail={
                  dossier.modules.dsa.latest
                    ? formatDateTime(dossier.modules.dsa.latest.completedAt)
                    : "Not completed"
                }
              />
              <ReportMetric
                label="AI interview"
                value={latestAg?.overallScore ?? "Not completed"}
                detail={
                  latestAg
                    ? `${latestAg.hireRecommendation || "Recommendation pending"} · ${latestAg._count.telemetryEvents} integrity events`
                    : "Feedback pending"
                }
              />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Round progress
                </CardTitle>
                <CardDescription>
                  Completion status and scores for each configured round.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dossier.registration.roundAttempts.length ? (
                  dossier.registration.roundAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <span className="font-medium">
                        {attempt.workspaceRound.order}.{" "}
                        {attempt.workspaceRound.name}
                      </span>
                      <span>
                        {attempt.percentageScore ?? attempt.score ?? "Pending"}{" "}
                        · {attempt.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No rounds attempted yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  AI interview feedback
                </CardTitle>
                <CardDescription>
                  {latestAg
                    ? `Received ${formatDateTime(latestAg.receivedAt)}`
                    : "Feedback is still being prepared"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6">{summary}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <EvidenceList
                    title="Verified strengths"
                    items={strengths}
                    empty="No verified strengths recorded."
                  />
                  <EvidenceList
                    title="Scoped risks"
                    items={risks}
                    empty="No scoped risks recorded."
                  />
                </div>
                {latestAg ? (
                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <ReportMetric
                      label="Confidence"
                      value={latestAg.confidenceScore ?? "—"}
                      detail="Confidence in the evaluation"
                    />
                    <ReportMetric
                      label="Evidence turns"
                      value={
                        Array.isArray(latestAg.transcript)
                          ? latestAg.transcript.length
                          : 0
                      }
                      detail="Questions with recorded evidence"
                    />
                    <ReportMetric
                      label="Received"
                      value={formatDateTime(latestAg.receivedAt)}
                      detail="When feedback became available"
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReportMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function EvidenceList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <h4 className="font-medium">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {items.slice(0, 8).map((item, index) => (
            <li key={`${index}-${item}`} className="leading-5">
              • {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function WorkspaceLeaderboardPreview({
  workspaceCode,
}: {
  workspaceCode: string;
}) {
  const [rows, setRows] = useState<WorkspaceLeaderboardResponse["leaderboard"]>(
    [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "10" });
      if (cursor) qs.set("cursor", cursor);
      const res = await api.get<WorkspaceLeaderboardResponse>(
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
      setLoadingMore(false);
    }
  }, [workspaceCode]);

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Leaderboard Preview
        </CardTitle>
        <CardDescription>
          Preview the ranking candidates can see for this assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            Loading leaderboard...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No completed round scores yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Last completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.rank}-${row.userId}`}>
                      <TableCell className="font-mono">#{row.rank}</TableCell>
                      <TableCell className="font-medium">
                        {row.name || "Candidate"}
                      </TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.totalScore}</TableCell>
                      <TableCell>{row.completedRounds}</TableCell>
                      <TableCell>
                        {formatDateTime(row.lastCompletedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextCursor && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchPage(nextCursor)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4 mr-2" />
                  )}
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkspaceOverviewCard({ workspace }: { workspace: Workspace }) {
  const roundCount = workspace.rounds?.length ?? workspace._count?.rounds ?? 0;
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">
              {workspace.name}
            </CardTitle>
            <CardDescription>{workspace.organization}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={statusBadgeClass(workspace.status)}
          >
            {statusLabel(workspace.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryItem label="Invitation code" value={workspace.code} mono />
          <SummaryItem
            label="Access"
            value={
              workspace.accessMode === "invite_only" ? "Invite-only" : "Public"
            }
          />
          <SummaryItem label="Rounds" value={String(roundCount)} />
          <SummaryItem
            label="Window"
            value={`${formatDateTime(workspace.startAt)} - ${formatDateTime(workspace.endAt)}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkspaceRoundsTable({ rounds }: { rounds: WorkspaceRound[] }) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Rounds
        </CardTitle>
        <CardDescription>
          The published order, format, duration, and scoring weight for each round.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Difficulty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.map((round) => (
                <TableRow key={round.id ?? round.order}>
                  <TableCell>{round.order}</TableCell>
                  <TableCell className="font-medium">{round.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{round.type}</Badge>
                  </TableCell>
                  <TableCell>{round.questionCount}</TableCell>
                  <TableCell>{round.timeLimitMins} min</TableCell>
                  <TableCell>{round.scoreWeightage}%</TableCell>
                  <TableCell>
                    {round.veryEasyCount ? `VE${round.veryEasyCount} / ` : ""}
                    E{round.easyCount} / M{round.mediumCount} / H
                    {round.hardCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkspaceProgress({ step }: { step: number }) {
  const labels = ["Details", "Rounds", "Review"];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          {labels.map((label, index) => (
            <div
              key={label}
              className={`text-xs sm:text-sm font-medium ${step === index + 1 ? "text-foreground" : "text-muted-foreground"}`}
            >
              {index + 1}. {label}
            </div>
          ))}
        </div>
        <Progress value={(step / labels.length) * 100} className="h-2" />
      </CardContent>
    </Card>
  );
}

export function WorkspaceActionBar({
  workspace,
  onStart,
  starting,
  onArchive,
  archiving,
  onDelete,
  deleting,
  onCopyCode,
  onEnd,
  ending,
}: {
  workspace: Workspace;
  onStart?: () => void;
  starting?: boolean;
  onArchive?: () => void;
  archiving?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  onCopyCode?: () => void;
  onEnd?: () => void;
  ending?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onCopyCode}>
        <Copy className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Copy code</span>
      </Button>
      {workspace.status === "published" && (
        <Button
          variant="default"
          size="sm"
          onClick={onStart}
          disabled={starting}
        >
          {starting ? (
            <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">Start</span>
        </Button>
      )}
      {workspace.status === "started" && (
        <Button variant="outline" size="sm" onClick={onEnd} disabled={ending}>
          {ending ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <Square className="h-4 w-4 sm:mr-2" />}
          <span className="hidden sm:inline">End</span>
        </Button>
      )}
      {["published", "ended"].includes(workspace.status) && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onArchive}
          disabled={archiving}
        >
          {archiving ? (
            <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
          ) : (
            <Archive className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">Archive</span>
        </Button>
      )}
      {["draft", "archived"].includes(workspace.status) && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">Delete</span>
        </Button>
      )}
    </div>
  );
}

export function WorkspaceTabs({
  workspace,
  onRefresh,
}: {
  workspace: Workspace;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const readonly = workspace.status === "archived";
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <TabsList className="inline-flex w-max min-w-full sm:min-w-0 sm:w-auto flex-nowrap gap-1 p-1 h-auto">
          <TabsTrigger value="overview" className="shrink-0">
            Overview
          </TabsTrigger>
          <TabsTrigger value="rounds" className="shrink-0">
            Rounds
          </TabsTrigger>
          <TabsTrigger value="registrations" className="shrink-0">
            <Users className="h-3 w-3 mr-1" />
            Candidates
          </TabsTrigger>
          <TabsTrigger value="allowlist" className="shrink-0">
            Invitations
          </TabsTrigger>
          <TabsTrigger value="team" className="shrink-0">
            <Shield className="h-3 w-3 mr-1" />
            Team
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="shrink-0">
            <BarChart3 className="h-3 w-3 mr-1" />
            Leaderboard
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview">
        <WorkspaceOverviewCard workspace={workspace} />
      </TabsContent>
      <TabsContent value="rounds">
        <WorkspaceRoundsTable rounds={workspace.rounds ?? []} />
      </TabsContent>
      <TabsContent value="registrations">
        <WorkspaceRegistrationsTable
          workspaceId={workspace.id}
          readonly={readonly}
        />
      </TabsContent>
      <TabsContent value="team">
        <WorkspaceMembersManager
          workspaceId={workspace.id}
          currentUserId={user?.id}
          readonly={readonly}
        />
      </TabsContent>
      <TabsContent value="allowlist">
        {workspace.accessMode === "invite_only" ? (
          <AllowedEmailsUploader workspaceId={workspace.id} workspaceCode={workspace.code} readonly={readonly} />
        ) : (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Candidate invitations</CardTitle>
              <CardDescription>
                This assessment is open to anyone with its invitation code, so a separate invite list is not needed.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </TabsContent>
      <TabsContent value="leaderboard">
        <WorkspaceLeaderboardPreview workspaceCode={workspace.code} />
      </TabsContent>
    </Tabs>
  );
}
