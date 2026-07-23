import { useMemo, useState } from "react";
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
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from "recharts";
import { Target, TrendingDown, Users2 } from "lucide-react";
import type {
  ModuleCategoryStat,
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

const MODULE_COLORS: Record<WorkspaceRoundTypeKey, string> = {
  mcq: "#6366f1",
  coding: "#0ea5e9",
  sql: "#14b8a6",
  interview: "#f59e0b",
};

const MASTERY_THRESHOLD = 70;

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

type PriorityTopic = ModuleCategoryStat & {
  module: WorkspaceRoundTypeKey;
  moduleLabel: string;
  impact: number;
  priorityScore: number;
};

function estimateImpact(category: ModuleCategoryStat): number {
  if (typeof category.weakCandidateCount === "number") return category.weakCandidateCount;
  return Math.round((category.sampleSize * (100 - category.avgScore)) / 100);
}

function buildPriorityTopics(modules: WorkspaceAnalyticsSnapshot["modules"]): PriorityTopic[] {
  return (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][])
    .filter(([, summary]) => summary.configured)
    .flatMap(([type, summary]) =>
      summary.categories
        .filter((category) => category.sampleSize > 0)
        .map((category) => {
          const impact = estimateImpact(category);
          return {
            ...category,
            module: type,
            moduleLabel: MODULE_LABELS[type],
            impact,
            priorityScore: impact * (100 - category.avgScore),
          };
        }),
    );
}

