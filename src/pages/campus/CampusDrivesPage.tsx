import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Loader2, Plus, Users } from "lucide-react";
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

type Overview = { drives: Drive[] };

const STATUS_STYLE: Record<Drive["status"], string> = {
  draft: "bg-white/[0.06] text-muted-foreground",
  published: "bg-primary/15 text-primary",
  started: "bg-emerald-500/15 text-emerald-400",
  ended: "bg-white/[0.06] text-muted-foreground",
  archived: "bg-white/[0.06] text-muted-foreground",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CampusDrivesPage() {
  const [drives, setDrives] = useState<Drive[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.get<Overview>("/api/institutions/me/overview");
        if (!cancelled) setDrives(result.drives);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your drives.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CampusShell
      title="Drives"
      description="Each drive assesses one batch. Students join with its code."
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
          Loading your drives…
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
      ) : (drives?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-5">
            <div>
              <p className="font-medium">No drives yet</p>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
                A drive is one batch working through your chosen rounds. Create one to get started.
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
        <div className="space-y-4">
          {drives!.map((drive) => (
            <Card key={drive.id}>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-medium">{drive.name}</h2>
                      <Badge className={STATUS_STYLE[drive.status]}>
                        {drive.status === "started" ? "live" : drive.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{drive.targetRole}</p>
                    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Join code</dt>
                        <dd className="mt-0.5 font-mono text-xs">{drive.code}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Students</dt>
                        <dd className="mt-0.5 tabular-nums">{drive.studentCount}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Rounds</dt>
                        <dd className="mt-0.5 tabular-nums">{drive.totalRounds}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Window</dt>
                        <dd className="mt-0.5">
                          {formatDate(drive.startAt)} – {formatDate(drive.endAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/admin/workspaces/${drive.id}/analytics`}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Analytics
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/admin/workspaces/${drive.id}`}>
                        <Users className="mr-2 h-4 w-4" />
                        Students
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link to={`/admin/workspaces/${drive.id}`}>
                        Manage
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CampusShell>
  );
}
