import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { collegeApi, type CollegeApiError } from "@/lib/collegeApi";
import CollegeConfirmModal from "./CollegeConfirmModal";
import type { CollegeRegistration, CollegeRegistrationsResponse } from "./types";

type PendingAction = {
  registration: CollegeRegistration;
  type: "remove" | "restore";
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function CollegeRegistrationsTab({
  active,
  onUnauthorized,
}: {
  active: boolean;
  onUnauthorized: () => void;
}) {
  const [registrations, setRegistrations] = useState<CollegeRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The full cohort is fetched once; searching filters that state, so typing costs
  // nothing and needs no debounce.
  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await collegeApi.get<CollegeRegistrationsResponse>(
        "/api/college/registrations",
      );
      setRegistrations(res.registrations);
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
        onUnauthorized();
        return;
      }
      toast.error(err.message || "Failed to load joined users");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!active) return;
    void fetchRegistrations();
  }, [active, fetchRegistrations]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return registrations;
    return registrations.filter((registration) =>
      [registration.name, registration.email, registration.college]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query)),
    );
  }, [registrations, query]);

  const confirmAction = async () => {
    if (!pending) return;
    setSubmitting(true);
    const { registration, type } = pending;
    try {
      if (type === "remove") {
        await collegeApi.delete(
          `/api/college/registrations/${encodeURIComponent(registration.userId)}`,
        );
        toast.success(`${registration.name || registration.email} removed`);
      } else {
        await collegeApi.post(
          `/api/college/registrations/${encodeURIComponent(registration.userId)}/restore`,
        );
        toast.success(`${registration.name || registration.email} restored`);
      }
      setPending(null);
      await fetchRegistrations();
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.status === 401 || err.code === "ACCOUNT_INACTIVE") {
        onUnauthorized();
        return;
      }
      toast.error(err.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-base">Joined Users</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : query
                  ? `${visible.length} of ${registrations.length} candidates`
                  : `${registrations.length} candidate${registrations.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="pl-9"
              placeholder="Search by name, email or college"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search joined users"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {query
                ? `No candidates match "${search.trim()}".`
                : "No one has joined this workspace yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((registration) => {
                    const removed = registration.status === "removed";
                    return (
                      <TableRow key={registration.userId}>
                        <TableCell className="font-medium">
                          {registration.name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {registration.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {registration.college || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(registration.registeredAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              removed
                                ? "bg-destructive/10 text-destructive"
                                : "bg-green-100 text-green-800"
                            }
                          >
                            {removed ? "Removed" : "Registered"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {removed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPending({ registration, type: "restore" })
                              }
                            >
                              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setPending({ registration, type: "remove" })
                              }
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CollegeConfirmModal
        open={pending !== null}
        title={
          pending?.type === "restore"
            ? "Restore this candidate?"
            : "Remove this candidate?"
        }
        description={
          pending ? (
            <>
              <span className="font-medium text-foreground">
                {pending.registration.name || pending.registration.email}
              </span>{" "}
              {pending.type === "restore"
                ? "will regain access to this workspace."
                : "will lose access to this workspace, and any assessment they have in progress will be discarded."}
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Yes"
        cancelLabel="No"
        variant={pending?.type === "restore" ? "default" : "destructive"}
        loading={submitting}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirmAction}
      />
    </>
  );
}
