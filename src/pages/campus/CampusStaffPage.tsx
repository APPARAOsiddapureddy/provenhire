import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import CampusShell from "./CampusShell";

type StaffRole = "owner" | "manager" | "reviewer";

type Member = {
  id: string;
  role: StaffRole;
  removedAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

const ROLE_HELP: Record<StaffRole, string> = {
  owner: "Full control, including staff and ownership.",
  manager: "Can run drives, rosters and decisions.",
  reviewer: "Read-only access to results.",
};

export default function CampusStaffPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("manager");
  const [submitting, setSubmitting] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ members: Member[] }>("/api/institutions/me/staff");
      setMembers(result.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your placement cell.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/institutions/me/staff", { email: email.trim().toLowerCase(), role });
      toast.success("Added to your placement cell.");
      setEmail("");
      setRole("manager");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that person.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (member: Member) => {
    setPendingRemoval(null);
    try {
      await api.del(`/api/institutions/me/staff/${encodeURIComponent(member.user.id)}`);
      toast.success("Access removed.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that person.");
    }
  };

  const active = members.filter((m) => !m.removedAt);
  const removed = members.filter((m) => m.removedAt);

  return (
    <CampusShell
      title="Placement cell"
      description="Everyone here can see and run your drives. Access is scoped to your institution only."
    >
      <div className="space-y-8">
        <Card>
          <CardContent className="p-6">
            <h2 className="font-medium">Add someone</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              They need a ProvenHire account first — ask them to sign up, then add their email here.
              We never set a password on someone else&rsquo;s behalf.
            </p>
            <form onSubmit={handleAdd} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@yourcollege.edu"
                  className="h-11"
                />
              </div>
              <div className="space-y-2 sm:w-52">
                <Label htmlFor="staff-role">Access</Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger id="staff-role" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="h-11" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add
                  </>
                )}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
          </CardContent>
        </Card>

        <section>
          <h2 className="text-lg font-semibold">
            Current access
            {active.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {active.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div className="flex items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Loading…
            </div>
          ) : error ? (
            <Card className="mt-5">
              <CardContent className="py-10 text-center space-y-4">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-5 space-y-3">
              {active.map((member) => (
                <div
                  key={member.id}
                  className="group flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 transition-all duration-300 hover:border-primary/20 hover:bg-primary/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{member.user.name || member.user.email}</p>
                    {member.user.name && (
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {member.user.email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className="capitalize">
                      {member.role}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setPendingRemoval(member)}
                      aria-label={`Remove ${member.user.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {removed.length > 0 && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {removed.length} removed
                  </summary>
                  <div className="mt-3 space-y-2">
                    {removed.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-5 py-3 text-sm text-muted-foreground"
                      >
                        <span className="truncate">{member.user.email}</span>
                        <span className="shrink-0 capitalize">{member.role}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.user.email} will lose access to every drive at your institution.
              Their account itself is not deleted, and you can add them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRemoval && void handleRemove(pendingRemoval)}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CampusShell>
  );
}
