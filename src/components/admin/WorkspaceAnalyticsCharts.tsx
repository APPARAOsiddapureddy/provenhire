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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { AlertTriangle, Award, CheckCircle2, Lightbulb, Target, TrendingDown, Users2, XCircle } from "lucide-react";
import type {
  MistakeBreakdown,
  ModuleCategoryStat,
  ModuleSummary,
  ProficiencyTiers,
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

function weakestEntry(summary: ModuleSummary): ModuleCategoryStat | null {
  const list = (summary.topics ?? summary.categories).filter((c) => c.sampleSize > 0);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => a.avgScore - b.avgScore)[0];
}

function strongestEntry(summary: ModuleSummary): ModuleCategoryStat | null {
  const list = (summary.topics ?? summary.categories).filter((c) => c.sampleSize > 0);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.avgScore - a.avgScore)[0];
}

const PROFICIENCY_COLORS: Record<keyof ProficiencyTiers, string> = {
  good: "#10b981",
  average: "#f59e0b",
  poor: "#ef4444",
};

export function WorkspaceBatchOverview({
  workspace,
  readiness,
  modules,
}: {
  workspace: WorkspaceAnalyticsSnapshot["workspace"];
  readiness: WorkspaceAnalyticsSnapshot["readiness"];
  modules: WorkspaceAnalyticsSnapshot["modules"];
}) {
  const total = workspace.totalCandidates;
  if (total === 0) return null;
  const readyPercent = Math.round((readiness.ready / total) * 100);
  const entries = (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][]).filter(
    ([, summary]) => summary.configured,
  );

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">Batch overview</CardTitle>
        <CardDescription className="text-sm">
          {total} candidate{total === 1 ? "" : "s"} in this workspace &middot;{" "}
          <span className="font-medium text-foreground">
            {readiness.ready} ({readyPercent}%) are placement ready today
          </span>
          , {readiness.belowThreshold} need a retake, and {readiness.incomplete} haven&rsquo;t finished every round.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map(([type, summary]) => {
            const weakest = weakestEntry(summary);
            const tierTotal = summary.proficiency.good + summary.proficiency.average + summary.proficiency.poor;
            return (
              <div key={type} className="rounded-lg border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{MODULE_LABELS[type]}</p>
                  {summary.avgPercentageScore !== null && (
                    <span className="text-xs text-muted-foreground">{summary.avgPercentageScore}% avg</span>
                  )}
                </div>
                {tierTotal > 0 ? (
                  <>
                    <div className="h-2 w-full rounded-full overflow-hidden flex bg-muted">
                      {(Object.keys(summary.proficiency) as (keyof ProficiencyTiers)[]).map((tier) =>
                        summary.proficiency[tier] > 0 ? (
                          <div
                            key={tier}
                            style={{
                              width: `${(summary.proficiency[tier] / tierTotal) * 100}%`,
                              backgroundColor: PROFICIENCY_COLORS[tier],
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold text-emerald-600">{summary.proficiency.good}</p>
                        <p className="text-[10px] text-muted-foreground">Good</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-600">{summary.proficiency.average}</p>
                        <p className="text-[10px] text-muted-foreground">Average</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-600">{summary.proficiency.poor}</p>
                        <p className="text-[10px] text-muted-foreground">Poor / fail</p>
                      </div>
                    </div>
                    {weakest && (
                      <p className="text-[11px] text-muted-foreground leading-snug border-t pt-2">
                        Commonly struggling with{" "}
                        <span className="font-medium text-foreground">{weakest.name}</span> (avg {weakest.avgScore}%)
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No completed attempts yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ModulePercentileStrip({
  percentiles,
  topDecileAvg,
}: {
  percentiles?: { p25: number; p50: number; p75: number };
  topDecileAvg: number | null;
}) {
  if (!percentiles) return null;
  return (
    <div className="space-y-1.5">
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute top-0 bottom-0 rounded-full bg-primary/25"
          style={{ left: `${percentiles.p25}%`, width: `${Math.max(0, percentiles.p75 - percentiles.p25)}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 w-0.5 bg-foreground/70"
          style={{ left: `${percentiles.p50}%` }}
        />
        {topDecileAvg !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2.5 w-0.5 bg-emerald-500"
            style={{ left: `${topDecileAvg}%` }}
          />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        P25 {percentiles.p25}% &middot; P50 {percentiles.p50}% &middot; P75 {percentiles.p75}%
        {topDecileAvg !== null ? (
          <>
            {" "}
            &middot; <span className="text-emerald-600 font-medium">Top 10% avg {topDecileAvg}%</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function CategoryBar({ stat, labelWidthClass }: { stat: ModuleCategoryStat; labelWidthClass: string }) {
  const hasPercentiles = typeof stat.p25 === "number" && typeof stat.p75 === "number" && typeof stat.p50 === "number";
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs ${labelWidthClass} shrink-0 truncate`} title={stat.name}>
        {stat.name}
      </span>
      <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${stat.avgScore}%`, backgroundColor: categoryColor(stat.avgScore) }}
        />
        {hasPercentiles && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/40"
              style={{ left: `${stat.p25}%` }}
              title={`P25: ${stat.p25}%`}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/70"
              style={{ left: `${stat.p50}%` }}
              title={`P50 (median): ${stat.p50}%`}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/40"
              style={{ left: `${stat.p75}%` }}
              title={`P75: ${stat.p75}%`}
            />
          </>
        )}
      </div>
      <span className="text-xs w-10 shrink-0 text-right font-medium">{stat.avgScore}%</span>
    </div>
  );
}

function MistakeBreakdownNote({
  breakdown,
  moduleLabel,
}: {
  breakdown?: MistakeBreakdown;
  moduleLabel: string;
}) {
  if (!breakdown) return null;
  const failed = breakdown.wrongLogic + breakdown.syntaxError + breakdown.inefficientOrCrashed;
  if (failed === 0) return null;
  const wrongPercent = Math.round((breakdown.wrongLogic / failed) * 100);
  const syntaxPercent = Math.round((breakdown.syntaxError / failed) * 100);
  const crashPercent = Math.max(0, 100 - wrongPercent - syntaxPercent);
  const noun = moduleLabel === "SQL" ? "query" : "submission";
  const nounPlural = moduleLabel === "SQL" ? "queries" : "submissions";
  let verdict: string;
  if (wrongPercent >= syntaxPercent && wrongPercent >= crashPercent) {
    verdict = `most candidates can write a valid ${noun} — the gap is correctness, not syntax`;
  } else if (syntaxPercent >= crashPercent) {
    verdict = `a large share can't produce a syntactically valid ${noun} at all — this points to a fundamentals gap`;
  } else {
    verdict = `${nounPlural} often run but time out, exceed limits, or crash — likely inefficient approaches rather than wrong logic`;
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium mb-1">When they get it wrong</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Of failed test cases: {wrongPercent}% run but return the wrong result, {syntaxPercent}% never run at all
        (syntax errors), and {crashPercent}% time out, exceed limits, or crash &mdash; {verdict}.
      </p>
    </div>
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
        <ModulePercentileStrip percentiles={summary.percentiles} topDecileAvg={summary.topDecileAvg} />
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
        {summary.topics && summary.topics.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">By topic</p>
            <div className="space-y-2">
              {summary.topics.map((topic) => (
                <CategoryBar key={topic.name} stat={topic} labelWidthClass="w-40" />
              ))}
            </div>
          </div>
        )}
        {summary.categories.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
              <span>{categoryLabel}</span>
              {summary.categories.some((c) => typeof c.p25 === "number") && (
                <span className="text-[10px] font-normal">tick marks: P25 · P50 · P75</span>
              )}
            </p>
            <div className="space-y-2">
              {summary.categories.map((category) => (
                <CategoryBar key={category.name} stat={category} labelWidthClass="w-32" />
              ))}
            </div>
          </div>
        )}
        <MistakeBreakdownNote breakdown={summary.mistakeBreakdown} moduleLabel={MODULE_LABELS[type]} />
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
      (summary.topics ?? summary.categories)
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
    .slice(0, 4);
  const [biggestOpportunity, ...otherPriorities] = fixFirst;

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
        {biggestOpportunity && (
          <div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <TrendingDown className="h-4.5 w-4.5 text-red-600" />
            </div>
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Biggest opportunity: {biggestOpportunity.moduleLabel} &mdash; {biggestOpportunity.name}.</span>{" "}
              {biggestOpportunity.impact} of {biggestOpportunity.sampleSize} candidates who attempted it (
              {biggestOpportunity.sampleSize ? Math.round((biggestOpportunity.impact / biggestOpportunity.sampleSize) * 100) : 0}%) are
              scoring below the mastery bar, averaging just {biggestOpportunity.avgScore}%. This is the single
              highest-leverage fix on the board &mdash; closing it moves more candidates toward placement-ready than
              any other topic.
            </p>
          </div>
        )}
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

        {otherPriorities.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-600" />
              Also worth prioritizing
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {otherPriorities.map((topic, index) => (
                <div key={`${topic.module}-${topic.name}`} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      Priority #{index + 2}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{topic.moduleLabel}</span>
                  </div>
                  <p className="text-sm font-medium">{topic.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {topic.impact} of {topic.sampleSize} candidates below the mastery bar (avg {topic.avgScore}%).
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

export function WorkspaceModuleRadar({ modules }: { modules: WorkspaceAnalyticsSnapshot["modules"] }) {
  const entries = (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][]).filter(
    ([, summary]) => summary.configured && summary.avgPercentageScore !== null,
  );
  if (entries.length < 3) return null;

  const data = entries.map(([type, summary]) => ({
    module: MODULE_LABELS[type],
    "Batch average": summary.avgPercentageScore ?? 0,
    "Top 10%": summary.topDecileAvg ?? summary.avgPercentageScore ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Module performance radar</CardTitle>
        <CardDescription>
          Batch average vs. your top 10% across every round, at a glance &mdash; a wide gap between the two means the
          ceiling is high but most candidates aren't reaching it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="72%">
              <PolarGrid className="stroke-muted" />
              <PolarAngleAxis dataKey="module" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Batch average" dataKey="Batch average" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
              <Radar name="Top 10%" dataKey="Top 10%" stroke="#10b981" fill="#10b981" fillOpacity={0.12} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function buildStrengthsWeaknesses(
  modules: WorkspaceAnalyticsSnapshot["modules"],
): { strengths: PriorityTopic[]; weaknesses: PriorityTopic[] } {
  const topics = buildPriorityTopics(modules);
  const byScoreDesc = [...topics].sort((a, b) => b.avgScore - a.avgScore);
  const byPriorityDesc = [...topics]
    .filter((t) => t.avgScore < MASTERY_THRESHOLD)
    .sort((a, b) => b.priorityScore - a.priorityScore);
  // Skip the single strongest/weakest topic in each direction - those are
  // already the headline callouts elsewhere on the page (topic matrix,
  // batch overview, core insights). This surfaces the next layer down
  // instead of repeating the same one or two facts a third time.
  return {
    strengths: byScoreDesc.slice(1, 4),
    weaknesses: byPriorityDesc.slice(3, 6),
  };
}

export function WorkspaceStrengthsWeaknesses({ modules }: { modules: WorkspaceAnalyticsSnapshot["modules"] }) {
  const { strengths, weaknesses } = useMemo(() => buildStrengthsWeaknesses(modules), [modules]);

  if (strengths.length === 0 && weaknesses.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          Presentation-ready read
        </CardTitle>
        <CardDescription>
          Deeper strengths and weaknesses beyond the headline numbers above &mdash; distinct from the callouts
          elsewhere on this page, meant for a slide or a status update.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Strengths
          </p>
          {strengths.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not enough data yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {strengths.map((t) => (
                <li key={`${t.module}-${t.name}`} className="flex items-start gap-2 text-sm leading-snug">
                  <span className="text-emerald-600 font-bold shrink-0">✓</span>
                  <span>
                    <span className="font-medium">
                      {t.moduleLabel} &mdash; {t.name}
                    </span>
                    : avg {t.avgScore}% across {t.sampleSize} candidates, comfortably clear of the mastery bar.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2 text-red-700">
            <XCircle className="h-4 w-4" />
            Weaknesses
          </p>
          {weaknesses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No further weak spots beyond what's already flagged above.</p>
          ) : (
            <ul className="space-y-2.5">
              {weaknesses.map((t) => (
                <li key={`${t.module}-${t.name}`} className="flex items-start gap-2 text-sm leading-snug">
                  <span className="text-red-600 font-bold shrink-0">✗</span>
                  <span>
                    <span className="font-medium">
                      {t.moduleLabel} &mdash; {t.name}
                    </span>
                    : avg {t.avgScore}%, {t.impact} of {t.sampleSize} candidates still below the mastery bar.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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

type CoreInsight = { tone: "strength" | "risk" | "focus" | "info"; text: string };

function buildCoreInsights(snapshot: WorkspaceAnalyticsSnapshot): CoreInsight[] {
  const { readiness, modules, retakeList, workspace } = snapshot;
  const total = workspace.totalCandidates;
  if (total === 0) return [];

  const insights: CoreInsight[] = [];
  const readyPercent = Math.round((readiness.ready / total) * 100);
  insights.push({
    tone: "info",
    text: `${total} candidates are registered; ${readiness.ready} (${readyPercent}%) are placement ready today, ${readiness.belowThreshold} need a retake somewhere, and ${readiness.incomplete} haven't finished every round yet.`,
  });

  const topics = buildPriorityTopics(modules);
  const priorities = [...topics].filter((t) => t.avgScore < MASTERY_THRESHOLD).sort((a, b) => b.priorityScore - a.priorityScore);
  if (priorities[0]) {
    const t = priorities[0];
    insights.push({
      tone: "focus",
      text: `Biggest opportunity: ${t.moduleLabel} — ${t.name}. ${t.impact} of ${t.sampleSize} candidates are below the mastery bar (avg ${t.avgScore}%) — the single highest-leverage fix available right now.`,
    });
  }

  const entries = (Object.entries(modules) as [WorkspaceRoundTypeKey, ModuleSummary][]).filter(
    ([, summary]) => summary.configured,
  );
  for (const [type, summary] of entries) {
    const weakest = weakestEntry(summary);
    const strongest = strongestEntry(summary);
    if (weakest) {
      insights.push({
        tone: "risk",
        text: `${MODULE_LABELS[type]}: candidates are weakest in ${weakest.name} (avg ${weakest.avgScore}%, ${
          weakest.weakCandidateCount ?? estimateImpact(weakest)
        } struggling) — prioritize this before broader ${MODULE_LABELS[type]} practice.`,
      });
    }
    if (strongest && strongest.name !== weakest?.name) {
      insights.push({
        tone: "strength",
        text: `${MODULE_LABELS[type]}: ${strongest.name} is a genuine strength (avg ${strongest.avgScore}%) — candidates don't need more practice here.`,
      });
    }
  }

  const worstModule = [...entries]
    .filter(([, summary]) => summary.avgPercentageScore !== null)
    .sort((a, b) => (a[1].avgPercentageScore ?? 0) - (b[1].avgPercentageScore ?? 0))[0];
  if (worstModule) {
    const [type, summary] = worstModule;
    const tierTotal = summary.proficiency.good + summary.proficiency.average + summary.proficiency.poor;
    const poorPercent = tierTotal ? Math.round((summary.proficiency.poor / tierTotal) * 100) : 0;
    insights.push({
      tone: "risk",
      text: `${MODULE_LABELS[type]} has the lowest batch-wide average (${summary.avgPercentageScore}%) — ${summary.proficiency.poor} candidates (${poorPercent}%) fall in the Poor/fail tier.`,
    });
  }

  const segments = buildCandidateSegments(retakeList, total);
  const multiPercent = Math.round((segments.multiGap / total) * 100);
  insights.push({
    tone: "risk",
    text: `${segments.multiGap} candidates (${multiPercent}%) are behind in two or more rounds at once — the highest-risk group, since a single-round fix won't be enough for them.`,
  });
  if (segments.topPair) {
    insights.push({
      tone: "info",
      text: `The most common combined gap is ${segments.topPair[0]} + ${segments.topPair[1]} (${segments.topPairCount} candidates) — worth investigating as a shared root cause rather than two unrelated weak spots.`,
    });
  }
  if (segments.singleGap > 0) {
    insights.push({
      tone: "focus",
      text: `${segments.singleGap} candidates are behind in exactly one round — the fastest group to move into "placement ready" with targeted practice.`,
    });
  }

  for (const t of priorities.slice(1, 4)) {
    insights.push({
      tone: "focus",
      text: `${t.moduleLabel} — ${t.name}: ${t.impact} of ${t.sampleSize} candidates (avg ${t.avgScore}%) still need work here.`,
    });
  }

  const strongestOverall = [...topics].sort((a, b) => b.avgScore - a.avgScore)[0];
  if (strongestOverall) {
    insights.push({
      tone: "strength",
      text: `Across every round, ${strongestOverall.moduleLabel} — ${strongestOverall.name} is the strongest area batch-wide (avg ${strongestOverall.avgScore}%).`,
    });
  }

  return insights.slice(0, 15);
}

const INSIGHT_ICON: Record<CoreInsight["tone"], typeof CheckCircle2> = {
  strength: CheckCircle2,
  risk: AlertTriangle,
  focus: Target,
  info: Lightbulb,
};

const INSIGHT_COLOR: Record<CoreInsight["tone"], string> = {
  strength: "text-emerald-600",
  risk: "text-red-600",
  focus: "text-amber-600",
  info: "text-blue-600",
};

export function WorkspaceCoreInsights({ snapshot }: { snapshot: WorkspaceAnalyticsSnapshot }) {
  const insights = useMemo(() => buildCoreInsights(snapshot), [snapshot]);

  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Core insights
        </CardTitle>
        <CardDescription>{insights.length} direct, data-driven takeaways from this batch.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {insights.map((insight, index) => {
            const Icon = INSIGHT_ICON[insight.tone];
            return (
              <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${INSIGHT_COLOR[insight.tone]}`} />
                <span>{insight.text}</span>
              </li>
            );
          })}
        </ul>
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
