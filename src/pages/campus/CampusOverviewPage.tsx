import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import CampusShell from "./CampusShell";

type Drive = {
  id: string;
  name: string;
  code: string;
  status: "draft" | "published" | "started" | "ended" | "archived";
  targetRole: string;
  startAt: string;
  endAt: string;
  totalRounds: number;
  studentCount: number;
};

type Overview = {
  institution: { id: string; name: string; status: string };
  totals: { drives: number; liveDrives: number; draftDrives: number; students: number };
  attemptsByRound: Record<string, { completed: number; inProgress: number }>;
  drives: Drive[];
};

const ROUND_LABELS: Record<string, string> = {
  mcq: "Aptitude",
  coding: "Coding",
  sql: "SQL",
  interview: "AI Interview",
};

const STATUS_STYLE: Record<Drive["status"], string> = {
  draft: "bg-white/[0.06] text-muted-foreground",
  published: "bg-primary/15 text-primary",
  started: "bg-emerald-500/15 text-emerald-400",
  ended: "bg-white/[0.06] text-muted-foreground",
  archived: "bg-white/[0.06] text-muted-foreground",
};

export default function CampusOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.get<Overview>("/api/institutions/me/overview");
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your overview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = data?.totals;

  return (
    <CampusShell
      title="Overview"
      description="Everything your placement cell is running, in one place."
      actions={
        <Button asChild>
          <Link to="/admin/workspaces/new">
            <Plus className="mr-2 h-4 w-4" />
            New drive
          </Link>
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading your overview…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* One number that matters most, then the supporting counts. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Students", value: totals?.students ?? 0 },
              { label: "Drives", value: totals?.drives ?? 0 },
              { label: "Live now", value: totals?.liveDrives ?? 0 },
              { label: "In draft", value: totals?.draftDrives ?? 0 },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {Object.keys(data?.attemptsByRound ?? {}).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Round progress</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Completed and in-progress attempts across every drive.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(data!.attemptsByRound).map(([roundType, counts]) => (
                  <Card key={roundType}>
                    <CardContent className="p-5">
                      <p className="text-sm font-medium">{ROUND_LABELS[roundType] ?? roundType}</p>
                      <p className="mt-3 text-2xl font-semibold tabular-nums">{counts.completed}</p>
                      <p className="text-xs text-muted-foreground">completed</p>
                      {counts.inProgress > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {counts.inProgress} in progress
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Your drives</h2>
              {(data?.drives.length ?? 0) > 0 && (
                <Link
                  to="/campus/drives"
                  className="text-sm text-primary hover:underline shrink-0"
                >
                  View all
                </Link>
              )}
            </div>

            {(data?.drives.length ?? 0) === 0 ? (
              <Card className="mt-5">
                <CardContent className="py-14 text-center space-y-5">
                  <div>
                    <p className="font-medium">No drives yet</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Create your first drive to start assessing a batch.
                    </p>
                  </div>
                  <Button asChild>
                    <Link to="/admin/workspaces/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create a drive
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-5 space-y-3">
                {data!.drives.slice(0, 5).map((drive) => (
                  <Link
                    key={drive.id}
                    to={`/admin/workspaces/${drive.id}`}
                    className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <p className="font-medium truncate">{drive.name}</p>
                          <Badge className={`shrink-0 ${STATUS_STYLE[drive.status]}`}>
                            {drive.status === "started" ? "live" : drive.status}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {drive.targetRole} · {drive.studentCount} student
                          {drive.studentCount === 1 ? "" : "s"} · {drive.totalRounds} rounds
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </CampusShell>
  );
}
