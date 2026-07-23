import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type {
  ModuleSummary,
  RetakeEntry,
  WorkspaceAnalyticsSnapshot,
  WorkspaceRoundTypeKey,
} from "@/pages/admin/workspaces/workspaceAnalyticsTypes";

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const MODULE_LABELS: Record<WorkspaceRoundTypeKey, string> = {
  mcq: "Aptitude",
  coding: "Coding",
  sql: "SQL",
  interview: "AI Interview",
};

const READINESS_COLORS: Record<"ready" | "incomplete" | "belowThreshold", string> = {
  ready: "#10b981",
  incomplete: "#3b82f6",
  belowThreshold: "#ef4444",
};

const BAND_COLORS: Record<"top" | "mid" | "bottom", string> = {
  top: "#10b981",
  mid: "#f59e0b",
  bottom: "#ef4444",
};

function categoryColor(score: number): string {
  if (score < 60) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#10b981";
}

export function WorkspaceReadinessSummary({
  readiness,
}: {
  readiness: WorkspaceAnalyticsSnapshot["readiness"];
}) {
  const total = readiness.ready + readiness.incomplete + readiness.belowThreshold;
  const data = [
    { name: "Placement ready", key: "ready" as const, value: readiness.ready },
    { name: "Below threshold", key: "belowThreshold" as const, value: readiness.belowThreshold },
    { name: "Incomplete", key: "incomplete" as const, value: readiness.incomplete },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Readiness overview</CardTitle>
        <CardDescription>
          {total} registered candidate{total === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[280px_1fr] items-center">
          <div className="h-[220px]">
            {total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                  >
                    {data.map((entry) => (
                      <Cell key={entry.key} fill={READINESS_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No registered candidates yet.
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{readiness.ready}</p>
              <p className="text-xs text-muted-foreground mt-1">Placement ready</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{readiness.belowThreshold}</p>
              <p className="text-xs text-muted-foreground mt-1">Below threshold</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{readiness.incomplete}</p>
              <p className="text-xs text-muted-foreground mt-1">Incomplete</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleCard({ type, summary }: { type: WorkspaceRoundTypeKey; summary: ModuleSummary }) {
  const bandData = [
    { name: "Top", value: summary.bands.top, key: "top" as const },
    { name: "Mid", value: summary.bands.mid, key: "mid" as const },
    { name: "Bottom", value: summary.bands.bottom, key: "bottom" as const },
  ];
  const categoryLabel =
    type === "coding" ? "By difficulty" : type === "sql" ? "By subtrack / difficulty" : "By category";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center justify-between gap-2">
          <span>{MODULE_LABELS[type]}</span>
          {summary.avgPercentageScore !== null && (
            <Badge variant="outline">{summary.avgPercentageScore}% avg</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {summary.completedCount} completed &middot; {Math.max(0, summary.attemptedCount - summary.completedCount)} in progress
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="h-[140px]">
          {summary.completedCount > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={bandData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={45} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {bandData.map((entry) => (
                    <Cell key={entry.key} fill={BAND_COLORS[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No completed attempts yet.
            </div>
          )}
        </div>
        {summary.categories.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{categoryLabel}</p>
            <div className="space-y-2">
              {summary.categories.map((category) => (
                <div key={category.name} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0 truncate" title={category.name}>
                    {category.name}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${category.avgScore}%`, backgroundColor: categoryColor(category.avgScore) }}
                    />
                  </div>
                  <span className="text-xs w-10 shrink-0 text-right font-medium">{category.avgScore}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkspaceModuleBreakdown({
  modules,
}: {
  modules: WorkspaceAnalyticsSnapshot["modules"];
}) {
  const entries = (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][]).filter(
    ([, summary]) => summary.configured,
  );

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No rounds are configured for this workspace yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {entries.map(([type, summary]) => (
        <ModuleCard key={type} type={type} summary={summary} />
      ))}
    </div>
  );
}

const MODULE_FILTER_OPTIONS: { value: WorkspaceRoundTypeKey | "all"; label: string }[] = [
  { value: "all", label: "All modules" },
  { value: "mcq", label: "Aptitude" },
  { value: "coding", label: "Coding" },
  { value: "sql", label: "SQL" },
  { value: "interview", label: "AI Interview" },
];

export function WorkspaceRetakeTable({ retakeList }: { retakeList: RetakeEntry[] }) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<WorkspaceRoundTypeKey | "all">("all");

  const filtered = retakeList.filter((entry) => {
    if (moduleFilter !== "all" && entry.roundType !== moduleFilter) return false;
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return entry.name.toLowerCase().includes(query) || entry.email.toLowerCase().includes(query);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Needs attention</CardTitle>
        <CardDescription>
          {retakeList.length} candidate-round entr{retakeList.length === 1 ? "y" : "ies"} flagged as incomplete or
          below the retake threshold.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={moduleFilter}
            onValueChange={(value) => setModuleFilter(value as WorkspaceRoundTypeKey | "all")}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODULE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            {retakeList.length === 0 ? "No candidates need attention right now." : "No candidates match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry, index) => (
                  <TableRow key={`${entry.userId}-${entry.roundType}-${index}`}>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>{entry.email}</TableCell>
                    <TableCell>{entry.roundLabel}</TableCell>
                    <TableCell>
                      <Badge variant={entry.reason === "below_threshold" ? "destructive" : "outline"}>
                        {entry.reason === "below_threshold" ? "Below threshold" : "Incomplete"}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
