import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import CampusShell from "./CampusShell";
import { useInstitution, type Institution } from "./useInstitution";

/// The supplementary profile, deferred out of signup on purpose. Grouped so an
/// executive can fill in one group and leave, rather than facing a wall of
/// twelve equally-weighted inputs.
const FIELD_GROUPS: Array<{
  heading: string;
  hint: string;
  fields: Array<{ key: keyof Institution; label: string; type?: string; placeholder?: string }>;
}> = [
  {
    heading: "Institution",
    hint: "Shown to students on the drives you publish.",
    fields: [
      { key: "name", label: "Institution name" },
      { key: "website", label: "Website", placeholder: "https://" },
      { key: "studentCount", label: "Approx. students", type: "number" },
    ],
  },
  {
    heading: "Placement cell contact",
    hint: "Who we reach out to about your drives.",
    fields: [
      { key: "placementCellHead", label: "Placement cell head" },
      { key: "phone", label: "Phone" },
    ],
  },
  {
    heading: "Accreditation",
    hint: "Optional. Helps us verify your institution faster.",
    fields: [
      { key: "affiliation", label: "Affiliated university" },
      { key: "aicteCode", label: "AICTE code" },
      { key: "naacGrade", label: "NAAC grade" },
    ],
  },
  {
    heading: "Address",
    hint: "Optional.",
    fields: [
      { key: "addressLine", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "pincode", label: "PIN code" },
      { key: "country", label: "Country" },
    ],
  },
];

type FormState = Record<string, string>;

function toFormState(institution: Institution): FormState {
  const state: FormState = {};
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      const value = institution[field.key];
      state[field.key as string] = value == null ? "" : String(value);
    }
  }
  return state;
}

export default function CampusSettingsPage() {
  const { institution, loading, error, refetch } = useInstitution();
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (institution) setForm(toFormState(institution));
  }, [institution]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!institution) return;
    setSaving(true);
    try {
      // Empty strings become null server-side, so clearing a field works.
      const payload: Record<string, unknown> = {};
      for (const group of FIELD_GROUPS) {
        for (const field of group.fields) {
          const raw = form[field.key as string] ?? "";
          if (field.key === "name") {
            if (raw.trim()) payload.name = raw.trim();
          } else if (field.type === "number") {
            payload[field.key as string] = raw.trim() === "" ? null : Number(raw);
          } else {
            payload[field.key as string] = raw.trim();
          }
        }
      }
      await api.patch("/api/institutions/me", payload);
      toast.success("Saved.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CampusShell
      title="Settings"
      description="Your institution profile. Everything here is optional — fill it in whenever it suits you."
    >
      {loading ? (
        <div className="flex items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading…
        </div>
      ) : error || !institution ? (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              {error ?? "Could not load your institution."}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Card>
            <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {institution.status === "approved" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                ) : (
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                )}
                <div>
                  <p className="font-medium">
                    {institution.status === "approved"
                      ? "Verified"
                      : institution.status === "suspended"
                        ? "Suspended"
                        : "Verification in progress"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {institution.status === "approved"
                      ? "You can publish drives to students."
                      : institution.status === "suspended"
                        ? "Contact ProvenHire support to restore access."
                        : "You can build drives now. Publishing unlocks once we verify you."}
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Sign-in email <span className="text-foreground">{institution.contactEmail}</span>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit} className="space-y-6">
            {FIELD_GROUPS.map((group) => (
              <Card key={group.heading}>
                <CardContent className="p-6">
                  <h2 className="font-medium">{group.heading}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{group.hint}</p>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.key as string} className="space-y-2">
                        <Label htmlFor={`field-${String(field.key)}`}>{field.label}</Label>
                        <Input
                          id={`field-${String(field.key)}`}
                          type={field.type ?? "text"}
                          placeholder={field.placeholder}
                          value={form[field.key as string] ?? ""}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, [field.key as string]: e.target.value }))
                          }
                          className="h-11"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="flex items-center gap-3">
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </CampusShell>
  );
}
