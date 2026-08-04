import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CollegeWorkspace, CollegeWorkspaceRound } from "./types";

const ROUND_TYPE_LABEL: Record<CollegeWorkspaceRound["type"], string> = {
  mcq: "Aptitude (MCQ)",
  coding: "Coding (DSA)",
  interview: "Interview",
  sql: "SQL",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export default function CollegeWorkspaceDetailsTab({
  workspace,
}: {
  workspace: CollegeWorkspace;
}) {
  const rounds = workspace.rounds ?? [];
  const totalWeightage = rounds.reduce((sum, round) => sum + round.scoreWeightage, 0);
  const totalQuestions = rounds.reduce((sum, round) => sum + round.questionCount, 0);
  const totalMinutes = rounds.reduce((sum, round) => sum + round.timeLimitMins, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Workspace" value={workspace.name} />
          <SummaryItem label="Organization" value={workspace.organization} />
          <SummaryItem label="Target role" value={workspace.targetRole} />
          <SummaryItem
            label="Workspace code"
            value={<span className="font-mono">{workspace.code}</span>}
          />
          <SummaryItem label="Starts" value={formatDateTime(workspace.startAt)} />
          <SummaryItem label="Ends" value={formatDateTime(workspace.endAt)} />
          <SummaryItem
            label="Access mode"
            value={workspace.accessMode === "public" ? "Public" : "Invite only"}
          />
          <SummaryItem label="Total rounds" value={workspace.totalRounds} />
          <SummaryItem
            label="Registered candidates"
            value={workspace._count?.registrations ?? 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Rounds and scoring weightage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rounds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Rounds have not been configured for this workspace yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Round</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right">Time limit</TableHead>
                    <TableHead className="text-right">Weightage</TableHead>
                    <TableHead>Difficulty split</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rounds.map((round) => (
                    <TableRow key={round.id}>
                      <TableCell className="font-medium">{round.order}</TableCell>
                      <TableCell>{round.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {ROUND_TYPE_LABEL[round.type] ?? round.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{round.questionCount}</TableCell>
                      <TableCell className="text-right">
                        {round.timeLimitMins} min
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {round.scoreWeightage}%
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {`${round.veryEasyCount ? `VE ${round.veryEasyCount} · ` : ""}E ${round.easyCount ?? 0} · M ${round.mediumCount ?? 0} · H ${round.hardCount ?? 0}`}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{totalQuestions}</TableCell>
                    <TableCell className="text-right">{totalMinutes} min</TableCell>
                    <TableCell className="text-right">{totalWeightage}%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
