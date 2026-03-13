import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SettingsCard } from "./SettingsCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CERT_LEVELS = [
  { value: 0, label: "Any" },
  { value: 1, label: "Cognitive Verified" },
  { value: 2, label: "Skill Passport" },
  { value: 3, label: "Elite Verified" },
];

export function RecruiterSettings() {
  const [profile, setProfile] = useState<any>(null);
  const [preferences, setPreferences] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [headquarters, setHeadquarters] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [preferredRoles, setPreferredRoles] = useState("");
  const [preferredExperienceMin, setPreferredExperienceMin] = useState("");
  const [preferredExperienceMax, setPreferredExperienceMax] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [minimumCertificationLevel, setMinimumCertificationLevel] = useState(1);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [applicationAlerts, setApplicationAlerts] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { signOut } = useAuth();

  const loadSettings = () => {
    setLoading(true);
    setServerUnavailable(false);
    setSessionExpired(false);
    api
      .get<{ profile: any; preferences: any }>("/api/settings/recruiter")
      .then(({ profile: p, preferences: pref }) => {
        setProfile(p);
        setPreferences(pref);
        setCompanyName(p?.companyName ?? "");
        setCompanyWebsite(p?.companyWebsite ?? "");
        setCompanyLogo(p?.companyLogo ?? "");
        setIndustry(p?.industry ?? "");
        setCompanySize(p?.companySize ?? "");
        setHeadquarters(p?.headquarters ?? "");
        setCompanyDescription(p?.companyDescription ?? "");
        setPreferredRoles(Array.isArray(p?.preferredRoles) ? p.preferredRoles.join(", ") : "");
        setPreferredExperienceMin(String(p?.preferredExperienceMin ?? ""));
        setPreferredExperienceMax(String(p?.preferredExperienceMax ?? ""));
        setPreferredSkills(Array.isArray(p?.preferredSkills) ? p.preferredSkills.join(", ") : "");
        setMinimumCertificationLevel(p?.minimumCertificationLevel ?? 1);
        setEmailNotifications(pref?.emailNotifications ?? true);
        setApplicationAlerts(pref?.applicationAlerts ?? true);
        setWeeklyReports(pref?.weeklyReports ?? false);
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "";
        const is503 = status === 503 || msg.includes("temporarily unavailable") || msg.includes("Backend not running");
        if (status === 401) {
          setSessionExpired(true);
          toast.error("Session expired. Please sign in again.");
        } else if (is503) {
          setServerUnavailable(true);
          toast.error("Server unavailable. Start the backend: npm run dev:server (or npm run dev:all from project root).");
        } else {
          toast.error("Failed to load settings");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/settings/recruiter", {
        companyName: companyName.trim() || undefined,
        companyWebsite: companyWebsite.trim() || undefined,
        companyLogo: companyLogo.trim() || undefined,
        industry: industry.trim() || undefined,
        companySize: companySize.trim() || undefined,
        headquarters: headquarters.trim() || undefined,
        companyDescription: companyDescription.trim() || undefined,
        preferredRoles: preferredRoles ? preferredRoles.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        preferredExperienceMin: preferredExperienceMin ? parseInt(preferredExperienceMin, 10) : undefined,
        preferredExperienceMax: preferredExperienceMax ? parseInt(preferredExperienceMax, 10) : undefined,
        preferredSkills: preferredSkills ? preferredSkills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        minimumCertificationLevel,
        emailNotifications,
        applicationAlerts,
        weeklyReports,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-white/70">Loading settings...</div>;

  if (sessionExpired) {
    return (
      <div className="rounded-lg border border-white/20 bg-white/5 p-4 text-center text-white">
        <p className="font-medium">Session expired</p>
        <p className="mt-1 text-sm text-white/70">Please sign in again to continue.</p>
        <button type="button" onClick={() => signOut()} className="mt-3 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20">
          Sign in again
        </button>
      </div>
    );
  }

  if (serverUnavailable) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <p className="font-medium">Server unavailable</p>
        <p className="mt-1 text-sm text-amber-200/80">
          Start the backend: <code className="rounded bg-black/20 px-1">npm run dev:server</code> (or <code className="rounded bg-black/20 px-1">npm run dev:all</code> from project root).
        </p>
        <button type="button" onClick={loadSettings} className="mt-3 rounded-md bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-500/30">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="Company Profile" description="Visible on job postings." onSave={save} saving={saving}>
        <div className="grid gap-4">
          <div>
            <Label>Company name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Acme Inc." />
          </div>
          <div>
            <Label>Company logo URL</Label>
            <Input value={companyLogo} onChange={(e) => setCompanyLogo(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="https://..." />
          </div>
          <div>
            <Label>Company website</Label>
            <Input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="https://..." />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Technology" />
          </div>
          <div>
            <Label>Company size</Label>
            <Input value={companySize} onChange={(e) => setCompanySize(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="1-50, 51-200, etc." />
          </div>
          <div>
            <Label>Headquarters location</Label>
            <Input value={headquarters} onChange={(e) => setHeadquarters(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Bangalore, India" />
          </div>
          <div>
            <Label>Company description</Label>
            <Textarea value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" rows={4} placeholder="Brief description of your company" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Hiring Preferences" description="Filter candidates by certification and skills." onSave={save} saving={saving}>
        <div className="grid gap-4">
          <div>
            <Label>Preferred roles</Label>
            <Input value={preferredRoles} onChange={(e) => setPreferredRoles(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Frontend Engineer, Backend (comma-separated)" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Experience range (min years)</Label>
              <Input type="number" value={preferredExperienceMin} onChange={(e) => setPreferredExperienceMin(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="0" min={0} />
            </div>
            <div>
              <Label>Experience range (max years)</Label>
              <Input type="number" value={preferredExperienceMax} onChange={(e) => setPreferredExperienceMax(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="10" min={0} />
            </div>
          </div>
          <div>
            <Label>Preferred skills</Label>
            <Input value={preferredSkills} onChange={(e) => setPreferredSkills(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="React, Node, Python (comma-separated)" />
          </div>
          <div>
            <Label>Minimum certification level</Label>
            <Select value={String(minimumCertificationLevel)} onValueChange={(v) => setMinimumCertificationLevel(parseInt(v, 10))}>
              <SelectTrigger className="mt-1 bg-white/5 border-[var(--dash-navy-border)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERT_LEVELS.map((c) => (
                  <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Team & Notifications" description="Application alerts and reports." onSave={save} saving={saving}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Email notifications</Label>
              <p className="text-xs text-white/60">General platform emails</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Candidate application alerts</Label>
              <p className="text-xs text-white/60">Notify when new applications arrive</p>
            </div>
            <Switch checked={applicationAlerts} onCheckedChange={setApplicationAlerts} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Weekly hiring reports</Label>
              <p className="text-xs text-white/60">Summary of applications and interviews</p>
            </div>
            <Switch checked={weeklyReports} onCheckedChange={setWeeklyReports} />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
