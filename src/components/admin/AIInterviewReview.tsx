import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InterviewReplayView, type InterviewReplayPayload } from "@/components/admin/InterviewReplayView";

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

type QuestionAnalyticRow = {
  questionBankId: string | null;
  prompt: string;
  role: string | null;
  experienceLevel: string | null;
  difficulty: number | null;
  usageCount: number;
  avgOverall: number;
  discriminationFlag: string;
  avgConceptual: number;
  avgReasoning: number;
  avgCommunication: number;
};

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const AIInterviewReview = () => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<QuestionAnalyticRow[]>([]);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayData, setReplayData] = useState<InterviewReplayPayload | null>(null);
  const [replayInterviewId, setReplayInterviewId] = useState<string | null>(null);

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

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await api.get<{ analytics: QuestionAnalyticRow[] }>("/api/admin/questions/analytics");
      setAnalytics(res.analytics ?? []);
    } catch {
      toast.error("Could not load question analytics");
      setAnalytics([]);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const openReplay = async (aiInterviewId: string) => {
    setReplayInterviewId(aiInterviewId);
    setReplayOpen(true);
    setReplayLoading(true);
    setReplayData(null);
    try {
      const res = await api.get<InterviewReplayPayload>(`/api/admin/interviews/${aiInterviewId}/replay`);
      setReplayData(res);
    } catch {
      toast.error("Could not load session replay");
      setReplayOpen(false);
    } finally {
      setReplayLoading(false);
    }
  };

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
    <>
      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session replay</DialogTitle>
            <DialogDescription>
              Turn timing, agent branch, transcript, per-question scores, and proctoring events.
              {replayInterviewId ? ` Interview ID: ${replayInterviewId}` : ""}
            </DialogDescription>
          </DialogHeader>
          {replayLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : replayData ? (
            <InterviewReplayView data={replayData} />
          ) : null}
        </DialogContent>
      </Dialog>

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

      <Card>
        <CardHeader>
          <CardTitle>Question analytics</CardTitle>
          <CardDescription>
            Average scores and usage from interview question results. Flags highlight items that may be too hard or too
            easy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : analytics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No analytics yet (complete interviews with scored questions).</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-2 font-medium">Prompt</th>
                    <th className="p-2 font-medium">N</th>
                    <th className="p-2 font-medium">Avg</th>
                    <th className="p-2 font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.slice(0, 40).map((row) => (
                    <tr key={row.questionBankId ?? row.prompt} className="border-b border-border/70 align-top">
                      <td className="p-2 max-w-[28rem]">
                        <span className="line-clamp-2">{row.prompt}</span>
                        {(row.role || row.experienceLevel) && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {[row.role, row.experienceLevel].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="p-2 tabular-nums">{row.usageCount}</td>
                      <td className="p-2 tabular-nums">{row.avgOverall}</td>
                      <td className="p-2 text-xs">{row.discriminationFlag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default AIInterviewReview;
