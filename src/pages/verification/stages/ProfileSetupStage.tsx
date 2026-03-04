import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";

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
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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

  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const applyParsed = useCallback((p: ParsedProfile) => {
    setFullName(p.fullName || "");
    setEmail(p.email || "");
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

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ profile: Record<string, unknown> | null }>("/api/users/job-seeker-profile")
      .then(({ profile }) => {
        if (cancelled || !profile) return;
        if (profile.fullName) {
          setFullName(String(profile.fullName));
          setEmail(profile.email ? String(profile.email) : "");
          setPhone(profile.phone ? String(profile.phone) : "");
          setLocation(profile.location ? String(profile.location) : "");
          setCurrentRole(profile.currentRole ? String(profile.currentRole) : "");
          setAbout(profile.about ? String(profile.about) : "");
          setExperienceYears(profile.experienceYears != null ? Number(profile.experienceYears) : "");
          setCollege(profile.college ? String(profile.college) : "");
          setGraduationYear(profile.graduationYear ? String(profile.graduationYear) : "");
          const sk = profile.skills;
          setSkills(Array.isArray(sk) ? sk.join(", ") : typeof sk === "string" ? sk : "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const runParse = async (file: File) => {
    setResumeFile(file);
    setParseError(null);
    setParsing(true);
    setManualMode(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const { parsed } = await api.post<{ parsed: ParsedProfile }>("/api/ai/parse-resume", form);
      applyParsed(parsed);
      setShowForm(true);
      toast.success("Resume parsed. Review and save.");
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : "Could not parse resume";
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("billing")) {
        msg = "Resume parsing is temporarily unavailable (API quota exceeded). Please fill in your details manually.";
      } else if (msg.includes("401") || msg.includes("Incorrect API key")) {
        msg = "Resume parsing is unavailable (API key issue). Please fill in your details manually.";
      } else if (msg.includes("GEMINI_API_KEY") || msg.includes("OPENAI_API_KEY") || msg.includes("503")) {
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

  const handleSave = async () => {
    setSaving(true);
    try {
      let resumeUrl: string | null = null;
      if (resumeFile) {
        const form = new FormData();
        form.append("file", resumeFile);
        const { url } = await api.post<{ url: string }>("/api/uploads", form);
        resumeUrl = url;
      }
      const skillsList = skills
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post("/api/users/job-seeker-profile", {
        fullName,
        email: email || undefined,
        phone: phone || undefined,
        location: location || undefined,
        currentRole,
        about,
        experienceYears: experienceYears === "" ? undefined : Number(experienceYears),
        resumeUrl,
        skills: skillsList.length ? skillsList : undefined,
        college: college || undefined,
        graduationYear: graduationYear || undefined,
        education: education.trim() ? education.trim().split("\n").filter(Boolean) : undefined,
        workExperience: workExperience.trim() ? workExperience.trim().split("\n").filter(Boolean) : undefined,
      });
      await api.post("/api/verification/stages/update", { stageName: "profile_setup", status: "completed" });
      const nextStage = roleType === "non_technical" ? "non_tech_assignment" : "aptitude_test";
      await api.post("/api/verification/stages/update", { stageName: nextStage, status: "in_progress" });
      toast.success(roleType === "non_technical" ? "Profile saved. Proceeding to Assignment." : "Profile saved. Proceeding to Aptitude Test.");
      onComplete();
      onContinueToVerification?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile.");
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
        {!showForm && (
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
                {parsing ? (
                  <span className="text-muted-foreground">Analyzing your resume…</span>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">PDF, DOC, DOCX, or TXT</p>
                    <p className="mt-2 text-primary font-medium">Drop file here or click to upload</p>
                  </>
                )}
              </label>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkipToManual}>
              Skip and fill manually
            </Button>
          </div>
        )}

        {showForm && (
          <div className="space-y-4">
            {parseError && (
              <p className="text-sm text-amber-600">
                {parseError} You can edit the fields below.
              </p>
            )}
            {resumeFile && !parseError && (
              <p className="text-sm text-muted-foreground">Using: {resumeFile.name}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" />
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
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, SQL, Excel, …" />
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

            {!resumeFile && (
              <div className="space-y-2">
                <Label>Resume (optional)</Label>
                <Input type="file" accept={ACCEPT_MIME} onChange={handleFileChange} disabled={parsing} />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
                {saving ? "Saving…" : "Save and continue"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProfileSetupStage;
