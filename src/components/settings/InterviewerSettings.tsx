import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SettingsCard } from "./SettingsCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";

const EXPERTISE_OPTIONS = ["Backend development", "Frontend development", "System design", "Data engineering", "DevOps", "Mobile development"];
const TOPIC_OPTIONS = ["DSA", "System design", "Architecture", "Backend APIs", "Frontend", "Database"];

export function InterviewerSettings() {
  const [profile, setProfile] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [preferences, setPreferences] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [expertiseAreas, setExpertiseAreas] = useState<string[]>([]);
  const [preferredTopics, setPreferredTopics] = useState<string[]>([]);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [interviewReminders, setInterviewReminders] = useState(true);
  const [serverUnavailable, setServerUnavailable] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    setServerUnavailable(false);
    api
      .get<{ profile: any; user: any; preferences: any }>("/api/settings/interviewer")
      .then(({ profile: p, user: u, preferences: pref }) => {
        setProfile(p);
        setUserInfo(u);
        setPreferences(pref);
        setName(p?.name ?? u?.name ?? "");
        setCurrentCompany(p?.currentCompany ?? "");
        setJobTitle(p?.jobTitle ?? "");
        setExperienceYears(String(p?.experienceYears ?? ""));
        setLinkedInUrl(p?.linkedInUrl ?? "");
        setExpertiseAreas(Array.isArray(p?.expertiseAreas) ? p.expertiseAreas : []);
        setPreferredTopics(Array.isArray(p?.preferredInterviewTopics) ? p.preferredInterviewTopics : []);
        setEmailNotifications(pref?.emailNotifications ?? true);
        setInterviewReminders(pref?.interviewReminders ?? true);
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "";
        const is503 = status === 503 || msg.includes("temporarily unavailable") || msg.includes("Backend not running");
        if (is503) {
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

  const toggleExpertise = (item: string) => {
    setExpertiseAreas((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  };
  const toggleTopic = (item: string) => {
    setPreferredTopics((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/settings/interviewer", {
        name: name.trim() || undefined,
        currentCompany: currentCompany.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        experienceYears: experienceYears ? parseInt(experienceYears, 10) : undefined,
        linkedInUrl: linkedInUrl.trim() || undefined,
        expertiseAreas: expertiseAreas.length ? expertiseAreas : undefined,
        preferredInterviewTopics: preferredTopics.length ? preferredTopics : undefined,
        emailNotifications,
        interviewReminders,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-white/70">Loading settings...</div>;

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
      <SettingsCard title="Interviewer Profile" description="Visible to candidates." onSave={save} saving={saving}>
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={userInfo?.profileImage} />
              <AvatarFallback className="bg-white/10 text-white">
                {(name || userInfo?.email || "U").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm text-white/70">Profile photo from account</div>
          </div>
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Your name" />
          </div>
          <div>
            <Label>Current company</Label>
            <Input value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Company name" />
          </div>
          <div>
            <Label>Job title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="e.g. Staff Engineer" />
          </div>
          <div>
            <Label>Years of experience</Label>
            <Input type="number" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="8" min={0} />
          </div>
          <div>
            <Label>LinkedIn profile</Label>
            <Input value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="https://linkedin.com/in/..." />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Expertise & Interview Topics" description="Helps match you with candidates." onSave={save} saving={saving}>
        <div className="grid gap-6">
          <div>
            <Label>Primary expertise areas</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {EXPERTISE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleExpertise(opt)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    expertiseAreas.includes(opt)
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-white/5 border-[var(--dash-navy-border)] text-white/80 hover:bg-white/10"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Preferred interview topics</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {TOPIC_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleTopic(opt)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    preferredTopics.includes(opt)
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-white/5 border-[var(--dash-navy-border)] text-white/80 hover:bg-white/10"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Availability & Notifications" description="Reminders for scheduled interviews." onSave={save} saving={saving}>
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
              <Label>Interview reminders</Label>
              <p className="text-xs text-white/60">Remind before scheduled slots</p>
            </div>
            <Switch checked={interviewReminders} onCheckedChange={setInterviewReminders} />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
