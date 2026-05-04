import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type SyncState = "syncing" | "complete" | "failed";

type SyncResponse = {
  complete: boolean;
  status?: string;
  totalScore?: number | null;
  badgeLevel?: string | null;
  verdict?: string | null;
  error?: string | null;
};

export default function AntigravityReturnPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const handoffId = useMemo(() => params.get("handoff_id")?.trim() || "", [params]);
  const [state, setState] = useState<SyncState>("syncing");
  const [message, setMessage] = useState("Antigravity is generating the final report.");
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const attemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function sync() {
      if (!handoffId) {
        setState("failed");
        setMessage("The return link is missing its handoff id.");
        return;
      }

      attemptsRef.current += 1;
      try {
        const payload = await api.post<SyncResponse>(
          `/api/ai-interview-adapter/handoff-sync/${handoffId}`,
          {}
        );
        if (cancelled) return;
        setResult(payload);

        if (payload.complete) {
          setState("complete");
          setMessage("Your interview report has been safely returned to ProvenHire.");
          return;
        }

        if (payload.status === "failed" || payload.status === "expired") {
          setState("failed");
          setMessage(payload.error || `The Antigravity handoff is ${payload.status}.`);
          return;
        }

        setMessage(
          attemptsRef.current <= 2
            ? "Antigravity is generating the final report."
            : "Still working. Final scoring can take a little longer on the last turn."
        );
        timer = setTimeout(sync, attemptsRef.current < 20 ? 3000 : 8000);
      } catch (e) {
        if (cancelled) return;
        setMessage(e instanceof Error ? e.message : "Could not sync the Antigravity report yet.");
        timer = setTimeout(sync, 5000);
      }
    }

    void sync();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [handoffId, retryNonce]);

  const icon =
    state === "complete" ? (
      <CheckCircle2 className="h-10 w-10 text-green-500" />
    ) : state === "failed" ? (
      <AlertTriangle className="h-10 w-10 text-amber-500" />
    ) : (
      <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="items-center text-center">
          {icon}
          <CardTitle className="mt-4">
            {state === "complete"
              ? "Interview Report Ready"
              : state === "failed"
                ? "Return Sync Needs Attention"
                : "Generating Interview Report"}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex justify-between gap-4">
              <span>Handoff</span>
              <span className="font-mono">{handoffId ? handoffId.slice(0, 8) : "missing"}</span>
            </div>
            {result?.status && (
              <div className="mt-2 flex justify-between gap-4">
                <span>Status</span>
                <span className="font-mono">{result.status}</span>
              </div>
            )}
            {result?.totalScore != null && (
              <div className="mt-2 flex justify-between gap-4">
                <span>Score</span>
                <span className="font-mono">{result.totalScore}/100</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {state === "syncing" && (
              <Button
                variant="outline"
                onClick={() => {
                  attemptsRef.current = 0;
                  setRetryNonce((value) => value + 1);
                  setMessage("Retrying report sync.");
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Keep Waiting
              </Button>
            )}
            <Button onClick={() => navigate("/dashboard/jobseeker")}>
              {state === "complete" ? "Back to Dashboard" : "Go to Dashboard"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
