import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SettingsCard } from "./SettingsCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Link2, FileText } from "lucide-react";

const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;
const EXPERIENCE_LEVELS = ["Entry Level", "Mid Level", "Senior Level"] as const;

export function JobSeekerSettings() {
  const { user, changePassword, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [preferences, setPreferences] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [targetJobTitle, setTargetJobTitle] = useState("");
  const [preferredTechStack, setPreferredTechStack] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<string>("");
  const [preferredLocations, setPreferredLocations] = useState("");
  const [workModePreference, setWorkModePreference] = useState<string>("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    setServerUnavailable(false);
    setSessionExpired(false);
    api
      .get<{ profile: any; user: any; preferences: any }>("/api/settings/job-seeker")
      .then(({ profile, user: u, preferences: p }) => {
        setProfile(profile);
        setUserInfo(u);
        setPreferences(p);
        setFullName(profile?.fullName ?? u?.name ?? "");
        setPhone(profile?.phone ?? "");
        setLocation(profile?.location ?? "");
        setResumeUrl(profile?.resumeUrl ?? "");
        setGithubUrl(profile?.githubUrl ?? "");
        setLinkedInUrl(profile?.linkedInUrl ?? "");
        setPortfolioUrl(profile?.portfolioUrl ?? "");
        setTargetJobTitle(profile?.targetJobTitle ?? "");
        setPreferredTechStack(Array.isArray(profile?.preferredTechStack) ? profile.preferredTechStack.join(", ") : "");
        setExperienceLevel(profile?.experienceLevel ?? "");
        setPreferredLocations(Array.isArray(profile?.preferredLocations) ? profile.preferredLocations.join(", ") : "");
        setWorkModePreference(profile?.workModePreference ?? "");
        setEmailNotifications(p?.emailNotifications ?? true);
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

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch("/api/settings/job-seeker", {
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        resumeUrl: resumeUrl.trim() || undefined,
        githubUrl: githubUrl.trim() || undefined,
        linkedInUrl: linkedInUrl.trim() || undefined,
        portfolioUrl: portfolioUrl.trim() || undefined,
        targetJobTitle: targetJobTitle.trim() || undefined,
        preferredTechStack: preferredTechStack ? preferredTechStack.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        experienceLevel: experienceLevel || undefined,
        preferredLocations: preferredLocations ? preferredLocations.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        workModePreference: workModePreference || undefined,
        emailNotifications,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !serverUnavailable && !sessionExpired) return <div className="text-white/70">Loading settings...</div>;

  if (sessionExpired) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/5 p-6 text-center">
        <p className="font-semibold text-white">Session expired</p>
        <p className="mt-2 text-sm text-white/70">Please sign in again to continue.</p>
        <Button className="mt-4" onClick={() => signOut()}>
          Sign in again
        </Button>
      </div>
    );
  }

  if (serverUnavailable) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
        <p className="font-semibold text-amber-200">Server unavailable</p>
        <p className="mt-2 text-sm text-white/80">
          Start the backend to load settings: <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">npm run dev:server</code> or <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">npm run dev:all</code> from the project root.
        </p>
        <Button variant="outline" className="mt-4 border-amber-500/50 text-amber-200 hover:bg-amber-500/20" onClick={loadSettings}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Profile Information"
        description="Visible to recruiters. Keep your profile up to date."
        onSave={saveProfile}
        saving={saving}
      >
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={userInfo?.profileImage} />
              <AvatarFallback className="bg-white/10 text-white">
                {(fullName || user?.email || "U").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm text-white/70">Profile photo from account</div>
          </div>
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Your full name" />
          </div>
          <div>
            <Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</Label>
            <Input value={userInfo?.email ?? user?.email} disabled className="mt-1 bg-white/5 opacity-70" />
            <p className="text-xs text-white/50 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="+91 98765 43210" />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="City, Country" />
          </div>
          <div>
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Resume URL</Label>
            <Input value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="https://..." />
          </div>
          <div>
            <Label className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Portfolio links</Label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              <Input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="GitHub URL" className="bg-white/5 border-[var(--dash-navy-border)]" />
              <Input value={linkedInUrl} onChange={(e) => setLinkedInUrl(e.target.value)} placeholder="LinkedIn URL" className="bg-white/5 border-[var(--dash-navy-border)]" />
              <Input value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="Personal website" className="bg-white/5 border-[var(--dash-navy-border)]" />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Career Preferences"
        description="Helps recommend relevant jobs."
        onSave={saveProfile}
        saving={saving}
      >
        <div className="grid gap-4">
          <div>
            <Label>Target job role</Label>
            <Input value={targetJobTitle} onChange={(e) => setTargetJobTitle(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="e.g. Senior Frontend Engineer" />
          </div>
          <div>
            <Label>Preferred tech stack</Label>
            <Input value={preferredTechStack} onChange={(e) => setPreferredTechStack(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="React, TypeScript, Node (comma-separated)" />
          </div>
          <div>
            <Label>Experience level</Label>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger className="mt-1 bg-white/5 border-[var(--dash-navy-border)]">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Preferred locations</Label>
            <Input value={preferredLocations} onChange={(e) => setPreferredLocations(e.target.value)} className="mt-1 bg-white/5 border-[var(--dash-navy-border)]" placeholder="Bangalore, Remote, Hyderabad (comma-separated)" />
          </div>
          <div>
            <Label>Work mode preference</Label>
            <Select value={workModePreference} onValueChange={setWorkModePreference}>
              <SelectTrigger className="mt-1 bg-white/5 border-[var(--dash-navy-border)]">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {WORK_MODES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Account & Security"
        description="Notification and security preferences."
        onSave={saveProfile}
        saving={saving}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Email notifications</Label>
              <p className="text-xs text-white/60">Receive emails about job matches and application updates</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="pt-4 border-t border-[var(--dash-navy-border)]">
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-[var(--dash-navy-border)]">
                  Change password
                </Button>
              </DialogTrigger>
              <DialogContent className="border-[var(--dash-navy-border)] bg-[var(--dash-navy)]">
                <DialogHeader>
                  <DialogTitle>Change password</DialogTitle>
                  <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label>Current password</Label>
                    <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 bg-white/5" autoComplete="current-password" />
                  </div>
                  <div>
                    <Label>New password</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 bg-white/5" autoComplete="new-password" />
                  </div>
                  <div>
                    <Label>Confirm new password</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 bg-white/5" autoComplete="new-password" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
                  <Button
                    className="dashboard-btn-gold"
                    onClick={async () => {
                      if (newPassword !== confirmPassword) {
                        toast.error("Passwords do not match");
                        return;
                      }
                      if (newPassword.length < 8) {
                        toast.error("Password must be at least 8 characters");
                        return;
                      }
                      await changePassword(currentPassword, newPassword);
                      setPasswordDialogOpen(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Update password
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <p className="text-xs text-white/60 mt-2">Use your current password to set a new one</p>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
