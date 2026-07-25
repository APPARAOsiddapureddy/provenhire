import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

type WorkspaceMembershipRegistration = {
  status?: string;
  workspace?: { name?: string | null } | null;
};

/// Whether this job seeker belongs to at least one workspace, so the sidebar
/// can lead with "Workspace" instead of the general ProvenHire nav for
/// candidates whose primary journey here is a specific employer's workspace.
export function useJobSeekerWorkspaceMembership() {
  const { user } = useAuth();
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHasWorkspace(false);
      setWorkspaceName(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<{ registrations: WorkspaceMembershipRegistration[] }>("/api/user/workspaces/me")
      .then((res) => {
        if (cancelled) return;
        const registrations = (res.registrations ?? []).filter(
          (registration) => registration.status === "registered",
        );
        setHasWorkspace(registrations.length > 0);
        setWorkspaceName(
          registrations.length === 1 ? registrations[0]?.workspace?.name ?? null : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHasWorkspace(false);
          setWorkspaceName(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { hasWorkspace, workspaceName, loading };
}
