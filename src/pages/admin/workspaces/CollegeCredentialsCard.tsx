import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CollegeCredentials } from "@/pages/college/types";

const LOGIN_PATH = "/c/login";

function CredentialRow({
  label,
  value,
  masked,
  onCopy,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">
          {masked ? "•".repeat(Math.max(value.length, 8)) : value}
        </code>
        <Button variant="outline" size="icon" onClick={onCopy} title={`Copy ${label}`}>
          <Copy className="h-4 w-4" aria-hidden />
          <span className="sr-only">{`Copy ${label}`}</span>
        </Button>
      </div>
    </div>
  );
}

/** Shows the login issued to the college so an admin can share it with them. */
export default function CollegeCredentialsCard({
  workspaceId,
  workspaceStatus,
}: {
  workspaceId: string;
  /** Re-fetches when the workspace is archived so the Inactive badge stays accurate. */
  workspaceStatus: string;
}) {
  const [credentials, setCredentials] = useState<CollegeCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ credentials: CollegeCredentials }>(
          `/api/workspaces/${workspaceId}/college-credentials`,
        );
        if (!cancelled) {
          setCredentials(res.credentials);
          setNotFound(false);
        }
      } catch (error) {
        // Workspaces created before this feature have no login; that is not an error.
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspaceStatus]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading college login…
        </CardContent>
      </Card>
    );
  }

  if (notFound || !credentials) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No college login exists for this workspace. Logins are issued automatically
          for workspaces created from now on.
        </CardContent>
      </Card>
    );
  }

  const loginUrl = `${window.location.origin}${LOGIN_PATH}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
          <CardTitle className="text-base">College login</CardTitle>
        </div>
        <Badge
          variant="outline"
          className={
            credentials.isActive
              ? "bg-green-100 text-green-800"
              : "bg-destructive/10 text-destructive"
          }
        >
          {credentials.isActive ? "Active" : "Inactive"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Share these with the college so they can track this workspace at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{loginUrl}</code>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CredentialRow
            label="Login ID"
            value={credentials.userId}
            onCopy={() => copy("Login ID", credentials.userId)}
          />
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Password
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setRevealed((prev) => !prev)}
              >
                {revealed ? (
                  <EyeOff className="mr-1 h-3 w-3" aria-hidden />
                ) : (
                  <Eye className="mr-1 h-3 w-3" aria-hidden />
                )}
                {revealed ? "Hide" : "Reveal"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">
                {revealed
                  ? credentials.password
                  : "•".repeat(Math.max(credentials.password.length, 8))}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy("Password", credentials.password)}
                title="Copy password"
              >
                <Copy className="h-4 w-4" aria-hidden />
                <span className="sr-only">Copy password</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              copy(
                "Credentials",
                `ProvenHire college portal: ${loginUrl}\nLogin ID: ${credentials.userId}\nPassword: ${credentials.password}`,
              )
            }
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden />
            Copy all
          </Button>
        </div>
        {!credentials.isActive && (
          <p className="text-xs text-destructive">
            This login is disabled because the workspace is archived. The college can no
            longer sign in.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
