import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type QueueItem = {
  id: string;
  createdAt: string;
  candidate: { id: string; name: string | null; email: string | null };
  aiInterview: {
    id: string;
    totalScore: number | null;
    completedAt: string | null;
    status: string;
    jobRole: string | null;
  };
};

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const AIInterviewReview = () => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: QueueItem[] }>("/api/admin/ai-interview-queue/pending");
      setItems(res.items ?? []);
    } catch {
      toast.error("Could not load pending reviews");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setActing(id);
    try {
      await api.post(`/api/admin/ai-interview-queue/${id}/approve`, {});
      toast.success("Approved — candidate notified");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    setActing(id);
    try {
      await api.post(`/api/admin/ai-interview-queue/${id}/reject`, {});
      toast.success("Rejected — candidate notified");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending reviews</CardTitle>
        <CardDescription>
          After each AI interview submission, candidates appear here until you approve or reject them for the Human
          Expert Interview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending reviews.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{row.candidate.name ?? "Candidate"}</p>
                  <p className="text-xs text-muted-foreground">{row.candidate.email}</p>
                  <p className="text-sm mt-2">
                    <span className="text-muted-foreground">AI score: </span>
                    <strong>{row.aiInterview.totalScore ?? "—"}</strong>
                    <span className="text-muted-foreground"> · Submitted: </span>
                    {formatTime(row.aiInterview.completedAt ?? row.createdAt)}
                  </p>
                  {row.aiInterview.jobRole && (
                    <p className="text-xs text-muted-foreground mt-1">Role: {row.aiInterview.jobRole}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    disabled={acting != null}
                    onClick={() => void approve(row.id)}
                  >
                    {acting === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting != null}
                    onClick={() => void reject(row.id)}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AIInterviewReview;