function TopicMatrixTooltip({ active, payload }: { active?: boolean; payload?: { payload: PriorityTopic }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const topic = payload[0].payload;
  return (
    <div
      className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <p className="font-semibold">{topic.name}</p>
      <p className="text-muted-foreground">{topic.moduleLabel}</p>
      <p className="mt-1">
        Avg score <span className="font-medium">{topic.avgScore}%</span>
      </p>
      <p>
        Struggling: <span className="font-medium">{topic.impact}</span> of {topic.sampleSize} candidates
      </p>
    </div>
  );
}

export function WorkspaceTopicPriorityMatrix({
  modules,
}: {
  modules: WorkspaceAnalyticsSnapshot["modules"];
}) {
  const topics = useMemo(() => buildPriorityTopics(modules), [modules]);

  if (topics.length === 0) {
    return null;
  }

  const impactValues = topics.map((t) => t.impact);
  const impactMedian = [...impactValues].sort((a, b) => a - b)[Math.floor(impactValues.length / 2)] ?? 0;

  const fixFirst = [...topics]
    .filter((t) => t.avgScore < MASTERY_THRESHOLD)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3);

  const configuredModuleTypes = (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][])
    .filter(([, summary]) => summary.configured)
    .map(([type]) => type);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Topic priority matrix
        </CardTitle>
        <CardDescription>
          Every topic across every round, plotted by mastery (x) and how many candidates it's holding back (y).
          Bubble size is how many candidates attempted it. Topics to the left of the dashed line are below the{" "}
          {MASTERY_THRESHOLD}% mastery bar &mdash; the higher they sit, the more candidates they're affecting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                dataKey="avgScore"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                label={{ value: "Mastery — avg score %", position: "insideBottom", offset: -18, fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="impact"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                label={{
                  value: "Candidates struggling",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 12,
                  style: { textAnchor: "middle" },
                }}
              />
              <ZAxis type="number" dataKey="sampleSize" range={[80, 520]} />
              <ReferenceLine x={MASTERY_THRESHOLD} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={impactMedian} stroke="#94a3b8" strokeDasharray="4 4" />
              <Tooltip content={<TopicMatrixTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              {configuredModuleTypes.map((type) => (
                <Scatter
                  key={type}
                  name={MODULE_LABELS[type]}
                  data={topics.filter((t) => t.module === type)}
                  fill={MODULE_COLORS[type]}
                  fillOpacity={0.75}
                />
              ))}
              <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {fixFirst.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Where to focus next
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {fixFirst.map((topic, index) => (
                <div key={`${topic.module}-${topic.name}`} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {index === 0 ? "Biggest opportunity" : `Priority #${index + 1}`}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{topic.moduleLabel}</span>
                  </div>
                  <p className="text-sm font-medium">{topic.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {topic.impact} of {topic.sampleSize} candidates who attempted this are below the mastery bar
                    (avg {topic.avgScore}%). Highest-leverage fix in this round &mdash; closing this gap moves the
                    most candidates toward placement-ready.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type CandidateSegments = {
  multiGap: number;
  singleGap: number;
  incomplete: number;
  onTrack: number;
  topPair: [string, string] | null;
  topPairCount: number;
};

function buildCandidateSegments(
  retakeList: RetakeEntry[],
  totalCandidates: number,
): CandidateSegments {
  const belowThresholdByUser = new Map<string, Set<WorkspaceRoundTypeKey>>();
  const incompleteUsers = new Set<string>();

  for (const entry of retakeList) {
    if (entry.reason === "below_threshold") {
      const set = belowThresholdByUser.get(entry.userId) ?? new Set<WorkspaceRoundTypeKey>();
      set.add(entry.roundType);
      belowThresholdByUser.set(entry.userId, set);
    } else {
      incompleteUsers.add(entry.userId);
    }
  }

  let multiGap = 0;
  let singleGap = 0;
  const pairCounts = new Map<string, number>();

  for (const [userId, modules] of belowThresholdByUser) {
    if (incompleteUsers.has(userId)) continue;
    if (modules.size >= 2) {
      multiGap += 1;
      const sortedModules = [...modules].sort();
      for (let i = 0; i < sortedModules.length; i += 1) {
        for (let j = i + 1; j < sortedModules.length; j += 1) {
          const key = `${MODULE_LABELS[sortedModules[i]]}|${MODULE_LABELS[sortedModules[j]]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    } else {
      singleGap += 1;
    }
  }

  const incomplete = incompleteUsers.size;
  const onTrack = Math.max(0, totalCandidates - multiGap - singleGap - incomplete);

  let topPair: [string, string] | null = null;
  let topPairCount = 0;
  for (const [key, count] of pairCounts) {
    if (count > topPairCount) {
      topPairCount = count;
      const [a, b] = key.split("|");
      topPair = [a, b];
    }
  }

  return { multiGap, singleGap, incomplete, onTrack, topPair, topPairCount };
}

const SEGMENT_COLORS = {
  onTrack: "#10b981",
  singleGap: "#f59e0b",
  multiGap: "#ef4444",
  incomplete: "#94a3b8",
};

export function WorkspaceCandidateSegments({
  retakeList,
  totalCandidates,
}: {
  retakeList: RetakeEntry[];
  totalCandidates: number;
}) {
  const segments = useMemo(
    () => buildCandidateSegments(retakeList, totalCandidates),
    [retakeList, totalCandidates],
  );

  if (totalCandidates === 0) return null;

  const rows = [
    { key: "onTrack" as const, label: "On track", count: segments.onTrack },
    { key: "singleGap" as const, label: "One gap", count: segments.singleGap },
    { key: "multiGap" as const, label: "Multiple gaps", count: segments.multiGap },
    { key: "incomplete" as const, label: "Not yet started/finished", count: segments.incomplete },
  ];

  const multiGapPercent = totalCandidates ? Math.round((segments.multiGap / totalCandidates) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" />
          Candidate risk segments
        </CardTitle>
        <CardDescription>How the candidate pool breaks down by breadth of skill gap, not just pass/fail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
          {rows.map((row) =>
            row.count > 0 ? (
              <div
                key={row.key}
                style={{
                  width: `${(row.count / totalCandidates) * 100}%`,
                  backgroundColor: SEGMENT_COLORS[row.key],
                }}
              />
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {rows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: SEGMENT_COLORS[row.key] }} />
                <span className="text-xs text-muted-foreground">{row.label}</span>
              </div>
              <p className="text-xl font-bold">{row.count}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed border-t pt-4">
          {segments.multiGap} candidate{segments.multiGap === 1 ? "" : "s"} ({multiGapPercent}%) are behind in two or
          more rounds at once &mdash; this is the highest-risk group for placement readiness, since a single-round
          fix won't be enough for them.
          {segments.topPair
            ? ` The most common pairing is ${segments.topPair[0]} + ${segments.topPair[1]} (${segments.topPairCount} candidate${
                segments.topPairCount === 1 ? "" : "s"
              }), which suggests a shared underlying gap rather than two unrelated weak spots.`
            : ""}{" "}
          {segments.singleGap} candidate{segments.singleGap === 1 ? "" : "s"} are behind in exactly one round &mdash;
          the fastest group to move into "placement ready" with targeted practice.
        </p>
      </CardContent>
    </Card>
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
