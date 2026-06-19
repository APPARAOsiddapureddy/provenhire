import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Edit, Loader2 } from "lucide-react";
import WorkspaceConfirmDialog from "@/components/WorkspaceConfirmDialog";
import type { Workspace } from "./types";
import { WorkspaceActionBar, WorkspaceTabs } from "./WorkspaceAdminComponents";
import { canEditDraft, statusBadgeClass, statusLabel } from "./workspaceUtils";

type WorkspaceConfirmAction = "archive" | "start" | "delete";

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WorkspaceConfirmAction | null>(null);

  const fetchWorkspace = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get<{ workspace: Workspace }>(`/api/workspaces/${id}`);
      setWorkspace(res.workspace);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workspace");
      navigate("/admin/workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWorkspace();
  }, [id]);

  const archiveWorkspace = async () => {
    if (!workspace) return;
    setArchiving(true);
    try {
      const res = await api.patch<{ workspace: Workspace }>(`/api/workspaces/${workspace.id}/status`, { status: "archived" });
      setWorkspace((prev) => (prev ? { ...prev, status: res.workspace.status } : prev));
      toast.success("Workspace archived.");
      setConfirmAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  };

  const startWorkspace = async () => {
    if (!workspace) return;
    setStarting(true);
    try {
      const res = await api.post<{ workspace: Workspace }>(`/api/workspaces/${workspace.id}/start`, {});
      setWorkspace((prev) => (prev ? { ...prev, status: res.workspace.status } : prev));
      toast.success("Workspace started.");
      setConfirmAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Start failed");
    } finally {
      setStarting(false);
    }
  };

  const copyCode = async () => {
    if (!workspace) return;
    await navigator.clipboard?.writeText(workspace.code);
    toast.success("Workspace code copied.");
  };

  const deleteWorkspace = async () => {
    if (!workspace) return;
    setDeleting(true);
    try {
      await api.del(`/api/workspaces/${workspace.id}`);
      toast.success("Workspace deleted.");
      setConfirmAction(null);
      navigate("/admin/workspaces");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !workspace) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const confirmCopy = confirmAction
    ? {
        archive: {
          title: `Archive ${workspace.name}?`,
          description: "Active MCQ sessions will be auto-evaluated.",
          confirmLabel: "Yes, Archive",
          variant: "default" as const,
          loading: archiving,
          onConfirm: archiveWorkspace,
        },
        start: {
          title: `Start ${workspace.name}?`,
          description: "Registered users will be able to attempt rounds.",
          confirmLabel: "Yes, Start",
          variant: "default" as const,
          loading: starting,
          onConfirm: startWorkspace,
        },
        delete: {
          title: `Delete ${workspace.name}?`,
          description: `This permanently removes ${workspace.code} and related setup data.`,
          confirmLabel: "Yes, Delete",
          variant: "destructive" as const,
          loading: deleting,
          onConfirm: deleteWorkspace,
        },
      }[confirmAction]
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/workspaces")}>
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Workspaces</span>
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold truncate">{workspace.name}</h1>
                  <Badge variant="outline" className={statusBadgeClass(workspace.status)}>
                    {statusLabel(workspace.status)}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">{workspace.organization}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEditDraft(workspace) && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/workspaces/new?workspaceId=${workspace.id}`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Continue draft
                  </Link>
                </Button>
              )}
              <WorkspaceActionBar
                workspace={workspace}
                onStart={() => setConfirmAction("start")}
                starting={starting}
                onArchive={() => setConfirmAction("archive")}
                archiving={archiving}
                onDelete={() => setConfirmAction("delete")}
                deleting={deleting}
                onCopyCode={copyCode}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {workspace.status === "archived" && (
          <Card className="border-destructive/30">
            <CardContent className="p-4 text-sm text-muted-foreground">
              This workspace is archived. Registration management is locked and candidate-facing lookup is hidden.
            </CardContent>
          </Card>
        )}
        <WorkspaceTabs workspace={workspace} onRefresh={fetchWorkspace} />
      </main>
      {confirmCopy ? (
        <WorkspaceConfirmDialog
          open={Boolean(confirmAction)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          cancelLabel="No"
          loading={confirmCopy.loading}
          variant={confirmCopy.variant}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          onConfirm={confirmCopy.onConfirm}
        />
      ) : null}
    </div>
  );
}
