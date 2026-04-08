import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, ArrowLeft, Upload, Sparkles, FileText, Loader2, X, Eye, MapPin, Clock, DollarSign, Calendar, Wand2 } from "lucide-react";
import { PROVENHIRE_SKILL_TAGS, isProvenhireSkillTag } from "@/data/provenhireSkillTags";

const PostJob = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const editingJobId = new URLSearchParams(location.search).get("jobId");
  const isEditMode = !!editingJobId;

  const normalizeJobStatusForClient = (status: string | null | undefined): "draft" | "published" => {
    if (!status) return "published";
    if (status === "active") return "published";
    if (status === "closed") return "draft";
    if (status === "draft" || status === "published") return status;
    return "published";
  };

  const statusToSubmitRef = useRef<"draft" | "published">("published");
  const [initializing, setInitializing] = useState(false);
  const [editingStatus, setEditingStatus] = useState<"draft" | "published" | null>(null);

  const [loading, setLoading] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    company: "",
    description: "",
    location: "",
    job_type: "",
    salary_range: "",
    experience_required: 0,
    experience_band: "" as "" | "fresher" | "mid" | "senior",
    required_skills: [] as string[],
    job_track: "tech" as "tech" | "non_technical",
    role_category: "",
    company_context: "",
    assignment_threshold: 60,
    assignment: "", // AI-generated for non-technical jobs
    minimum_certification_level: 1,
  });
  const [skillInput, setSkillInput] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assignmentGenerating, setAssignmentGenerating] = useState(false);

  useEffect(() => {
    if (!editingJobId || !user) return;

    setInitializing(true);
    api
      .get<{ jobs: any[] }>("/api/jobs/recruiter")
      .then((res) => {
        const job = (res.jobs ?? []).find((j) => j.id === editingJobId);
        if (!job) {
          toast.error("Job not found");
          navigate("/dashboard/recruiter");
          return;
        }

        const normalizedStatus = normalizeJobStatusForClient(job.status);
        setEditingStatus(normalizedStatus);
        statusToSubmitRef.current = normalizedStatus;

        const rs = Array.isArray(job.requiredSkills)
          ? (job.requiredSkills as string[])
          : Array.isArray(job.required_skills)
            ? job.required_skills
            : [];
        const expBand =
          job.experienceRequired === "fresher" ||
          job.experienceRequired === "mid" ||
          job.experienceRequired === "senior"
            ? job.experienceRequired
            : "";
        const rawJt = String(job.jobType ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-");
        const jobTypeNorm = ["full-time", "part-time", "contract", "internship"].includes(rawJt) ? rawJt : "";
        setFormData((prev) => ({
          ...prev,
          title: job.title ?? "",
          company: job.company ?? "",
          description: job.description ?? "",
          location: job.location ?? "",
          job_type: jobTypeNorm,
          salary_range: job.salaryRange ?? "",
          job_track: (job.jobTrack ?? "tech") as "tech" | "non_technical",
          role_category: job.roleCategory ?? "",
          company_context: job.companyContext ?? "",
          assignment: job.assignment ?? "",
          minimum_certification_level: job.minimumCertificationLevel ?? 1,
          required_skills: rs,
          experience_band: expBand,
        }));
      })
      .catch((err: any) => {
        toast.error(err?.message || "Failed to load job details");
      })
      .finally(() => setInitializing(false));
  }, [editingJobId, user, navigate]);

  const parseSalaryMaxLpa = (salaryRange?: string): number | null => {
    if (!salaryRange) return null;
    const lakhMatch =
      salaryRange.match(/₹?\s*([\d,]+)L\s*-\s*₹?\s*([\d,]+)L/i) ||
      salaryRange.match(/₹?\s*([\d,]+)L/i);
    if (!lakhMatch) return null;
    const max = lakhMatch[2] ? parseInt(lakhMatch[2].replace(/,/g, ""), 10) : parseInt(lakhMatch[1].replace(/,/g, ""), 10);
    return Number.isNaN(max) ? null : max;
  };

  const isEliteGatedBySalary = formData.job_track === "tech" && (parseSalaryMaxLpa(formData.salary_range) ?? 0) >= 25;

  const getSubmitErrorMessage = (error: any): string => {
    if (!error) return 'Something went wrong. Please check the form and try again.';
    const data = error?.response?.data;
    const code = data?.code ?? error.code;
    const serverMsg = typeof data?.error === 'string' ? data.error : null;
    const msg = typeof error.message === 'string' ? error.message : '';

    if (code === 'RECRUITER_PROFILE_REQUIRED') {
      return serverMsg || 'Complete your recruiter profile and get verified before posting jobs. Go to Dashboard → Settings to complete verification.';
    }
    if (code === 'RECRUITER_NOT_VERIFIED') {
      return serverMsg || 'Your recruiter account is under review. You can post jobs once you’re verified. Complete verification in Settings or wait for admin approval.';
    }
    if (code === '23503') {
      return "Your account isn't linked to a recruiter profile. Please complete recruiter onboarding from the dashboard, or sign in with a full account.";
    }
    if (code === '23502') {
      if (msg.includes('title')) return 'Please enter the Job title.';
      if (msg.includes('company')) return 'Please enter the Company name.';
      if (msg.includes('description')) return 'Please enter the Job description.';
      if (msg.includes('recruiter_id')) return "Recruiter account not found. Please sign in again or complete your profile.";
      return 'A required field is missing. Please fill in Job title, Company name, and Job description.';
    }
    if (msg.includes('null value') && msg.includes('column')) {
      if (msg.includes('title')) return 'Please enter the Job title.';
      if (msg.includes('company')) return 'Please enter the Company name.';
      if (msg.includes('description')) return 'Please enter the Job description.';
    }
    if (msg.includes('row-level security') || msg.includes('policy')) {
      return "You don't have permission to post jobs with this account. Please complete your recruiter profile and try again.";
    }
    if (msg.includes('invalid input syntax for type uuid') || msg.includes('bypass-')) {
      return "You're signed in with a test account. Test accounts can't save jobs to the database. Sign up or sign in with a full recruiter account to post jobs.";
    }
    if (msg && msg.length < 200) return msg;
    return 'Couldn\'t save the job. Please check that Job title, Company name, and Job description are filled, then try again.';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF, Word document, or text file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadedFile(file);
    toast.success(`File "${file.name}" uploaded. Click "Parse with AI" to auto-fill fields.`);
  };

  const parseWithAI = async () => {
    if (!uploadedFile) {
      toast.error('Please upload a job description file first');
      return;
    }

    setAiParsing(true);
    try {
      // Read file content
      const content = await readFileContent(uploadedFile);
      
      if (content.length < 50) {
        toast.error('The file content is too short to parse');
        return;
      }

      const { result } = await api.post<{ result: string }>("/api/ai/parse-job-description", { text: content });
      let parsed: any = {};
      try {
        parsed = JSON.parse(result);
      } catch {
        parsed = {};
      }

      setFormData((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        company: parsed.company || prev.company,
        description: parsed.description || prev.description,
        location: parsed.location || prev.location,
        job_type: parsed.job_type || prev.job_type,
        salary_range: parsed.salary_range || prev.salary_range,
        experience_required: parsed.experience_required ?? prev.experience_required,
        required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills : prev.required_skills,
      }));

      toast.success('Job details extracted successfully! Review and adjust as needed.');
    } catch (error: any) {
      console.error('AI parsing error:', error);
      toast.error(error.message || 'Failed to parse job description');
    } finally {
      setAiParsing(false);
    }
  };

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      if (file.type === 'text/plain') {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      } else {
        // For PDF/Word, we'll read as text and let the AI handle it
        // In production, you'd want to use a proper document parser
        reader.onload = (e) => {
          const text = e.target?.result as string;
          // Try to extract text content
          resolve(text);
        };
        reader.onerror = reject;
        reader.readAsText(file);
      }
    });
  };

  const isTestAccount = user?.id?.startsWith?.('bypass-');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    if (!user) {
      toast.error('Please sign in to post a job');
      return;
    }

    if (isTestAccount) {
      const msg = "You're signed in with a test account. Test accounts can't save jobs to the database. Sign up or sign in with a full recruiter account to post jobs.";
      toast.error(msg);
      setFieldErrors({ form: msg });
      return;
    }

    const errors: Record<string, string> = {};
    if (!formData.title?.trim()) errors.title = 'Please enter the job title.';
    if (!formData.company?.trim()) errors.company = 'Please enter the company name.';
    if (!formData.description?.trim()) errors.description = 'Please enter the job description.';
    if (formData.job_track === 'non_technical' && !formData.company_context?.trim()) {
      errors.company_context = 'Company context is required for non-technical jobs (used for assignment generation).';
    }

    const desiredStatus = statusToSubmitRef.current;
    if (desiredStatus === 'published') {
      if (formData.description.trim().length < 200) {
        errors.description = 'Job description must be at least 200 characters when publishing.';
      }
      if (formData.required_skills.length < 2) {
        errors.required_skills = 'Add at least 2 required skills from the ProvenHire list (max 10).';
      }
      if (formData.required_skills.length > 10) {
        errors.required_skills = 'Maximum 10 required skills.';
      }
      if (!formData.experience_band) {
        errors.experience_band = 'Select experience required (Fresher / Mid / Senior).';
      }
      if (!formData.job_type?.trim()) {
        errors.job_type = 'Select employment type (Full-time, Part-time, Contract, or Internship).';
      }
      if (!formData.location?.trim()) {
        errors.location = 'Location is required when publishing (city or Remote).';
      }
      const badSkill = formData.required_skills.find((s) => !isProvenhireSkillTag(s));
      if (badSkill) {
        errors.required_skills = `"${badSkill}" is not in the ProvenHire skill list. Pick a tag from suggestions.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const first = Object.values(errors)[0];
      toast.error(first);
      return;
    }

    setLoading(true);
    try {
      const desiredStatus = statusToSubmitRef.current;

      const payload = {
        title: formData.title.trim(),
        company: formData.company.trim(),
        description: formData.description.trim(),
        location: formData.location || null,
        jobType: formData.job_type || null,
        salaryRange: formData.salary_range || null,
        jobTrack: formData.job_track || "tech",
        assignment: formData.job_track === "non_technical" && formData.assignment?.trim() ? formData.assignment.trim() : null,
        roleCategory: formData.role_category || null,
        companyContext: formData.company_context || null,
        minimumCertificationLevel: formData.minimum_certification_level,
        requiredSkills: formData.required_skills,
        experienceRequired: formData.experience_band || undefined,
        status: desiredStatus,
      };

      const req = isEditMode && editingJobId ? api.patch<{ job: any }>(`/api/jobs/${editingJobId}`, payload) : api.post<{ job: any }>("/api/jobs", payload);
      const { job } = await req;

      const shouldNotifyAdmin = desiredStatus === "published" && !!job?.id && !isEditMode;
      if (shouldNotifyAdmin) {
        api.post("/api/notifications/admin", { jobId: job.id }).catch((err) => {
          console.warn("Job alert notification failed", err);
        });
      }

      toast.success(desiredStatus === "draft" ? "Draft saved successfully!" : "Job published successfully!");
      if (desiredStatus === "published" && job?.id) {
        toast.message(`We found matching verified candidates — opening your discovery grid.`);
        navigate(`/dashboard/recruiter/jobs/${job.id}/matches`);
      } else {
        navigate("/dashboard/recruiter");
      }
    } catch (error: any) {
      console.error('Error posting job:', error);
      const friendlyMessage = getSubmitErrorMessage(error);
      const apiFieldErrors = error?.response?.data?.fieldErrors as Record<string, string> | undefined;
      const mapped: Record<string, string> = {};
      if (apiFieldErrors) {
        const keyMap: Record<string, string> = {
          companyContext: "company_context",
          roleCategory: "role_category",
          requiredSkills: "required_skills",
          experienceRequired: "experience_band",
          jobType: "job_type",
        };
        for (const [k, v] of Object.entries(apiFieldErrors)) {
          mapped[keyMap[k] ?? k] = v;
        }
      }
      setFieldErrors({ ...mapped, form: friendlyMessage });
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const addSkill = () => {
    const t = skillInput.trim();
    if (!t || formData.required_skills.includes(t)) return;
    if (!isProvenhireSkillTag(t)) {
      toast.error(`"${t}" is not in the ProvenHire skill list. Pick a suggestion or check spelling.`);
      return;
    }
    if (formData.required_skills.length >= 10) {
      toast.error("Maximum 10 required skills.");
      return;
    }
    setFormData({
      ...formData,
      required_skills: [...formData.required_skills, PROVENHIRE_SKILL_TAGS.find((s) => s.toLowerCase() === t.toLowerCase()) || t],
    });
    setSkillInput("");
    setFieldErrors((prev) => ({ ...prev, required_skills: "", form: "" }));
  };

  const removeSkill = (skill: string) => {
    setFormData({
      ...formData,
      required_skills: formData.required_skills.filter(s => s !== skill)
    });
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              {isEditMode ? "Edit Job" : "Post New Job"}
            </h1>
            {isEditMode && editingStatus === "draft" && (
              <Badge variant="outline" className="bg-gray-500/10 border-gray-500/30 text-gray-200">
                Draft
              </Badge>
            )}
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard/recruiter')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* AI Upload Section */}
        <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">AI-Powered Auto-Fill</CardTitle>
            </div>
            <CardDescription>
              Upload a job description document and let AI extract the details automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="jd-upload"
                />
                <label
                  htmlFor="jd-upload"
                  className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <Upload className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">
                    {uploadedFile ? uploadedFile.name : 'Upload JD (PDF, Word, TXT)'}
                  </span>
                </label>
              </div>
              <Button
                type="button"
                onClick={parseWithAI}
                disabled={!uploadedFile || aiParsing}
                className="bg-gradient-hero hover:opacity-90"
              >
                {aiParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Parse with AI
                  </>
                )}
              </Button>
            </div>
            
            {uploadedFile && (
              <div className="flex items-center gap-2 p-2 bg-background/60 rounded-lg">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm flex-1 truncate">{uploadedFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeUploadedFile}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Form */}
        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>Fill in the information about your job opening or let AI auto-fill from your document</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {isTestAccount && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200" role="alert">
                  You're signed in with a <strong>test account</strong>. You can try the form, but jobs won't be saved to the database. Sign up or sign in with a full recruiter account to post jobs.
                </div>
              )}
              {fieldErrors.form && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {fieldErrors.form}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Senior Frontend Developer"
                  value={formData.title}
                  onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setFieldErrors((prev) => ({ ...prev, title: '', form: '' })); }}
                  className={fieldErrors.title ? 'border-destructive focus-visible:ring-destructive' : ''}
                  required
                />
                {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company Name *</Label>
                <Input
                  id="company"
                  placeholder="e.g. TechCorp Inc"
                  value={formData.company}
                  onChange={(e) => { setFormData({ ...formData, company: e.target.value }); setFieldErrors((prev) => ({ ...prev, company: '', form: '' })); }}
                  className={fieldErrors.company ? 'border-destructive focus-visible:ring-destructive' : ''}
                  required
                />
                {fieldErrors.company && <p className="text-sm text-destructive">{fieldErrors.company}</p>}
              </div>

              <div className="space-y-2">
                <Label>Job track (PRD v4.1) *</Label>
                <Select
                  value={formData.job_track}
                  onValueChange={(v: "tech" | "non_technical") =>
                    setFormData((prev) => ({
                      ...prev,
                      job_track: v,
                      minimum_certification_level:
                        v === "non_technical"
                          ? Math.min(2, prev.minimum_certification_level)
                          : prev.minimum_certification_level,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">Technical</SelectItem>
                    <SelectItem value="non_technical">Non-Technical</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Technical: expert-verified candidates. Non-technical: non-tech verified + per-job assignment.</p>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Label>Application eligibility policy</Label>
                <p className="text-sm text-foreground">
                  {isEliteGatedBySalary
                    ? "This is a high-package technical job (>= ₹25L). Only Level 3 (Elite Verified) candidates can apply."
                    : "This job is open to all candidates (no certification gate)."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Platform rule: only high-package technical roles are Level 3 gated. Other roles are open so candidates can discover and apply early.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Minimum certification for candidates</Label>
                <Select
                  value={String(formData.minimum_certification_level)}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, minimum_certification_level: parseInt(v, 10) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">L1 — Cognitive verified</SelectItem>
                    <SelectItem value="2">L2 — Skill passport</SelectItem>
                    <SelectItem value="3">L3 — Elite verified</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Who can apply and appear in discovery. High-package (≥ ₹25L) technical jobs still enforce L3 minimum.
                </p>
              </div>

              {formData.job_track === 'non_technical' && (
                <>
                  <div className="space-y-2">
                    <Label>Role category *</Label>
                    <Select value={formData.role_category} onValueChange={(v) => setFormData({ ...formData, role_category: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Sales">Sales</SelectItem>
                        <SelectItem value="Finance/Accounting">Finance / Accounting</SelectItem>
                        <SelectItem value="Operations/Business Analyst">Operations / Business Analyst</SelectItem>
                        <SelectItem value="Human Resources">Human Resources</SelectItem>
                        <SelectItem value="Content/Copywriting">Content / Copywriting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_context">Company context *</Label>
                    <Textarea
                      id="company_context"
                      placeholder="Brief description of what the company does (used for assignment generation)"
                      value={formData.company_context}
                      onChange={(e) => { setFormData({ ...formData, company_context: e.target.value }); setFieldErrors((prev) => ({ ...prev, company_context: '', form: '' })); }}
                      rows={2}
                      className={fieldErrors.company_context ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {fieldErrors.company_context && <p className="text-sm text-destructive">{fieldErrors.company_context}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Assignment (AI-generated)</Label>
                    <p className="text-xs text-muted-foreground">Generate a take-home assignment for applicants. Candidates must complete it to apply.</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (!formData.company?.trim() || !formData.title?.trim() || !formData.company_context?.trim()) {
                            toast.error('Fill company name, job title, and company context first.');
                            return;
                          }
                          setAssignmentGenerating(true);
                          try {
                            const { assignment } = await api.post<{ assignment: string }>("/api/ai/generate-assignment", {
                              companyName: formData.company.trim(),
                              companyContext: formData.company_context.trim() || undefined,
                              jobRole: formData.title.trim(),
                              jobDescription: formData.description.trim() || undefined,
                              roleCategory: formData.role_category || undefined,
                              industry: formData.role_category || undefined,
                              experienceYears:
                                formData.experience_band === "fresher"
                                  ? 0
                                  : formData.experience_band === "mid"
                                    ? 2
                                    : formData.experience_band === "senior"
                                      ? 5
                                      : formData.experience_required || 3,
                            });
                            setFormData((prev) => ({ ...prev, assignment: assignment || "" }));
                            toast.success('Assignment generated! Review and edit if needed.');
                          } catch (err: any) {
                            toast.error(err?.message || err?.response?.data?.error || 'Failed to generate assignment.');
                          } finally {
                            setAssignmentGenerating(false);
                          }
                        }}
                        disabled={assignmentGenerating || !formData.company?.trim() || !formData.title?.trim() || !formData.company_context?.trim()}
                      >
                        {assignmentGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                        {assignmentGenerating ? 'Generating...' : 'Generate Assignment'}
                      </Button>
                    </div>
                    {formData.assignment && (
                      <Textarea
                        placeholder="Generated assignment will appear here. You can edit before posting."
                        value={formData.assignment}
                        onChange={(e) => setFormData({ ...formData, assignment: e.target.value })}
                        rows={14}
                        className="mt-2 font-mono text-sm"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Assignment score threshold (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.assignment_threshold}
                      onChange={(e) => setFormData({ ...formData, assignment_threshold: parseInt(e.target.value) || 60 })}
                    />
                    <p className="text-xs text-muted-foreground">Min AI score to show assignment to recruiter (default 60).</p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Job Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the role, responsibilities, and requirements..."
                  value={formData.description}
                  onChange={(e) => { setFormData({ ...formData, description: e.target.value }); setFieldErrors((prev) => ({ ...prev, description: '', form: '' })); }}
                  rows={6}
                  className={fieldErrors.description ? 'border-destructive focus-visible:ring-destructive' : ''}
                  required
                />
                {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g. Bangalore or Gurugram or Remote"
                    value={formData.location}
                    onChange={(e) => {
                      setFormData({ ...formData, location: e.target.value });
                      setFieldErrors((prev) => ({ ...prev, location: "", form: "" }));
                    }}
                    className={fieldErrors.location ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {fieldErrors.location && <p className="text-sm text-destructive">{fieldErrors.location}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_type">Employment type</Label>
                  <Select
                    value={formData.job_type || undefined}
                    onValueChange={(value) => {
                      setFormData({ ...formData, job_type: value });
                      setFieldErrors((prev) => ({ ...prev, job_type: "", form: "" }));
                    }}
                  >
                    <SelectTrigger className={fieldErrors.job_type ? "border-destructive" : ""}>
                      <SelectValue placeholder="Full-time / Part-time / …" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.job_type && <p className="text-sm text-destructive">{fieldErrors.job_type}</p>}
                  <p className="text-xs text-muted-foreground">Required when you publish the job.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary">Salary Range</Label>
                  <Input
                    id="salary"
                    placeholder="e.g. ₹15L - ₹25L"
                    value={formData.salary_range}
                    onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Experience required (for discovery)</Label>
                  <Select
                    value={formData.experience_band || undefined}
                    onValueChange={(v: "fresher" | "mid" | "senior") =>
                      setFormData((prev) => ({ ...prev, experience_band: v }))
                    }
                  >
                    <SelectTrigger className={fieldErrors.experience_band ? "border-destructive" : ""}>
                      <SelectValue placeholder="Fresher / Mid / Senior" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fresher">Fresher (early career)</SelectItem>
                      <SelectItem value="mid">Mid level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.experience_band && (
                    <p className="text-sm text-destructive">{fieldErrors.experience_band}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Required skills (ProvenHire list, 2–10)</Label>
                <p className="text-xs text-muted-foreground">
                  Type to filter suggestions, or pick from chips below. Only listed tags can be published.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="skills"
                    placeholder="e.g. React"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                    className={fieldErrors.required_skills ? "border-destructive" : ""}
                  />
                  <Button type="button" onClick={addSkill} variant="outline">
                    Add
                  </Button>
                </div>
                {skillInput.trim().length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-h-28 overflow-y-auto">
                    {PROVENHIRE_SKILL_TAGS.filter(
                      (t) =>
                        t.toLowerCase().includes(skillInput.toLowerCase()) &&
                        !formData.required_skills.some((s) => s.toLowerCase() === t.toLowerCase())
                    )
                      .slice(0, 14)
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80"
                          onClick={() => {
                            if (formData.required_skills.length >= 10) return;
                            setFormData((prev) => ({
                              ...prev,
                              required_skills: [...prev.required_skills, t],
                            }));
                            setSkillInput("");
                            setFieldErrors((prev) => ({ ...prev, required_skills: "", form: "" }));
                          }}
                        >
                          {t}
                        </button>
                      ))}
                  </div>
                )}
                {fieldErrors.required_skills && (
                  <p className="text-sm text-destructive">{fieldErrors.required_skills}</p>
                )}
                {formData.required_skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.required_skills.map((skill) => (
                      <div key={skill} className="bg-secondary px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowPreview(true)}
                  disabled={!formData.title && !formData.company && !formData.description}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Job
                </Button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="submit"
                    variant="outline"
                    className="bg-transparent hover:opacity-90"
                    disabled={loading || initializing}
                    onClick={() => {
                      statusToSubmitRef.current = "draft";
                    }}
                  >
                    {loading ? "Saving..." : "Save as Draft"}
                  </Button>

                  <Button
                    type="submit"
                    className="bg-gradient-hero hover:opacity-90"
                    disabled={loading || initializing}
                    onClick={() => {
                      statusToSubmitRef.current = "published";
                    }}
                  >
                    {loading ? "Publishing..." : "Publish Job"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Job Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Job Listing Preview
              </DialogTitle>
              <DialogDescription>
                This is how candidates will see your job listing
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 space-y-6">
              {/* Job Header */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  {formData.title || "Job Title"}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {formData.company || "Company Name"}
                </p>
              </div>

              {/* Job Meta */}
              <div className="flex flex-wrap gap-3">
                {formData.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {formData.location}
                  </div>
                )}
                {formData.job_type && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {formData.job_type.charAt(0).toUpperCase() + formData.job_type.slice(1)}
                  </div>
                )}
                {formData.salary_range && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    {formData.salary_range}
                  </div>
                )}
                {formData.experience_required > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formData.experience_required}+ years experience
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">Description</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {formData.description || "No description provided yet."}
                </p>
              </div>

              {/* Skills */}
              {formData.required_skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {formData.required_skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Footer */}
              <div className="pt-4 border-t border-border">
                <Button className="w-full" disabled>
                  Apply Now
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  This is a preview. The "Apply Now" button will be active after posting.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default PostJob;
