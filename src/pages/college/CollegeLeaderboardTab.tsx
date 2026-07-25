import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { collegeApi, type CollegeApiError } from "@/lib/collegeApi";
import type { CollegeLeaderboardResponse, CollegeLeaderboardRow } from "./types";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const MAX_REFRESH_LIMIT = 100;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CollegeLeaderboardTab({
  active,
  onUnauthorized,
}: {
  /** Polling only runs while this tab is the visible one. */
  active: boolean;
  onUnauthorized: () => void;
}) {
  const [rows, setRows] = useState<CollegeLeaderboardRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Read inside the poll callback so the interval never needs to be torn down and
  // recreated as the list grows.
  const loadedCountRef = useRef(0);
  loadedCountRef.current = rows.length;

  const fetchLeaderboard = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        // Refresh re-fetches everything already on screen so polling never truncates
        // a list the user has paged through.
        const limit =
          mode === "refresh"
            ? Math.min(Math.max(loadedCountRef.current, PAGE_SIZE), MAX_REFRESH_LIMIT)
            : PAGE_SIZE;
        const res = await collegeApi.get<CollegeLeaderboardResponse>(
          `/api/college/leaderboard?limit=${limit}`,
        );
        setAvailable(res.available);
        setRows(res.leaderboard);
        setNextCursor(res.nextCursor);
        setLastUpdated(new Date());
      } catch (error) {
        const err = error as CollegeApiError;
        if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
          onUnauthorized();
          return;
        }
        // A failed background poll must not spam toasts; only surface the first load.
        if (mode === "initial") {
          toast.error(err.message || "Failed to load leaderboard");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onUnauthorized],
  );

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await collegeApi.get<CollegeLeaderboardResponse>(
        `/api/college/leaderboard?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setRows((prev) => [...prev, ...res.leaderboard]);
      setNextCursor(res.nextCursor);
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
        onUnauthorized();
        return;
      }
      toast.error(err.message || "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void fetchLeaderboard("initial");
  }, [active, fetchLeaderboard]);

  // Poll every 60s while this tab is open and the browser tab is visible.
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchLeaderboard("refresh");
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [active, fetchLeaderboard]);

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!available) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            The leaderboard opens once the workspace starts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Leaderboard</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()} · refreshes every 60s`
              : "Refreshes every 60s"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchLeaderboard("refresh")}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No candidate has completed a round yet.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Total score</TableHead>
                    <TableHead className="text-right">Rounds done</TableHead>
                    <TableHead>Last completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.rank}</TableCell>
                      <TableCell>{row.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(row.totalScore).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">{row.completedRounds}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(row.lastCompletedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  )}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
