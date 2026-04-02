import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Loader2 } from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";

interface FlaggedTest {
  id: string;
  testType: string;
  severity: string;
  message?: string;
}

type SessionCountRow = {
  eventType: string;
  count: number;
  testType: string;
  lastOccurredAt: string;
  thresholds: { warn: number; stop: number };
};

const ProctoringReview = () => {
  const [flaggedTests, setFlaggedTests] = useState<FlaggedTest[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [sessionBreakdown, setSessionBreakdown] = useState<SessionCountRow[]>([]);
  const [sessionBreakdownId, setSessionBreakdownId] = useState<string | null>(null);
  const [sessionCountsLoading, setSessionCountsLoading] = useState(false);

  useEffect(() => {
    setFlaggedTests([]);
  }, []);

  const loadSessionCounts = async () => {
    const id = sessionIdInput.trim();
    if (!id) {
      toast.error("Enter a session ID (testId / interview id from proctoring export)");
      return;
    }
    setSessionCountsLoading(true);
    try {
      const res = await api.get<{ sessionId: string; breakdown: SessionCountRow[] }>(
        `/api/admin/proctoring/session-counts/${encodeURIComponent(id)}`,
      );
      setSessionBreakdown(res.breakdown ?? []);
      setSessionBreakdownId(res.sessionId ?? id);
      if (!res.breakdown?.length) toast.message("No counted signals for this session yet");
    } catch {
      toast.error("Could not load session counts");
      setSessionBreakdown([]);
      setSessionBreakdownId(null);
    } finally {
      setSessionCountsLoading(false);
    }
  };

  const downloadProctoringCsv = async () => {
    const token = getAuthToken();
    try {
      const r = await fetch("/api/admin/export-proctoring-events", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("failed");
      const csv = await r.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "provenhire-proctoring-events.csv";
      a.click();
      URL.revokeObjectURL(u);
      toast.success("Proctoring events export downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Proctoring Review</CardTitle>
          <CardDescription>Review flagged verification sessions.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 w-fit" onClick={downloadProctoringCsv}>
          <Download className="h-4 w-4 sm:mr-2" />
          Download CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Signal breakdown (session counts)</h4>
          <p className="text-xs text-muted-foreground">
            Paste a session ID from the proctoring CSV export (column &quot;Session ID&quot;) to see per-signal counts and warn/stop thresholds.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
            <Input
              placeholder="Session ID"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              className="font-mono text-sm"
            />
            <Button type="button" variant="secondary" onClick={loadSessionCounts} disabled={sessionCountsLoading}>
              {sessionCountsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
            </Button>
          </div>
          {sessionBreakdownId && (
            <div className="rounded-md border text-sm overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="p-2 font-medium">Signal</th>
                    <th className="p-2 font-medium">Count</th>
                    <th className="p-2 font-medium">Warn @</th>
                    <th className="p-2 font-medium">Stop @</th>
                    <th className="p-2 font-medium">Test</th>
                    <th className="p-2 font-medium">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionBreakdown.map((row) => (
                    <tr key={row.eventType} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{row.eventType}</td>
                      <td className="p-2">{row.count}</td>
                      <td className="p-2">{row.thresholds.warn}</td>
                      <td className="p-2">{row.thresholds.stop}</td>
                      <td className="p-2 text-xs text-muted-foreground">{row.testType}</td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.lastOccurredAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Flagged sessions</h4>
          {flaggedTests.length === 0 ? (
            <div className="text-sm text-muted-foreground">No flagged sessions available.</div>
          ) : (
            <div className="space-y-2">
              {flaggedTests.map((test) => (
                <div key={test.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{test.testType}</div>
                    <div className="text-sm text-muted-foreground">{test.message || "Flagged for review"}</div>
                  </div>
                  <Badge variant="secondary">{test.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProctoringReview;
