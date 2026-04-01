import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, BACKEND_DOWN_MSG } from "@/lib/api";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Link2, FileText, LogOut, UserPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PhoneInput } from "@/components/PhoneInput";
import { jobSeekerInitialsFromFullName } from "@/utils/jobSeekerIdentity";

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
  const [bio, setBio] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<"employed" | "unemployed" | "student">("employed");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadSettings = (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setServerUnavailable(false);
      setSessionExpired(false);
    }
    api
      .get<{ profile: any; user: any; preferences: any }>("/api/settings/job-seeker")
      .then(({ profile, user: u, preferences: p }) => {
        setProfile(profile);
        setUserInfo(u);
        setPreferences(p);
        setFullName(profile?.fullName ?? profile?.full_name ?? u?.name ?? "");
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
        setBio(profile?.about ?? profile?.bio ?? "");
        const rawSkills = profile?.skills;
        setSkills(
          Array.isArray(rawSkills)
            ? rawSkills.map((s: unknown) => String(s))
            : typeof rawSkills === "string" && rawSkills.trim()
              ? [rawSkills]
              : []
        );
        setNoticePeriod(profile?.noticePeriod ?? "");
        setCurrentSalary(profile?.currentSalary ?? "");
        setExpectedSalary(profile?.expectedSalary ?? "");
        setEmploymentStatus("employed");
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : "";
        if (status === 401) {
          setSessionExpired(true);
          toast.error("Session expired. Please sign in again.");
        } else if (status === 503) {
          setServerUnavailable(true);
          const backendDown = msg.includes("Run npm run dev") || msg.includes("Backend not running");
          toast.error(backendDown ? BACKEND_DOWN_MSG : "Could not load settings. Please try again.");
        } else {
          setServerUnavailable(true);
          toast.error(msg || "Failed to load settings");
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Refetch when user returns to this tab so name/profile stays in sync (e.g. after resume upload or verification)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadSettings();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const addSkill = () => {
    const next = skillInput.trim();
    if (!next || skills.includes(next)) return;
    setSkills((prev) => [...prev, next]);
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  };

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
      const isEmployed = employmentStatus === "employed";
      await api.post("/api/users/job-seeker-profile", {
        about: bio.trim() || undefined,
        location: location.trim() || undefined,
        phone: phone.trim() || undefined,
        skills: skills.length ? skills : undefined,
        noticePeriod: isEmployed ? (noticePeriod.trim() || undefined) : null,
        currentSalary: isEmployed ? (currentSalary.trim() || undefined) : null,
        expectedSalary: expectedSalary.trim() || undefined,
        employmentStatus,
      });
      toast.success("Settings saved");
      loadSettings({ silent: true });
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
        <p className="font-semibold text-amber-200">Could not load settings</p>
        <p className="mt-2 text-sm text-white/80">
          The backend may be starting or the database is temporarily unavailable. Click Retry to try again, or run <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">npm run dev</code> from the project root if the backend is not running.
        </p>
        <Button variant="outline" className="mt-4 border-amber-500/50 text-amber-200 hover:bg-amber-500/20" onClick={loadSettings}>
          Retry
        </Button>
      </div>
    );
  }

  const scrollToProfile = () => {
    document.getElementById("jobseeker-settings-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <div id="jobseeker-settings-profile">
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
                {jobSeekerInitialsFromFullName(fullName, userInfo?.email ?? user?.email ?? undefined)}
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
            <PhoneInput
              value={phone}
              onChange={setPhone}
              placeholder="98765 43210"
              className="mt-1 bg-white/5 border-[var(--dash-navy-border)]"
            />
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
      </div>

      <SettingsCard
        title="Professional profile"
        description="Bio, employment, and skills — used across verification and your recruiter-facing resume."
        onSave={saveProfile}
        saving={saving}
      >
        <div className="grid gap-4">
          <div>
            <Label>Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell recruiters about yourself..."
              rows={3}
              className="mt-1 resize-none bg-white/5 border-[var(--dash-navy-border)]"
            />
          </div>
          <div>
            <Label>Employment status</Label>
            <div className="flex flex-wrap gap-3 mt-2">
              {(["employed", "unemployed", "student"] as const).map((status) => (
                <label key={status} className="flex items-center gap-2 cursor-pointer text-sm text-white/90">
                  <input
                    type="radio"
                    name="employmentStatus"
                    checked={employmentStatus === status}
                    onChange={() => {
                      setEmploymentStatus(status);
                      if (status !== "employed") {
                        setNoticePeriod("");
                        setCurrentSalary("");
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <span className="capitalize">{status}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {employmentStatus === "employed" && (
              <>
                <div>
                  <Label>Notice period</Label>
                  <Input
                    value={noticePeriod}
                    onChange={(e) => setNoticePeriod(e.target.value)}
                    className="mt-1 bg-white/5 border-[var(--dash-navy-border)]"
                    placeholder="e.g. 15 days, Immediate"
                  />
                </div>
                <div>
                  <Label>Current salary</Label>
                  <Input
                    value={currentSalary}
                    onChange={(e) => setCurrentSalary(e.target.value)}
                    className="mt-1 bg-white/5 border-[var(--dash-navy-border)]"
                    placeholder="e.g. 12 LPA"
                  />
                </div>
              </>
            )}
            <div className={employmentStatus === "employed" ? "" : "sm:col-span-2"}>
              <Label>Expected salary</Label>
              <Input
                value={expectedSalary}
                onChange={(e) => setExpectedSalary(e.target.value)}
                className="mt-1 bg-white/5 border-[var(--dash-navy-border)]"
                placeholder="e.g. 18–22 LPA"
              />
            </div>
          </div>
          <div>
            <Label>Skills</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Add a skill"
                className="bg-white/5 border-[var(--dash-navy-border)]"
              />
              <Button type="button" variant="outline" className="shrink-0 border-[var(--dash-navy-border)]" onClick={addSkill}>
                Add
              </Button>
            </div>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 p-2 rounded-md border border-[var(--dash-navy-border)] bg-white/5 min-h-[44px]">
                {skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="ml-1.5 text-muted-foreground hover:text-foreground leading-none"
                      aria-label={`Remove ${skill}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
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
        description="Notification preferences."
        onSave={saveProfile}
        saving={saving}
      >
        <div className="flex items-center justify-between">
          <div>
            <Label>Email notifications</Label>
            <p className="text-xs text-white/60">Receive emails about job matches and application updates</p>
          </div>
          <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Your account"
        description="Profile edits, password, and sign-out — kept here so your dashboard stays focused on verification."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="outline" className="border-[var(--dash-navy-border)] justify-center sm:justify-start" onClick={scrollToProfile}>
            <UserPen className="h-4 w-4 mr-2 shrink-0" />
            Edit profile
          </Button>
          <Button type="button" variant="outline" className="border-[var(--dash-navy-border)] justify-center sm:justify-start" onClick={() => setPasswordDialogOpen(true)}>
            Reset password
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10 justify-center sm:justify-start sm:ml-auto"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4 mr-2 shrink-0" />
            Sign out
          </Button>
        </div>
        <p className="text-xs text-white/60 mt-3">Use Edit profile to jump to your details above, then Save Changes on each section.</p>
      </SettingsCard>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="border-[var(--dash-navy-border)] bg-[var(--dash-navy)]">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
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
    </div>
  );
}
