import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, Sparkles, User, GraduationCap, Briefcase, Wrench, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { extractTextFromPDF } from "@/utils/pdfParser";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProfileSetupStageProps {
  onComplete: () => void;
  onContinueToVerification: () => void;
}

const STEPS = [
  { id: 1, title: "Personal Details", icon: User },
  { id: 2, title: "Education", icon: GraduationCap },
  { id: 3, title: "Professional", icon: Briefcase },
  { id: 4, title: "Skills", icon: Wrench },
];

const ProfileSetupStage = ({ onComplete, onContinueToVerification }: ProfileSetupStageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [resumeApplied, setResumeApplied] = useState(false);
  const [formData, setFormData] = useState({
    // Personal Details
    full_name: "",
    email: user?.email || "",
    phone: "",
    location: "",
    linkedin_url: "",
    portfolio_url: "",
    bio: "",
    
    // Education
    college: "",
    degree: "",
    field_of_study: "",
    graduation_year: "",
    cgpa: "",
    
    // Professional Details
    experience_years: "",
    current_company: "",
    current_role: "",
    notice_period: "",
    expected_salary: "",
    current_salary: "",
    join_date: "",
    currently_working: false,
    actively_looking_roles: [] as string[],
    projects: [] as any[],
    
    // Skills
    skills: [] as string[],
    hobbies: [] as string[],
    certifications: [] as string[],
    languages: [] as string[],
    
    resume_url: "",
  });
  
  const [skillInput, setSkillInput] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [hobbyInput, setHobbyInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [langInput, setLangInput] = useState("");

  const normalizeList = (value: unknown): string[] => {
    const items: string[] = [];
    const pushValue = (val: unknown) => {
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(pushValue);
        return;
      }
      if (typeof val === "string") {
        val
          .split(/[,;\n]/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .forEach((entry) => items.push(entry));
        return;
      }
      if (typeof val === "object") {
        Object.values(val as Record<string, unknown>).forEach(pushValue);
      }
    };

    pushValue(value);
    return Array.from(new Set(items));
  };

  const preferExisting = (current: string, incoming?: string | null) => {
    if (current?.trim()) return current;
    return incoming || current;
  };

  const preferExistingList = (current: string[], incoming?: unknown) => {
    if (current?.length) return current;
    const normalized = normalizeList(incoming);
    return normalized.length ? normalized : current;
  };

  const preferExistingBoolean = (current: boolean, incoming?: boolean | null) => {
    if (current) return current;
    return incoming ?? current;
  };

  const fallbackParseFromText = (text: string) => {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = text.match(/(\+?\d[\d\s\-().]{8,}\d)/);
    const linkedinMatch = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i);
    const githubMatch = text.match(/https?:\/\/(www\.)?github\.com\/[^\s)]+/i);
    const portfolioMatch = linkedinMatch ? githubMatch : text.match(/https?:\/\/(www\.)?[^\s)]+/i);

    const sectionHeadings = [
      { key: "skills", match: /^(skills?|technical skills?|tech stack)$/i },
      { key: "experience", match: /^experience$/i },
      { key: "education", match: /^education$/i },
      { key: "projects", match: /^projects?$/i },
      { key: "certifications", match: /^certifications?$/i },
      { key: "languages", match: /^languages?$/i },
      { key: "interests", match: /^(interests|hobbies)$/i },
    ];

    const sections: Record<string, string[]> = {};
    let currentSection: string | null = null;

    lines.forEach((line) => {
      const heading = sectionHeadings.find((item) => item.match.test(line));
      if (heading) {
        currentSection = heading.key;
        sections[currentSection] = [];
        return;
      }
      if (currentSection) {
        sections[currentSection].push(line);
      }
    });

    const grabSection = (label: string) => {
      const regex = new RegExp(`${label}\\s*[:\\-]?\\s*(.*?)\\s*(education|experience|projects|certifications|languages|interests|hobbies|skills|technical skills|tech stack|$)`, "i");
      const match = normalizedText.match(regex);
      return match?.[1] || "";
    };

    const sanitizeSkillLine = (line: string) => {
      if (/(education|experience|project|certification|language|hobbies|interest)/i.test(line)) {
        return "";
      }
      return line
        .replace(/^skills?\b[:\-]?\s*/i, "")
        .replace(/^technical skills?\b[:\-]?\s*/i, "")
        .replace(/^tech stack\b[:\-]?\s*/i, "")
        .trim();
    };

    const skillsText = [
      ...(sections.skills || []).map(sanitizeSkillLine),
      sanitizeSkillLine(grabSection("skills")),
      sanitizeSkillLine(grabSection("technical skills")),
      sanitizeSkillLine(grabSection("tech stack")),
    ]
      .filter(Boolean)
      .join(", ");

    const certificationsText = (sections.certifications || []).join(", ");
    const languagesText = (sections.languages || []).join(", ");
    const hobbiesText = (sections.interests || []).join(", ");

    const educationText = [grabSection("education"), ...(sections.education || [])].join(" ");
    const experienceText = [grabSection("experience"), ...(sections.experience || [])].join(" ");

    const collegeMatch = educationText.match(
      /(Institute|University|College|School)[^,\n]*/i
    );
    const degreeMatch = educationText.match(
      /(Bachelor|B\.Tech|B\.E|B\.Sc|Master|M\.Tech|M\.E|M\.Sc|MBA|Ph\.D|Diploma)[^,\n]*/i
    );
    const fieldMatch = educationText.match(/\bin\s+([A-Za-z &]+)(?=,|\d|$)/i);
    const gradYearMatches = educationText.match(/\b(20\d{2}|19\d{2})\b/g) || [];
    const gradYearMatch = gradYearMatches.length ? gradYearMatches[gradYearMatches.length - 1] : "";

    const roleMatch = experienceText.match(
      /(Software Engineer|Developer|Analyst|Associate|Manager|Consultant|Intern|Lead|Designer)[^,\n]*/i
    );
    const companyMatch = experienceText.match(
      /(at|@)\s+([A-Z][A-Za-z0-9 &.-]{2,})/i
    );
    const expYearsMatch = text.match(/\b(\d+(?:\.\d+)?)\+?\s+years?\b/i);

    const possibleName =
      lines.find((line) => {
        const normalized = line.toLowerCase();
        if (normalized.includes("resume") || normalized.includes("curriculum vitae")) return false;
        if (/@/.test(line) || /\d/.test(line)) return false;
        return line.split(" ").length >= 2;
      }) || "";

    const summaryParts = [
      roleMatch?.[0] || "",
      companyMatch?.[2] ? `at ${companyMatch?.[2]}` : "",
      normalizeList(skillsText).slice(0, 4).join(", "),
    ].filter(Boolean);
    const bioText = summaryParts.length
      ? `Professional with experience as ${summaryParts[0]} ${summaryParts[1] ? summaryParts[1] : ""}. Skilled in ${summaryParts[2] || "relevant tools and technologies"}.`
      : "";

    return {
      full_name: possibleName,
      email: emailMatch?.[0] || "",
      phone: phoneMatch?.[0] || "",
      linkedin_url: linkedinMatch?.[0] || "",
      portfolio_url: portfolioMatch?.[0] || "",
      college: collegeMatch?.[0] || "",
      degree: degreeMatch?.[0] || "",
      field_of_study: fieldMatch?.[1]?.trim() || "",
      graduation_year: gradYearMatch || "",
      current_role: roleMatch?.[0] || "",
      current_company: companyMatch?.[2] || "",
      experience_years: expYearsMatch?.[1] || "",
      skills: normalizeList(skillsText),
      certifications: normalizeList(certificationsText),
      languages: normalizeList(languagesText),
      hobbies: normalizeList(hobbiesText),
      projects: normalizeList(sections.projects || []),
      bio: bioText,
    };
  };

  const mergeResumeData = (fallbackData: any, aiData: any) => {
    if (!aiData) return fallbackData;
    const result = { ...fallbackData };
    const setIfPresent = (key: string, value: any) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string") {
        if (value.trim().length === 0) return;
        result[key] = value;
        return;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return;
        result[key] = value;
        return;
      }
      result[key] = value;
    };

    Object.entries(aiData).forEach(([key, value]) => setIfPresent(key, value));

    const fallbackYear = Number(fallbackData?.graduation_year || 0);
    const aiYear = Number(aiData?.graduation_year || 0);
    if (fallbackYear || aiYear) {
      result.graduation_year = Math.max(fallbackYear, aiYear);
    }
    return result;
  };

  const callLocalResumeParser = async (resumeText: string) => {
    const localParserUrl = import.meta.env.VITE_LOCAL_RESUME_PARSER_URL;
    if (!localParserUrl) return null;
    const baseUrl = localParserUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText }),
    });
    if (!response.ok) {
      throw new Error(`Local parser failed (${response.status})`);
    }
    const data = await response.json();
    return data?.data || data || null;
  };

  const applyResumeData = (data: any) => {
    if (!data) return;
    setFormData((prev) => ({
      ...prev,
      full_name: data.full_name?.trim() || prev.full_name,
      email: data.email?.trim() || prev.email,
      phone: data.phone?.trim() || prev.phone,
      location: data.location?.trim() || prev.location,
      linkedin_url: data.linkedin_url?.trim() || prev.linkedin_url,
      portfolio_url: data.portfolio_url?.trim() || prev.portfolio_url,
      bio: data.bio?.trim() || prev.bio,
      college: data.college?.trim() || prev.college,
      degree: data.degree?.trim() || prev.degree,
      field_of_study: data.field_of_study?.trim() || prev.field_of_study,
      graduation_year: data.graduation_year?.toString() || prev.graduation_year,
      cgpa: data.cgpa?.trim() || prev.cgpa,
      experience_years: data.experience_years?.toString() || prev.experience_years,
      current_company: data.current_company?.trim() || prev.current_company,
      current_role: data.current_role?.trim() || prev.current_role,
      notice_period: data.notice_period?.trim() || prev.notice_period,
      expected_salary: data.expected_salary?.trim() || prev.expected_salary,
      skills: normalizeList(data.skills).length ? normalizeList(data.skills) : prev.skills,
      actively_looking_roles: normalizeList(data.actively_looking_roles).length
        ? normalizeList(data.actively_looking_roles)
        : prev.actively_looking_roles,
      projects: normalizeList(data.projects).length ? normalizeList(data.projects) : prev.projects,
      hobbies: normalizeList(data.hobbies).length ? normalizeList(data.hobbies) : prev.hobbies,
      certifications: normalizeList(data.certifications).length ? normalizeList(data.certifications) : prev.certifications,
      languages: normalizeList(data.languages).length ? normalizeList(data.languages) : prev.languages,
    }));
    setResumeApplied(true);
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id || profileLoaded) return;
      try {
        const [{ data: profileData }, { data: jobSeekerData }] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name,email,phone")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("job_seeker_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if ((profileData || jobSeekerData) && !resumeApplied) {
          setFormData((prev) => ({
            ...prev,
            full_name: preferExisting(prev.full_name, profileData?.full_name),
            email: preferExisting(prev.email, profileData?.email),
            phone: preferExisting(prev.phone, profileData?.phone),
            location: preferExisting(prev.location, jobSeekerData?.location),
            linkedin_url: preferExisting(prev.linkedin_url, jobSeekerData?.linkedin_url),
            portfolio_url: preferExisting(prev.portfolio_url, jobSeekerData?.portfolio_url),
            bio: preferExisting(prev.bio, jobSeekerData?.bio),
            college: preferExisting(prev.college, jobSeekerData?.college),
            degree: preferExisting(prev.degree, jobSeekerData?.degree),
            field_of_study: preferExisting(prev.field_of_study, jobSeekerData?.field_of_study),
            graduation_year: preferExisting(prev.graduation_year, jobSeekerData?.graduation_year?.toString()),
            cgpa: preferExisting(prev.cgpa, jobSeekerData?.cgpa),
            experience_years: preferExisting(prev.experience_years, jobSeekerData?.experience_years?.toString()),
            current_company: preferExisting(prev.current_company, jobSeekerData?.current_company),
            current_role: preferExisting(prev.current_role, jobSeekerData?.current_role),
            notice_period: preferExisting(prev.notice_period, jobSeekerData?.notice_period),
            expected_salary: preferExisting(prev.expected_salary, jobSeekerData?.expected_salary),
            current_salary: preferExisting(prev.current_salary, jobSeekerData?.current_salary),
            join_date: preferExisting(prev.join_date, jobSeekerData?.join_date),
            currently_working: preferExistingBoolean(prev.currently_working, jobSeekerData?.currently_working),
            resume_url: preferExisting(prev.resume_url, jobSeekerData?.resume_url),
            skills: preferExistingList(prev.skills, jobSeekerData?.skills),
            actively_looking_roles: preferExistingList(prev.actively_looking_roles, jobSeekerData?.actively_looking_roles),
            projects: preferExistingList(prev.projects, jobSeekerData?.projects),
            hobbies: preferExistingList(prev.hobbies, jobSeekerData?.hobbies),
            certifications: preferExistingList(prev.certifications, jobSeekerData?.certifications),
            languages: preferExistingList(prev.languages, jobSeekerData?.languages),
          }));
        }
      } catch (error) {
        console.error("Failed to load profile data:", error);
      } finally {
        setProfileLoaded(true);
      }
    };

    loadProfile();
  }, [user?.id, profileLoaded]);

  const formatFileSize = (size: number) => {
    if (!size) return "0 KB";
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setResumeFile(file);
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setFormData(prev => ({ ...prev, resume_url: fileName }));

      if (user?.id) {
        await supabase
          .from('job_seeker_profiles')
          .upsert({ user_id: user.id, resume_url: fileName }, { onConflict: 'user_id' });
      }

      await analyzeResume(file);

      toast({
        title: "Resume uploaded successfully",
        description: "Analyzing your resume with AI...",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const analyzeResume = async (file: File) => {
    setAnalyzing(true);
    try {
      let text = '';
      
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }
      
      console.log('Extracted text length:', text.length);
      
      let extractedData: any = null;
      const fallbackData = fallbackParseFromText(text);
      try {
        const localData = await callLocalResumeParser(text);
        if (localData) {
          extractedData = mergeResumeData(fallbackData, localData);
        }
      } catch (localError) {
        console.warn("Local resume parser failed. Falling back to edge function.", localError);
      }

      if (!extractedData) {
      try {
        const { data, error } = await supabase.functions.invoke('analyze-resume', {
          body: { resumeText: text }
        });
        if (error) throw error;
        const aiData = data?.data || null;
        extractedData = mergeResumeData(fallbackData, aiData);
      } catch (functionError) {
        console.warn("Analyze-resume failed. Using local fallback parsing.", functionError);
        extractedData = fallbackData;
      }
      }

      if (extractedData) {
        const normalizedSkills = normalizeList(extractedData.skills);
        const normalizedRoles = normalizeList(extractedData.actively_looking_roles);
        const normalizedProjects = normalizeList(extractedData.projects);
        const normalizedHobbies = normalizeList(extractedData.hobbies);
        const normalizedCerts = normalizeList(extractedData.certifications);
        const normalizedLanguages = normalizeList(extractedData.languages);
        applyResumeData({
          ...extractedData,
          skills: normalizedSkills.length ? normalizedSkills : extractedData.skills,
          actively_looking_roles: normalizedRoles.length ? normalizedRoles : extractedData.actively_looking_roles,
          projects: normalizedProjects.length ? normalizedProjects : extractedData.projects,
          hobbies: normalizedHobbies.length ? normalizedHobbies : extractedData.hobbies,
          certifications: normalizedCerts.length ? normalizedCerts : extractedData.certifications,
          languages: normalizedLanguages.length ? normalizedLanguages : extractedData.languages,
        });

        toast({
          title: "✨ Resume analyzed with AI!",
          description: "All fields have been auto-filled. Please review and update if needed.",
        });
      }
    } catch (error: any) {
      console.error("Resume analysis error:", error);
      toast({
        title: "Analysis failed",
        description: "Please fill in the details manually",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const addItem = (field: 'skills' | 'actively_looking_roles' | 'hobbies' | 'certifications' | 'languages', value: string) => {
    if (!value.trim()) return;
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] as string[]), value.trim()]
    }));
    if (field === 'skills') setSkillInput("");
    if (field === 'actively_looking_roles') setRoleInput("");
    if (field === 'hobbies') setHobbyInput("");
    if (field === 'certifications') setCertInput("");
    if (field === 'languages') setLangInput("");
  };

  const removeItem = (field: 'skills' | 'actively_looking_roles' | 'hobbies' | 'certifications' | 'languages', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index)
    }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.full_name && formData.phone && formData.location);
      case 2:
        return !!(formData.college && formData.graduation_year);
      case 3:
        return true;
      case 4:
        return formData.skills.length > 0;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) {
      toast({
        title: "Please fill required fields",
        description: "Complete all required fields before proceeding",
        variant: "destructive",
      });
      return;
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep < 4) {
      return;
    }

    if (!resumeFile && !formData.resume_url) {
      toast({
        title: "Resume required",
        description: "Please upload your resume to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!validateStep(4)) {
      toast({
        title: "Please add skills",
        description: "Add at least one skill to continue",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingProfile(true);
      let resumeUrl = formData.resume_url;
      if (resumeFile && !resumeUrl) {
        const fileExt = resumeFile.name.split('.').pop();
        const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, resumeFile);
        if (uploadError) throw uploadError;
        resumeUrl = fileName;
      }

      // Update profiles table with name and email
      await supabase
        .from('profiles')
        .upsert({
          user_id: user?.id,
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
        });

      const baseProfilePayload = {
        user_id: user?.id,
        college: formData.college,
        graduation_year: parseInt(formData.graduation_year),
        experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
        skills: formData.skills,
        actively_looking_roles: formData.actively_looking_roles,
        projects: formData.projects,
        hobbies: formData.hobbies,
        bio: formData.bio,
        phone: formData.phone,
        location: formData.location,
        resume_url: resumeUrl,
        verification_status: 'in_progress',
      };

      const extendedProfilePayload = {
        ...baseProfilePayload,
        degree: formData.degree,
        field_of_study: formData.field_of_study,
        cgpa: formData.cgpa,
        certifications: formData.certifications,
        languages: formData.languages,
        linkedin_url: formData.linkedin_url,
        portfolio_url: formData.portfolio_url,
        current_company: formData.current_company,
        current_role: formData.current_role,
        notice_period: formData.notice_period,
        expected_salary: formData.expected_salary,
        current_salary: formData.current_salary,
        join_date: formData.join_date || null,
        currently_working: formData.currently_working,
      };

      const { error: profileError } = await supabase
        .from('job_seeker_profiles')
        .upsert(extendedProfilePayload, { onConflict: 'user_id' });

      if (profileError) {
        const message = profileError.message?.toLowerCase() || '';
        const isSchemaCache = message.includes('schema cache') || message.includes('column');
        if (isSchemaCache) {
          const { error: fallbackError } = await supabase
            .from('job_seeker_profiles')
            .upsert(baseProfilePayload, { onConflict: 'user_id' });
          if (fallbackError) throw fallbackError;
        } else {
          throw profileError;
        }
      }

      toast({
        title: "Profile saved",
        description: "Review your details, then continue to verification when you're ready.",
      });

      setProfileSaved(true);
      onComplete();
    } catch (error: any) {
      toast({
        title: "Unable to save profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleContinueToVerification = async () => {
    if (!profileSaved) {
      toast({
        title: "Save your profile first",
        description: "Please save your profile before continuing.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { error: stageError } = await supabase
        .from('verification_stages')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('user_id', user?.id)
        .eq('stage_name', 'profile_setup');

      if (stageError) throw stageError;

      const { error: nextStageError } = await supabase
        .from('verification_stages')
        .update({ status: 'in_progress' })
        .eq('user_id', user?.id)
        .eq('stage_name', 'aptitude_test');

      if (nextStageError) throw nextStageError;

      toast({
        title: "Ready for verification",
        description: "Starting the aptitude test.",
      });

      onContinueToVerification();
    } catch (error: any) {
      toast({
        title: "Unable to continue",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Personal Details
            </h3>
            <p className="text-sm text-muted-foreground">Tell us about yourself</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Aakash Mohikar"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="aakash@example.com"
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+91 98202 87186"
                  required
                />
              </div>
              <div>
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Mumbai, Maharashtra"
                  required
                />
              </div>
              <div>
                <Label htmlFor="linkedin_url">LinkedIn Profile</Label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  placeholder="https://linkedin.com/in/aakashmohikar"
                />
              </div>
              <div>
                <Label htmlFor="portfolio_url">Portfolio / Website</Label>
                <Input
                  id="portfolio_url"
                  value={formData.portfolio_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, portfolio_url: e.target.value }))}
                  placeholder="https://aakashmohikar.dev"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="bio">Professional Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Brief introduction about yourself..."
                rows={3}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Education
            </h3>
            <p className="text-sm text-muted-foreground">Your educational background</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="college">College / University *</Label>
                <Input
                  id="college"
                  value={formData.college}
                  onChange={(e) => setFormData(prev => ({ ...prev, college: e.target.value }))}
                  placeholder="Stanford University"
                  required
                />
              </div>
              <div>
                <Label htmlFor="degree">Degree</Label>
                <Select
                  value={formData.degree}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, degree: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select degree" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bachelors">Bachelor's</SelectItem>
                    <SelectItem value="masters">Master's</SelectItem>
                    <SelectItem value="phd">Ph.D.</SelectItem>
                    <SelectItem value="diploma">Diploma</SelectItem>
                    <SelectItem value="associate">Associate</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="field_of_study">Field of Study</Label>
                <Input
                  id="field_of_study"
                  value={formData.field_of_study}
                  onChange={(e) => setFormData(prev => ({ ...prev, field_of_study: e.target.value }))}
                  placeholder="Computer Science & Engineering"
                />
              </div>
              <div>
                <Label htmlFor="graduation_year">Graduation Year *</Label>
                <Input
                  id="graduation_year"
                  type="number"
                  value={formData.graduation_year}
                  onChange={(e) => setFormData(prev => ({ ...prev, graduation_year: e.target.value }))}
                  placeholder="2025"
                  min="1950"
                  max="2030"
                  required
                />
              </div>
              <div>
                <Label htmlFor="cgpa">CGPA / Percentage</Label>
                <Input
                  id="cgpa"
                  value={formData.cgpa}
                  onChange={(e) => setFormData(prev => ({ ...prev, cgpa: e.target.value }))}
                  placeholder="8.2 / 10"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Professional Details
            </h3>
            <p className="text-sm text-muted-foreground">Your work experience</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="experience_years">Years of Experience</Label>
                <Input
                  id="experience_years"
                  type="number"
                  value={formData.experience_years}
                  onChange={(e) => setFormData(prev => ({ ...prev, experience_years: e.target.value }))}
                  placeholder="2"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="current_company">Current Company</Label>
                <Input
                  id="current_company"
                  value={formData.current_company}
                  onChange={(e) => setFormData(prev => ({ ...prev, current_company: e.target.value }))}
                  placeholder="Infosys"
                />
              </div>
              <div>
                <Label htmlFor="current_role">Current Role</Label>
                <Input
                  id="current_role"
                  value={formData.current_role}
                  onChange={(e) => setFormData(prev => ({ ...prev, current_role: e.target.value }))}
                  placeholder="Business Analyst"
                />
              </div>
              <div>
                <Label htmlFor="join_date">Joining Date</Label>
                <Input
                  id="join_date"
                  type="date"
                  value={formData.join_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, join_date: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Use your latest joining date.</p>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    checked={formData.currently_working}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, currently_working: Boolean(checked) }))}
                  />
                  <span className="text-sm text-muted-foreground">I currently work here</span>
                </div>
              </div>
              <div>
                <Label htmlFor="notice_period">Notice Period</Label>
                <Select
                  value={formData.notice_period}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, notice_period: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select notice period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="15days">15 Days</SelectItem>
                    <SelectItem value="1month">1 Month</SelectItem>
                    <SelectItem value="2months">2 Months</SelectItem>
                    <SelectItem value="3months">3 Months</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Choose how quickly you can join.</p>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="expected_salary">Expected Salary Range</Label>
                <Input
                  id="expected_salary"
                  value={formData.expected_salary}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_salary: e.target.value }))}
                  placeholder="₹12 LPA - ₹18 LPA"
                />
                <p className="text-xs text-muted-foreground mt-1">Share your expected range for transparency.</p>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="current_salary">Current Salary</Label>
                <Input
                  id="current_salary"
                  value={formData.current_salary}
                  onChange={(e) => setFormData(prev => ({ ...prev, current_salary: e.target.value }))}
                  placeholder="₹8 LPA"
                />
                <p className="text-xs text-muted-foreground mt-1">Optional for freshers.</p>
              </div>
            </div>

            <div>
              <Label htmlFor="roles">Roles You're Looking For</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="roles"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('actively_looking_roles', roleInput))}
                  placeholder="Add a role and press Enter"
                />
                <Button type="button" onClick={() => addItem('actively_looking_roles', roleInput)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.actively_looking_roles.map((role, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeItem('actively_looking_roles', i)}>
                    {role} ×
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Skills & Additional Info
            </h3>
            <p className="text-sm text-muted-foreground">Your skills and interests</p>

            <div>
              <Label htmlFor="skills">Technical Skills *</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="skills"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('skills', skillInput))}
                  placeholder="Type a skill (e.g., React, SQL)"
                />
                <Button type="button" onClick={() => addItem('skills', skillInput)}>Add</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Press Enter or click Add to include each skill.
              </p>
              <div className="flex flex-wrap gap-2">
                {formData.skills.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeItem('skills', i)}>
                    {skill} ×
                  </Badge>
                ))}
              </div>
              {formData.skills.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Add at least one skill to continue</p>
              )}
            </div>

            <div>
              <Label htmlFor="certifications">Certifications</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="certifications"
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('certifications', certInput))}
                  placeholder="Add a certification (e.g., AWS Certified)"
                />
                <Button type="button" onClick={() => addItem('certifications', certInput)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.certifications.map((cert, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeItem('certifications', i)}>
                    {cert} ×
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="languages">Languages</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="languages"
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('languages', langInput))}
                  placeholder="Add a language (e.g., English - Fluent)"
                />
                <Button type="button" onClick={() => addItem('languages', langInput)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.languages.map((lang, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeItem('languages', i)}>
                    {lang} ×
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="hobbies">Hobbies & Interests</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="hobbies"
                  value={hobbyInput}
                  onChange={(e) => setHobbyInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('hobbies', hobbyInput))}
                  placeholder="Add a hobby"
                />
                <Button type="button" onClick={() => addItem('hobbies', hobbyInput)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.hobbies.map((hobby, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeItem('hobbies', i)}>
                    {hobby} ×
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const previewMissing = {
    full_name: !formData.full_name?.trim(),
    phone: !formData.phone?.trim(),
    location: !formData.location?.trim(),
    college: !formData.college?.trim(),
    graduation_year: !formData.graduation_year?.trim(),
    skills: formData.skills.length === 0,
  };

  const previewLabelClass = (missing: boolean) =>
    missing ? "text-red-600" : "text-muted-foreground";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile Setup</CardTitle>
          <CardDescription>Upload your resume and complete your profile</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = event.target as HTMLElement;
              if (target.tagName === "TEXTAREA") return;
              if (currentStep < 4) {
                event.preventDefault();
              }
            }}
            className="space-y-6"
          >
          {/* Resume Upload Section */}
          <Alert className="bg-primary/5 border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription>
              Upload your resume and our AI will automatically extract and fill in your profile details!
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="resume">Resume (PDF, DOC, DOCX) *</Label>
            <div className="mt-2">
              <Input
                id="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleResumeUpload}
                disabled={uploading || analyzing}
                ref={resumeInputRef}
              />
              {(resumeFile || formData.resume_url) && !uploading && !analyzing && (
                <div className="flex items-center justify-between gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {resumeFile
                      ? `${resumeFile.name} • ${formatFileSize(resumeFile.size)}`
                      : `Saved resume: ${formData.resume_url}`}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resumeInputRef.current?.click()}
                    disabled={uploading || analyzing}
                  >
                    Replace
                  </Button>
                </div>
              )}
              {(uploading || analyzing) && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {analyzing ? '✨ AI is analyzing your resume...' : 'Uploading...'}
                </div>
              )}
              {formData.skills.length > 0 && !analyzing && resumeFile && (
                <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                  <Sparkles className="h-4 w-4" />
                  Profile auto-filled from resume!
                </div>
              )}
            </div>
          </div>

          {/* Step Progress Indicator */}
          <div className="flex items-center justify-between mb-6">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex flex-col items-center gap-1 ${
                    currentStep === step.id 
                      ? 'text-primary' 
                      : validateStep(step.id) && step.id < currentStep
                        ? 'text-green-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    currentStep === step.id 
                      ? 'border-primary bg-primary/10' 
                      : validateStep(step.id) && step.id < currentStep
                        ? 'border-green-500 bg-green-50'
                        : 'border-muted-foreground/30'
                  }`}>
                    {validateStep(step.id) && step.id < currentStep ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{step.title}</span>
                </button>
                {index < STEPS.length - 1 && (
                  <div className={`w-8 md:w-16 h-0.5 mx-1 ${
                    validateStep(step.id) && step.id < currentStep
                      ? 'bg-green-500'
                      : 'bg-muted-foreground/20'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="min-h-[300px]">
            {renderStepContent()}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            {currentStep < 4 ? (
              <Button type="button" onClick={nextStep}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="outline"
                disabled={(!resumeFile && !formData.resume_url) || uploading || analyzing || savingProfile}
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </Button>
                <Button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  disabled={!profileSaved}
                >
                  Preview & Continue
                </Button>
              </div>
            )}
          </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Review Your Profile</DialogTitle>
            <DialogDescription>
              Confirm your details before continuing to verification.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto pr-1 max-h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Personal
              </div>
              <div>
                <p className={previewLabelClass(previewMissing.full_name)}>Full Name *</p>
                <p className="font-medium">{formData.full_name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{formData.email || "—"}</p>
              </div>
              <div>
                <p className={previewLabelClass(previewMissing.phone)}>Phone *</p>
                <p className="font-medium">{formData.phone || "—"}</p>
              </div>
              <div>
                <p className={previewLabelClass(previewMissing.location)}>Location *</p>
                <p className="font-medium">{formData.location || "—"}</p>
              </div>

              <div className="md:col-span-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Education
              </div>
              <div>
                <p className={previewLabelClass(previewMissing.college)}>College *</p>
                <p className="font-medium">{formData.college || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Degree / Field</p>
                <p className="font-medium">
                  {[formData.degree, formData.field_of_study].filter(Boolean).join(" • ") || "—"}
                </p>
              </div>
              <div>
                <p className={previewLabelClass(previewMissing.graduation_year)}>Graduation Year *</p>
                <p className="font-medium">{formData.graduation_year || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">CGPA</p>
                <p className="font-medium">{formData.cgpa || "—"}</p>
              </div>

              <div className="md:col-span-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Professional
              </div>
              <div>
                <p className="text-muted-foreground">Current Company</p>
                <p className="font-medium">{formData.current_company || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Role</p>
                <p className="font-medium">{formData.current_role || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Joining Date</p>
                <p className="font-medium">{formData.join_date || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Currently Working</p>
                <p className="font-medium">{formData.currently_working ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Experience (Years)</p>
                <p className="font-medium">{formData.experience_years || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Salary</p>
                <p className="font-medium">{formData.current_salary || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected Salary</p>
                <p className="font-medium">{formData.expected_salary || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Notice Period</p>
                <p className="font-medium">{formData.notice_period || "—"}</p>
              </div>

              <div className="md:col-span-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Skills
              </div>
              <div className="md:col-span-2">
                <p className={previewLabelClass(previewMissing.skills)}>Technical Skills *</p>
                <p className="font-medium">{formData.skills.length ? formData.skills.join(", ") : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground">Certifications</p>
                <p className="font-medium">{formData.certifications.length ? formData.certifications.join(", ") : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground">Languages</p>
                <p className="font-medium">{formData.languages.length ? formData.languages.join(", ") : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-muted-foreground">Bio</p>
                <p className="font-medium">{formData.bio || "—"}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Edit
            </Button>
            <Button onClick={handleContinueToVerification}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfileSetupStage;
