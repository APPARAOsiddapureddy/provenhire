import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type {
  AllowlistImportSummary,
  SqlTaskAvailability,
  Workspace,
  WorkspaceDetailsDraft,
  WorkspaceLeaderboardResponse,
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

export function WorkspaceDetailsStep({ value, onChange, onSave, saving, locked, workspaceCode }: WorkspaceDetailsStepProps) {
  const validation = validateWorkspaceDetails(value);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Workspace Details</CardTitle>
            <CardDescription>Save the hiring event basics first. The backend generates the workspace code.</CardDescription>
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
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={value.name}
              disabled={locked}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="Campus Hiring Challenge"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-org">Organization</Label>
            <Input
              id="workspace-org"
              value={value.organization}
              disabled={locked}
              onChange={(event) => onChange({ ...value, organization: event.target.value })}
              placeholder="Acme University"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="workspace-start">Start date and time</Label>
            <Input
              id="workspace-start"
              type="datetime-local"
              value={value.startAt}
              disabled={locked}
              onChange={(event) => onChange({ ...value, startAt: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-end">End date and time</Label>
            <Input
              id="workspace-end"
              type="datetime-local"
              value={value.endAt}
              disabled={locked}
              onChange={(event) => onChange({ ...value, endAt: event.target.value })}
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
              onChange={(event) => onChange({ ...value, totalRounds: event.target.value.replace(/\D/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label>Access mode</Label>
            <Select
              value={value.accessMode}
              disabled={locked}
              onValueChange={(accessMode: WorkspaceDetailsDraft["accessMode"]) => onChange({ ...value, accessMode })}
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
        {locked && <p className="text-sm text-muted-foreground">Published workspace details cannot be edited.</p>}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving || !!validation || locked}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
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

export function RoundConfigStep({ rounds, totalRounds, onChange, onSave, saving, locked }: RoundConfigStepProps) {
  const [activeOrder, setActiveOrder] = useState(1);
  const [sqlAvailability, setSqlAvailability] = useState<SqlTaskAvailability | null>(null);
  const [sqlAvailabilityError, setSqlAvailabilityError] = useState(false);
  const active = rounds.find((round) => round.order === activeOrder) ?? rounds[0];
  const validation = validateRounds(rounds, totalRounds);
  const weightTotal = rounds.reduce((sum, round) => sum + (parseIntegerDraft(round.scoreWeightage, 0, 100) ?? 0), 0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ availability: SqlTaskAvailability }>("/api/workspaces/question-bank/sql")
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
    onChange(rounds.map((round) => (round.order === active.order ? { ...round, ...patch } : round)));
  };

  const activeSqlShortage = active && active.type === "sql" && sqlAvailability
    ? {
        Easy: Math.max(0, (parseIntegerDraft(active.easyCount, 0, 200) ?? 0) - sqlAvailability.byDifficulty.Easy),
        Medium: Math.max(0, (parseIntegerDraft(active.mediumCount, 0, 200) ?? 0) - sqlAvailability.byDifficulty.Medium),
        Hard: Math.max(0, (parseIntegerDraft(active.hardCount, 0, 200) ?? 0) - sqlAvailability.byDifficulty.Hard),
      }
    : null;
  const hasActiveSqlShortage = !!activeSqlShortage && Object.values(activeSqlShortage).some((count) => count > 0);
  const saveDisabled = saving || !!validation || locked || hasActiveSqlShortage;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Configure Rounds</CardTitle>
            <CardDescription>Set timing, scoring, question selection, and difficulty mix for every round.</CardDescription>
          </div>
          <Badge variant={weightTotal === 100 ? "default" : "destructive"} className="w-fit">
            Weightage {weightTotal}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-5">
          <div className="space-y-2">
            {rounds.map((round) => {
              const easyCount = parseIntegerDraft(round.easyCount, 0, 200) ?? 0;
              const mediumCount = parseIntegerDraft(round.mediumCount, 0, 200) ?? 0;
              const hardCount = parseIntegerDraft(round.hardCount, 0, 200) ?? 0;
              const questionCount = parseIntegerDraft(round.questionCount, 1, 200) ?? -1;
              const scoreWeightage = parseIntegerDraft(round.scoreWeightage, 1, 100) ?? 0;
              const difficultyTotal = easyCount + mediumCount + hardCount;
              const valid = round.name.trim() && difficultyTotal === questionCount && scoreWeightage > 0;
              return (
                <button
                  key={round.order}
                  type="button"
                  onClick={() => setActiveOrder(round.order)}
                  className={"w-full rounded-md border px-3 py-3 text-left text-sm transition " + (activeOrder === round.order ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Round {round.order}</span>
                    {valid && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{round.name || "Untitled round"}</div>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Round name</Label>
                  <Input value={active.name} disabled={locked} onChange={(event) => updateRound({ name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Round type</Label>
                  <Select value={active.type} disabled={locked} onValueChange={(type: WorkspaceRoundType) => updateRound({ type })}>
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
                    onValueChange={(questionType: "random" | "fixed") => updateRound({ questionType })}
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
                <NumberField label="Questions" value={active.questionCount} disabled={locked} min={1} max={200} onChange={(questionCount) => updateRound({ questionCount })} />
                <NumberField label="Minutes" value={active.timeLimitMins} disabled={locked} min={1} max={480} onChange={(timeLimitMins) => updateRound({ timeLimitMins })} />
                <NumberField label="Weightage" value={active.scoreWeightage} disabled={locked} min={1} max={100} onChange={(scoreWeightage) => updateRound({ scoreWeightage })} />
              </div>

              <div>
                <Label>Difficulty split</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <NumberField label="Easy" value={active.easyCount} disabled={locked} min={0} max={200} onChange={(easyCount) => updateRound({ easyCount })} />
                  <NumberField label="Medium" value={active.mediumCount} disabled={locked} min={0} max={200} onChange={(mediumCount) => updateRound({ mediumCount })} />
                  <NumberField label="Hard" value={active.hardCount} disabled={locked} min={0} max={200} onChange={(hardCount) => updateRound({ hardCount })} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current total:{" "}
                  {(parseIntegerDraft(active.easyCount, 0, 200) ?? 0) +
                    (parseIntegerDraft(active.mediumCount, 0, 200) ?? 0) +
                    (parseIntegerDraft(active.hardCount, 0, 200) ?? 0)}
                  /{active.questionCount || 0}
                </p>
              </div>

              {active.type === "sql" && (
                <div className="rounded-md border border-[var(--dash-navy-border)] bg-white/[0.03] px-3 py-2 text-sm">
                  <div className="font-medium text-[var(--dash-text-primary)]">
                    SQL bank: E {sqlAvailability?.byDifficulty.Easy ?? "-"} / M {sqlAvailability?.byDifficulty.Medium ?? "-"} / H {sqlAvailability?.byDifficulty.Hard ?? "-"} eligible
                  </div>
                  {hasActiveSqlShortage && activeSqlShortage ? (
                    <div className="mt-1 text-destructive">
                      Not enough eligible SQL tasks: E {activeSqlShortage.Easy}, M {activeSqlShortage.Medium}, H {activeSqlShortage.Hard} short.
                    </div>
                  ) : null}
                  {sqlAvailability?.missingHiddenTests ? (
                    <div className="mt-1 text-amber-500">
                      {sqlAvailability.missingHiddenTests} visible SQL task{sqlAvailability.missingHiddenTests === 1 ? " is" : "s are"} excluded until hidden tests are added.
                    </div>
                  ) : null}
                  {sqlAvailabilityError ? <div className="mt-1 text-muted-foreground">Could not load SQL bank counts.</div> : null}
                </div>
              )}

              {validation && <p className="text-sm text-destructive">{validation}</p>}
              {locked && <p className="text-sm text-muted-foreground">Published workspace rounds cannot be edited.</p>}

              <div className="flex justify-end">
                <Button onClick={onSave} disabled={saveDisabled}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
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

export function WorkspaceReviewStep({ workspace, details, rounds, publishing, onPublish, onBackToRounds }: WorkspaceReviewStepProps) {
  const detailsError = validateWorkspaceDetails(details);
  const totalRounds = parseIntegerDraft(details.totalRounds, 1, 5) ?? 0;
  const payloadRounds = roundsToPayload(rounds);
  const roundsError = validateRounds(rounds, totalRounds);
  const checks = [
    { label: "Workspace details saved", ok: !detailsError },
    { label: "All rounds configured", ok: !roundsError },
    { label: "Score weightage totals 100", ok: (payloadRounds ?? []).reduce((sum, round) => sum + round.scoreWeightage, 0) === 100 },
    { label: "Difficulty splits match question counts", ok: !!payloadRounds && payloadRounds.every((round) => round.easyCount + round.mediumCount + round.hardCount === round.questionCount) },
  ];
  const ready = checks.every((check) => check.ok);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Review Workspace</CardTitle>
          <CardDescription>Confirm the setup before publishing the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <SummaryItem label="Name" value={workspace.name} />
            <SummaryItem label="Organization" value={workspace.organization} />
            <SummaryItem label="Workspace code" value={workspace.code} mono />
            <SummaryItem label="Access mode" value={workspace.accessMode === "invite_only" ? "Invite-only" : "Public"} />
            <SummaryItem label="Starts" value={formatDateTime(workspace.startAt)} />
            <SummaryItem label="Ends" value={formatDateTime(workspace.endAt)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <CheckCircle2 className={`h-4 w-4 ${check.ok ? "text-emerald-600" : "text-muted-foreground"}`} />
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
                      E{round.easyCount} / M{round.mediumCount} / H{round.hardCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {workspace.accessMode === "invite_only" && <AllowedEmailsUploader workspaceCode={workspace.code} />}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button variant="outline" onClick={onBackToRounds}>
              Back to rounds
            </Button>
            <Button onClick={onPublish} disabled={publishing || !ready}>
              {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Create Workspace
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-medium break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

export function AllowedEmailsUploader({ workspaceCode }: { workspaceCode: string }) {
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<AllowlistImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const res = await api.post<{ summary: AllowlistImportSummary }>("/api/workspaces/allowed-emails/import", form);
      setSummary(res.summary);
      toast.success("Allowed emails imported.");
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
          Invite-only allowlist
        </CardTitle>
        <CardDescription>Upload a CSV with an email column before sharing this workspace code.</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => upload(event.target.files?.[0])} disabled={uploading} />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
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

export function WorkspaceRegistrationsTable({ workspaceId, readonly }: { workspaceId: string; readonly?: boolean }) {
  const [registrations, setRegistrations] = useState<WorkspaceRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ registrations: WorkspaceRegistration[] }>(`/api/workspaces/${workspaceId}/registrations`);
      setRegistrations(res.registrations ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load registrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRegistrations();
  }, [workspaceId]);

  const updateStatus = async (userId: string, action: "remove" | "restore") => {
    setBusyUserId(userId);
    try {
      if (action === "remove") {
        await api.del(`/api/workspaces/${workspaceId}/registrations/${userId}`);
        toast.success("User removed from workspace.");
      } else {
        await api.post(`/api/workspaces/${workspaceId}/registrations/${userId}/restore`, {});
        toast.success("User restored.");
      }
      await fetchRegistrations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration update failed");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg">Registrations</CardTitle>
            <CardDescription>Registered and removed users for this workspace.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRegistrations} disabled={loading}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading registrations...</div>
        ) : registrations.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No registrations yet.</div>
        ) : (
          <div className="overflow-x-auto">
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
                  const name = registration.user?.jobSeekerProfile?.fullName || registration.user?.name || "Candidate";
                  return (
                    <TableRow key={registration.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{registration.user?.email ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={registration.status === "registered" ? "default" : "destructive"}>{registration.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(registration.registeredAt)}</TableCell>
                      <TableCell className="text-right">
                        {registration.status === "registered" ? (
                          <Button variant="outline" size="sm" disabled={readonly || busyUserId === registration.userId} onClick={() => updateStatus(registration.userId, "remove")}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled={readonly || busyUserId === registration.userId} onClick={() => updateStatus(registration.userId, "restore")}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Restore
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkspaceLeaderboardPreview({ workspaceCode }: { workspaceCode: string }) {
  const [rows, setRows] = useState<WorkspaceLeaderboardResponse["leaderboard"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = async (cursor?: string | null) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "10" });
      if (cursor) qs.set("cursor", cursor);
      const res = await api.get<WorkspaceLeaderboardResponse>(`/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/leaderboard?${qs.toString()}`);
      setRows((prev) => (cursor ? [...prev, ...res.leaderboard] : res.leaderboard));
      setNextCursor(res.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void fetchPage(null);
  }, [workspaceCode]);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Leaderboard Preview
        </CardTitle>
        <CardDescription>Public ranking preview for this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading leaderboard...</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No completed round scores yet.</div>
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
                      <TableCell className="font-medium">{row.name || "Candidate"}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.totalScore}</TableCell>
                      <TableCell>{row.completedRounds}</TableCell>
                      <TableCell>{formatDateTime(row.lastCompletedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextCursor && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => fetchPage(nextCursor)} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
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
            <CardTitle className="text-base sm:text-lg">{workspace.name}</CardTitle>
            <CardDescription>{workspace.organization}</CardDescription>
          </div>
          <Badge variant="outline" className={statusBadgeClass(workspace.status)}>
            {statusLabel(workspace.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryItem label="Code" value={workspace.code} mono />
          <SummaryItem label="Access" value={workspace.accessMode === "invite_only" ? "Invite-only" : "Public"} />
          <SummaryItem label="Rounds" value={String(roundCount)} />
          <SummaryItem label="Window" value={`${formatDateTime(workspace.startAt)} - ${formatDateTime(workspace.endAt)}`} />
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
        <CardDescription>Published configuration for each workspace round.</CardDescription>
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
                    E{round.easyCount} / M{round.mediumCount} / H{round.hardCount}
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
            <div key={label} className={`text-xs sm:text-sm font-medium ${step === index + 1 ? "text-foreground" : "text-muted-foreground"}`}>
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
}: {
  workspace: Workspace;
  onStart?: () => void;
  starting?: boolean;
  onArchive?: () => void;
  archiving?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  onCopyCode?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onCopyCode}>
        <Copy className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Copy code</span>
      </Button>
      {workspace.status === "published" && (
        <Button variant="default" size="sm" onClick={onStart} disabled={starting}>
          {starting ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <Play className="h-4 w-4 sm:mr-2" />}
          <span className="hidden sm:inline">Start</span>
        </Button>
      )}
      {workspace.status !== "draft" && workspace.status !== "archived" && (
        <Button variant="destructive" size="sm" onClick={onArchive} disabled={archiving}>
          {archiving ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <Archive className="h-4 w-4 sm:mr-2" />}
          <span className="hidden sm:inline">Archive</span>
        </Button>
      )}
      {workspace.status !== "started" && (
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
          {deleting ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 sm:mr-2" />}
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
  const readonly = workspace.status === "archived";
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <TabsList className="inline-flex w-max min-w-full sm:min-w-0 sm:w-auto flex-nowrap gap-1 p-1 h-auto">
          <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>
          <TabsTrigger value="rounds" className="shrink-0">Rounds</TabsTrigger>
          <TabsTrigger value="registrations" className="shrink-0">
            <Users className="h-3 w-3 mr-1" />
            Registrations
          </TabsTrigger>
          <TabsTrigger value="allowlist" className="shrink-0">Allowlist</TabsTrigger>
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
        <WorkspaceRegistrationsTable workspaceId={workspace.id} readonly={readonly} />
      </TabsContent>
      <TabsContent value="allowlist">
        {workspace.accessMode === "invite_only" ? (
          <AllowedEmailsUploader workspaceCode={workspace.code} />
        ) : (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Allowlist</CardTitle>
              <CardDescription>This workspace is public, so candidates can join with the workspace code.</CardDescription>
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
