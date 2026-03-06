import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/PhoneInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Loader2, FileText } from "lucide-react";

interface ParsedProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  about: string;
  currentRole: string;
  experienceYears: number;
  skills: string[];
  college: string;
  graduationYear: string;
  education: Array<{ institution: string; degree: string; year: string }>;
  workExperience: Array<{ company: string; role: string; years: string; bullets?: string[] }>;
}

interface ProfileSetupStageProps {
  onComplete: () => void;
  onContinueToVerification?: () => void;
  roleType?: "technical" | "non_technical";
}

const ACCEPT_MIME =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

const ProfileSetupStage = ({ onComplete, onContinueToVerification, roleType = "technical" }: ProfileSetupStageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [profileJustSaved, setProfileJustSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [about, setAbout] = useState("");
  const [experienceYears, setExperienceYears] = useState<number | "">("");
  const [skills, setSkills] = useState("");
  const [college, setCollege] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [education, setEducation] = useState<string>("");
  const [workExperience, setWorkExperience] = useState<string>("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");

  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [parseStep, setParseStep] = useState<"parsing" | "extracting" | "done">("parsing");

  const applyParsed = useCallback((p: ParsedProfile) => {
    setFullName(p.fullName || "");
    // Never overwrite email from resume — sign-up email (User.email) is the main, immutable email
    setPhone(p.phone || "");
    setLocation(p.location || "");
    setCurrentRole(p.currentRole || "");
    setAbout(p.about || "");
    setExperienceYears(p.experienceYears || "");
    setSkills(Array.isArray(p.skills) ? p.skills.join(", ") : "");
    setCollege(p.college || "");
    setGraduationYear(p.graduationYear || "");
    setEducation(
      Array.isArray(p.education) && p.education.length
        ? p.education.map((e) => `${e.degree} @ ${e.institution} (${e.year})`).join("\n")
        : ""
    );
    setWorkExperience(
      Array.isArray(p.workExperience) && p.workExperience.length
        ? p.workExperience.map((e) => `${e.role} at ${e.company} (${e.years})`).join("\n")
        : ""
    );
  }, []);

  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ profile: Record<string, unknown> | null }>("/api/users/job-seeker-profile")
      .then(({ profile }) => {
        if (cancelled || !profile) return;
        if (profile.fullName) {
          setFullName(String(profile.fullName));
          // Email always comes from User (sign-up) — never from profile
          setPhone(profile.phone ? String(profile.phone) : "");
          setLocation(profile.location ? String(profile.location) : "");
          setCurrentRole(profile.currentRole ? String(profile.currentRole) : "");
          setAbout(profile.about ? String(profile.about) : "");
          setExperienceYears(profile.experienceYears != null ? Number(profile.experienceYears) : "");
          setCollege(profile.college ? String(profile.college) : "");
          setGraduationYear(profile.graduationYear ? String(profile.graduationYear) : "");
          setNoticePeriod(profile.noticePeriod ? String(profile.noticePeriod) : "");
          setCurrentSalary(profile.currentSalary ? String(profile.currentSalary) : "");
          setExpectedSalary(profile.expectedSalary ? String(profile.expectedSalary) : "");
          const sk = profile.skills;
          setSkills(Array.isArray(sk) ? sk.join(", ") : typeof sk === "string" ? sk : "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const runParse = async (file: File) => {
    setResumeFile(file);
    setParseError(null);
    setParsing(true);
    setParseStep("parsing");
    setManualMode(false);
    const phaseTimer = setTimeout(() => setParseStep("extracting"), 1200);
    try {
      const form = new FormData();
      form.append("file", file);
      const { parsed } = await api.post<{ parsed: ParsedProfile }>("/api/ai/parse-resume", form);
      clearTimeout(phaseTimer);
      setParseStep("done");
      applyParsed(parsed);
      setShowForm(true);
      toast.success("Resume parsed. Review and save.");
    } catch (err: unknown) {
      clearTimeout(phaseTimer);
      let msg = err instanceof Error ? err.message : "Could not parse resume";
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("billing")) {
        msg = "Resume parsing is temporarily unavailable (API quota exceeded). Please fill in your details manually.";
      } else if (msg.includes("401") || msg.includes("Incorrect API key")) {
        msg = "Resume parsing is unavailable (API key issue). Please fill in your details manually.";
      } else if (msg.includes("GEMINI_API_KEY") || msg.includes("503")) {
        msg = "Resume parsing is not configured. Add GEMINI_API_KEY to server/.env (free at aistudio.google.com/apikey).";
      }
      setParseError(msg);
      setManualMode(true);
      setShowForm(true);
      toast.info("Fill in your details manually.");
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runParse(file);
  };

  const handleSkipToManual = () => {
    setManualMode(true);
    setShowForm(true);
    setParseError(null);
  };

  const scrollToField = (fieldId: string) => {
    const el = fieldRefs.current[fieldId] ?? document.getElementById(`field-${fieldId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSave = async () => {
    setFieldErrors({});
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = "Please enter your full name.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast.error("Please fix the highlighted fields.");
      const first = Object.keys(errs)[0];
      setTimeout(() => scrollToField(first), 100);
      return;
    }

    setSaving(true);
    try {
      // Resume not stored for now; full profile saved in DB. AWS storage in future.
      const skillsList = skills
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post("/api/users/job-seeker-profile", {
        fullName: fullName.trim(),
        // email is never sent — sign-up email (User.email) is the main, immutable email
        phone: phone || undefined,
        location: location || undefined,
        currentRole,
        about,
        experienceYears: experienceYears === "" ? undefined : Number(experienceYears),
        skills: skillsList.length ? skillsList : undefined,
        college: college || undefined,
        graduationYear: graduationYear || undefined,
        education: education.trim() ? education.trim().split("\n").filter(Boolean) : undefined,
        workExperience: workExperience.trim() ? workExperience.trim().split("\n").filter(Boolean) : undefined,
        noticePeriod: noticePeriod.trim() || undefined,
        currentSalary: currentSalary.trim() || undefined,
        expectedSalary: expectedSalary.trim() || undefined,
      });
      await api.post("/api/verification/stages/update", { stageName: "profile_setup", status: "completed" });
      toast.success("Profile saved successfully!");
      onComplete();
      setProfileJustSaved(true);
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { details?: { field: string; message: string }[]; message?: string; error?: string } } };
      const data = err?.response?.data;
      const serverErrs: Record<string, string> = {};
      if (data?.details && Array.isArray(data.details)) {
        for (const d of data.details) {
          serverErrs[d.field] = d.message;
        }
      }
      if (Object.keys(serverErrs).length > 0) {
        setFieldErrors(serverErrs);
        const msg = data?.message ?? data?.error ?? "Please fix the highlighted fields.";
        toast.error(msg);
        const first = Object.keys(serverErrs)[0];
        setTimeout(() => scrollToField(first), 100);
      } else {
        const msg = data?.message ?? data?.error ?? (error instanceof Error ? error.message : "Failed to save profile.");
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Setup</CardTitle>
        <CardDescription>
          Upload your resume first. Our AI will parse it and auto-fill all fields. You can review and edit before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {parsing && (
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-8 text-center space-y-6">
            <div className="flex justify-center gap-2">
              <div className={`h-1.5 w-12 rounded-full transition-colors ${parseStep !== "parsing" ? "bg-primary" : "bg-primary/40"}`} />
              <div className={`h-1.5 w-12 rounded-full transition-colors ${parseStep === "extracting" || parseStep === "done" ? "bg-primary" : "bg-muted"}`} />
              <div className={`h-1.5 w-12 rounded-full transition-colors ${parseStep === "done" ? "bg-primary" : "bg-muted"}`} />
            </div>
            <h2 className="text-2xl font-bold text-foreground">You are almost done!</h2>
            <div className="flex justify-center">
              <FileText className="h-16 w-16 text-muted-foreground/60" />
            </div>
            <div className="h-1.5 w-full max-w-xs mx-auto rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: parseStep === "parsing" ? "40%" : parseStep === "extracting" ? "80%" : "100%" }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Developers are signing up to find their dream role. You&apos;re next!
            </p>
            <div className="space-y-3 text-left max-w-sm mx-auto">
              <div className="flex items-center gap-3">
                {parseStep !== "parsing" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : (
                  <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                )}
                <span className="text-sm font-medium">Parsing Resume</span>
              </div>
              <div className="flex items-center gap-3">
                {parseStep === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : parseStep === "extracting" ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
                <span className="text-sm font-medium">Extracting Data</span>
              </div>
            </div>
          </div>
        )}
        {!showForm && !parsing && (
          <div className="space-y-3">
            <Label className="text-base font-medium">Upload your resume</Label>
            <p className="text-sm text-muted-foreground">PDF, DOC, DOCX, or TXT — our LLM will extract and auto-fill your profile.</p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center transition-colors hover:border-primary/50 cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && (f.type.includes("pdf") || f.type.includes("word") || f.type.includes("text"))) {
                  runParse(f);
                }
              }}
            >
              <input
                type="file"
                accept={ACCEPT_MIME}
                className="hidden"
                id="resume-upload"
                onChange={handleFileChange}
                disabled={parsing}
              />
              <label htmlFor="resume-upload" className="cursor-pointer block">
                <p className="text-sm text-muted-foreground">PDF, DOC, DOCX, or TXT</p>
                <p className="mt-2 text-primary font-medium">Drop file here or click to upload</p>
              </label>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkipToManual}>
              Fill manually (resume still required)
            </Button>
          </div>
        )}

        {showForm && (
          <div className="space-y-4">
            {parseError && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
                  Resume parsing failed: {parseError}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">You can edit the fields below or fill them manually.</p>
              </div>
            )}
            {Object.keys(fieldErrors).length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm font-medium text-destructive">Please fix the following:</p>
                <ul className="mt-1 text-sm text-destructive list-disc list-inside">
                  {Object.entries(fieldErrors).map(([f, msg]) => (
                    <li key={f}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            {resumeFile && !parseError && (
              <p className="text-sm text-muted-foreground">Using: {resumeFile.name}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div ref={(r) => { fieldRefs.current.fullName = r; }} id="field-fullName" className="space-y-2">
                <Label>Full name *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setFieldErrors((p) => ({ ...p, fullName: "" })); }}
                  placeholder="Your full name"
                  className={fieldErrors.fullName ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.fullName && (
                  <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
                )}
              </div>
              <div ref={(r) => { fieldRefs.current.email = r; }} id="field-email" className="space-y-2">
                <Label>Email (from sign-up, cannot be changed)</Label>
                <Input
                  type="email"
                  value={user?.email ?? ""}
                  readOnly
                  disabled
                  placeholder="email@example.com"
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Your sign-up email is your main account email.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone</Label>
                <PhoneInput value={phone} onChange={setPhone} placeholder="9876543210" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Current role</Label>
                <Input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} placeholder="e.g. Data Analyst" />
              </div>
              <div className="space-y-2">
                <Label>Experience (years)</Label>
                <Input
                  type="number"
                  min={0}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="3"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Short bio</Label>
              <Textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="2–3 sentences about your background"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Skills (comma-separated)</Label>
              <Input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder={roleType === "technical" ? "Python, SQL, JavaScript, React, Node.js, …" : "Communication, Excel, Project Management, Presentation, Customer Service, …"}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>College / Institution</Label>
                <Input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="University name" />
              </div>
              <div className="space-y-2">
                <Label>Graduation year</Label>
                <Input value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} placeholder="2020" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Education (one per line)</Label>
              <Textarea
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                placeholder="B.Tech @ XYZ College (2019)"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Work experience (one per line)</Label>
              <Textarea
                value={workExperience}
                onChange={(e) => setWorkExperience(e.target.value)}
                placeholder="Role at Company (Years)"
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Notice period</Label>
                <Input
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  placeholder="e.g. 15 days, 1 month, Immediate"
                />
              </div>
              <div className="space-y-2">
                <Label>Current salary</Label>
                <Input
                  value={currentSalary}
                  onChange={(e) => setCurrentSalary(e.target.value)}
                  placeholder="e.g. 10 LPA, 15-20 L"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected salary</Label>
                <Input
                  value={expectedSalary}
                  onChange={(e) => setExpectedSalary(e.target.value)}
                  placeholder="e.g. 20 LPA, 25-30 L"
                />
              </div>
            </div>

            {!resumeFile && (
              <div ref={(r) => { fieldRefs.current.resume = r; }} id="field-resume" className="space-y-2">
                <Label>Resume (optional — for AI parsing only, not stored)</Label>
                <Input
                  type="file"
                  accept={ACCEPT_MIME}
                  onChange={handleFileChange}
                  disabled={parsing}
                  className={fieldErrors.resume ? "border-destructive" : ""}
                />
                {fieldErrors.resume && (
                  <p className="text-sm text-destructive">{fieldErrors.resume}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save and continue"}
              </Button>
            </div>
          </div>
        )}

        {/* Post-save: choose Homepage or continue to next stage */}
        {profileJustSaved && (
          <div className="mt-6 p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Profile saved! What&apos;s next?</h3>
            <p className="text-sm text-muted-foreground">You can go to the homepage or continue to the next verification stage.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button
                onClick={() => {
                  const nextStage = roleType === "non_technical" ? "non_tech_assignment" : "aptitude_test";
                  api.post("/api/verification/stages/update", { stageName: nextStage, status: "in_progress" }).then(() => {
                    onContinueToVerification?.();
                  });
                }}
              >
                Continue to {roleType === "non_technical" ? "Assignment" : "Aptitude Test"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProfileSetupStage;
