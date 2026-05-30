import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Archive, ArrowLeft, ClipboardList, Eye, Play, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { Workspace, WorkspaceListResponse, WorkspaceStatus } from "./types";
import { formatDateTime, statusBadgeClass, statusLabel, WORKSPACE_STATUSES } from "./workspaceUtils";

const PAGE_SIZE = 20;

export default function AdminWorkspacesPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<WorkspaceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("organization", search.trim());
    return params.toString();
  }, [page, status, search]);

  const fetchWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await api.get<WorkspaceListResponse>(`/api/workspaces?${query}`);
      setWorkspaces(res.workspaces ?? []);
      setTotalPages(Math.max(1, res.pagination?.totalPages ?? 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorkspaces();
  }, [query]);

  const archiveWorkspace = async (workspace: Workspace) => {
    if (!window.confirm(`Archive ${workspace.name}? Active MCQ sessions will be auto-evaluated.`)) return;
    setArchivingId(workspace.id);
    try {
      await api.patch(`/api/workspaces/${workspace.id}/status`, { status: "archived" });
      toast.success("Workspace archived.");
      await fetchWorkspaces();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed");
    } finally {
      setArchivingId(null);
    }
  };

  const startWorkspace = async (workspace: Workspace) => {
    if (!window.confirm(`Start ${workspace.name}? Registered users will be able to attempt rounds.`)) return;
    setStartingId(workspace.id);
    try {
      await api.post(`/api/workspaces/${workspace.id}/start`, {});
      toast.success("Workspace started.");
      await fetchWorkspaces();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Start failed");
    } finally {
      setStartingId(null);
    }
  };

  const deleteWorkspace = async (workspace: Workspace) => {
    if (!window.confirm(`Delete ${workspace.name} (${workspace.code})? This permanently removes the workspace and related setup data.`)) return;
    setDeletingId(workspace.id);
    try {
      await api.del(`/api/workspaces/${workspace.id}`);
      toast.success("Workspace deleted.");
      setWorkspaces((prev) => prev.filter((item) => item.id !== workspace.id));
      await fetchWorkspaces();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/dashboard")}>
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate">Workspaces</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Create and manage hiring workspaces</p>
              </div>
            </div>
            <Button asChild>
              <Link to="/admin/workspaces/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Workspace
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Workspace Directory
                </CardTitle>
                <CardDescription>Drafts, active events, ended events, and archived workspaces owned by this admin.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchWorkspaces} disabled={loading}>
                <RefreshCw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,220px] gap-3 mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search organization..."
                  className="pl-9"
                />
              </div>
              <Select
                value={status}
                onValueChange={(value: WorkspaceStatus | "all") => {
                  setPage(1);
                  setStatus(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACE_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "all" ? "All statuses" : statusLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {loading ? (
              <div className="py-14 text-center text-muted-foreground">Loading workspaces...</div>
            ) : workspaces.length === 0 ? (
              <div className="py-14 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No workspaces found</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first workspace to start configuring rounds.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Rounds</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspaces.map((workspace) => (
                      <TableRow key={workspace.id}>
                        <TableCell>
                          <div className="font-medium">{workspace.name}</div>
                          <div className="text-xs text-muted-foreground">{workspace.organization}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{workspace.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(workspace.status)}>
                            {statusLabel(workspace.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{workspace.accessMode === "invite_only" ? "Invite-only" : "Public"}</TableCell>
                        <TableCell>
                          {workspace._count?.rounds ?? 0}/{workspace.totalRounds}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{formatDateTime(workspace.startAt)}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(workspace.endAt)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                workspace.status === "draft"
                                  ? navigate(`/admin/workspaces/new?workspaceId=${workspace.id}`)
                                  : navigate(`/admin/workspaces/${workspace.id}`)
                              }
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {workspace.status === "draft" ? "Continue" : "View"}
                            </Button>
                            {workspace.status !== "draft" && workspace.status !== "archived" && (
                              <Button variant="outline" size="sm" disabled={archivingId === workspace.id} onClick={() => archiveWorkspace(workspace)}>
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                            {workspace.status === "published" && (
                              <Button variant="outline" size="sm" disabled={startingId === workspace.id} onClick={() => startWorkspace(workspace)}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {workspace.status !== "started" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deletingId === workspace.id}
                                onClick={() => deleteWorkspace(workspace)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
