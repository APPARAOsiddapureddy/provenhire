import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Briefcase, Search } from "lucide-react";
import { api } from "@/lib/api";
import { INTERVIEWER_ROLES } from "@/data/interviewerRoles";

const TECHNICAL_TITLES = [
  ...INTERVIEWER_ROLES.filter((r) => r.track === "technical").map((r) => r.label),
  "Other",
];
const NON_TECHNICAL_TITLES = [
  ...INTERVIEWER_ROLES.filter((r) => r.track === "non_technical").map((r) => r.label),
  "Other",
];

interface JobTitleModalProps {
  open: boolean;
  roleType: "technical" | "non_technical";
  onSave: (title: string) => void;
}

const JobTitleModal = ({ open, roleType, onSave }: JobTitleModalProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const titles = roleType === "technical" ? TECHNICAL_TITLES : NON_TECHNICAL_TITLES;

  const handleSubmit = async () => {
    const title = customTitle.trim() || selected;
    if (!title) return;
    setSaving(true);
    try {
      await api.post("/api/users/job-seeker-profile", { targetJobTitle: title });
      onSave(title);
    } catch {
      setSaving(false);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = selected === "Other" ? customTitle.trim().length > 0 : !!selected;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-2">
            <Briefcase className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">What role are you looking for?</DialogTitle>
          <DialogDescription className="text-center">
            This helps us tailor your verification journey and job recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-2">
            {titles.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => setSelected(title)}
                className={`p-3 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                  selected === title
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                {title}
              </button>
            ))}
          </div>

          {selected === "Other" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Specify your role</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Solution Architect"
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          <Button
            className="w-full mt-4"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving ? "Saving..." : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobTitleModal;
