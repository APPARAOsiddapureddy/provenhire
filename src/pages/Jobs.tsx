import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Briefcase, DollarSign, Bookmark, BookmarkCheck, Eye, Scale, X, Shield, Filter } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import VerificationGateDialog from "@/components/VerificationGateDialog";
import JobDetailsDialog from "@/components/JobDetailsDialog";
import JobComparisonDialog from "@/components/JobComparisonDialog";
import SkillGapAnalysis from "@/components/SkillGapAnalysis";
import JobAlertSettings from "@/components/JobAlertSettings";
import VerifiedBenefitsBanner from "@/components/VerifiedBenefitsBanner";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary_range: string | null;
  job_type: string | null;
  required_skills: string[] | null;
  description: string | null;
  experience_required: number | null;
  created_at: string;
  isPremium?: boolean;
  /** PRD v4.1: tech = expert-verified gate; non_technical = nontech-verified gate */
  job_track?: 'tech' | 'non_technical';
  /** Non-technical: AI-generated assignment applicants must complete */
  assignment?: string | null;
}

const MOCK_JOBS: Job[] = [
  {
    id: 'mock-1',
    title: 'Staff Frontend Engineer',
    company: 'Nimbus Labs',
    location: 'Remote',
    salary_range: '$170k - $210k',
    required_skills: ['React', 'TypeScript', 'Tailwind'],
    description: 'Lead frontend architecture and deliver high-performance customer experiences.',
    job_type: 'Full-time',
    experience_required: 7,
    created_at: new Date().toISOString(),
    isPremium: true,
    job_track: 'tech',
  },
  {
    id: 'mock-2',
    title: 'Senior Backend Engineer (Go)',
    company: 'Atlas Data',
    location: 'New York, NY',
    salary_range: '$160k - $200k',
    required_skills: ['Go', 'PostgreSQL', 'Docker'],
    description: 'Design resilient services and optimize large-scale data pipelines.',
    job_type: 'Full-time',
    experience_required: 5,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-3',
    title: 'Lead Product Designer',
    company: 'Aurora Studio',
    location: 'San Francisco, CA',
    salary_range: '$150k - $190k',
    required_skills: ['Figma', 'UI/UX', 'Prototyping'],
    description: 'Own design systems and lead product discovery for core experiences.',
    job_type: 'Remote',
    experience_required: 6,
    created_at: new Date().toISOString(),
    isPremium: true,
    job_track: 'non_technical',
  },
  {
    id: 'mock-4',
    title: 'Principal DevOps Engineer',
    company: 'CloudScale',
    location: 'Austin, TX',
    salary_range: '$180k - $220k',
    required_skills: ['AWS', 'Kubernetes', 'Terraform'],
    description: 'Build secure, scalable infrastructure with a focus on reliability.',
    job_type: 'Contract',
    experience_required: 8,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-5',
    title: 'Growth Marketing Lead',
    company: 'GrowthInc',
    location: 'Remote',
    salary_range: '$130k - $160k',
    required_skills: ['SEO', 'Content Strategy', 'Analytics'],
    description: 'Drive acquisition strategy and manage full-funnel growth.',
    job_type: 'Full-time',
    experience_required: 5,
    created_at: new Date().toISOString(),
    isPremium: true,
    job_track: 'non_technical',
  },
  {
    id: 'mock-6',
    title: 'Senior Full Stack Engineer',
    company: 'InnovateX',
    location: 'Seattle, WA',
    salary_range: '$170k - $210k',
    required_skills: ['React', 'Node.js', 'GraphQL'],
    description: 'Ship end-to-end features across web and APIs with high quality.',
    job_type: 'Full-time',
    experience_required: 6,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-7',
    title: 'Senior iOS Engineer',
    company: 'Pulse Mobile',
    location: 'Remote',
    salary_range: '$160k - $200k',
    required_skills: ['Swift', 'iOS', 'Combine'],
    description: 'Build high-quality iOS experiences used by millions.',
    job_type: 'Full-time',
    experience_required: 5,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-8',
    title: 'Senior Data Scientist',
    company: 'Quanta AI',
    location: 'Boston, MA',
    salary_range: '$175k - $220k',
    required_skills: ['Python', 'ML', 'Statistics'],
    description: 'Develop models that power personalization and ranking.',
    job_type: 'Full-time',
    experience_required: 5,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-9',
    title: 'Engineering Manager',
    company: 'Vertex Cloud',
    location: 'Chicago, IL',
    salary_range: '$190k - $240k',
    required_skills: ['Leadership', 'System Design', 'Hiring'],
    description: 'Lead a team of engineers and scale our platform.',
    job_type: 'Full-time',
    experience_required: 7,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-10',
    title: 'Principal Security Engineer',
    company: 'Aegis Security',
    location: 'Remote',
    salary_range: '$185k - $230k',
    required_skills: ['Security', 'Cloud', 'Threat Modeling'],
    description: 'Own security architecture and risk mitigation across products.',
    job_type: 'Full-time',
    experience_required: 8,
    created_at: new Date().toISOString(),
    isPremium: true
  },
  {
    id: 'mock-11',
    title: 'Junior Web Developer',
    company: 'StartUp V',
    location: 'Remote',
    salary_range: '$50k - $70k',
    required_skills: ['HTML', 'CSS', 'JavaScript'],
    description: 'Great opportunity for freshers.',
    job_type: 'Part-time',
    experience_required: 0,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-12',
    title: 'QA Automation Engineer',
    company: 'FlowTest',
    location: 'Remote',
    salary_range: '$85k - $110k',
    required_skills: ['Playwright', 'CI/CD', 'TypeScript'],
    description: 'Build reliable test automation for web applications.',
    job_type: 'Full-time',
    experience_required: 2,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-13',
    title: 'Content Marketing Specialist',
    company: 'Storyline',
    location: 'Remote',
    salary_range: '$70k - $90k',
    required_skills: ['Content', 'SEO', 'Writing'],
    description: 'Create high-impact content for growth campaigns.',
    job_type: 'Full-time',
    experience_required: 2,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-14',
    title: 'Data Analyst',
    company: 'Metricly',
    location: 'Denver, CO',
    salary_range: '$80k - $100k',
    required_skills: ['SQL', 'Tableau', 'Excel'],
    description: 'Turn data into insights for product and growth teams.',
    job_type: 'Full-time',
    experience_required: 2,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-15',
    title: 'Customer Success Manager',
    company: 'Customerly',
    location: 'Remote',
    salary_range: '$75k - $95k',
    required_skills: ['CRM', 'Customer Success', 'Communication'],
    description: 'Own enterprise accounts and drive retention.',
    job_type: 'Full-time',
    experience_required: 3,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-16',
    title: 'Frontend Engineer',
    company: 'BrightWave',
    location: 'Remote',
    salary_range: '$105k - $135k',
    required_skills: ['React', 'JavaScript', 'CSS'],
    description: 'Build delightful UI experiences for our SaaS platform.',
    job_type: 'Full-time',
    experience_required: 3,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-17',
    title: 'Backend Engineer',
    company: 'LogiStack',
    location: 'Atlanta, GA',
    salary_range: '$110k - $140k',
    required_skills: ['Node.js', 'PostgreSQL', 'REST'],
    description: 'Develop APIs that power logistics operations.',
    job_type: 'Full-time',
    experience_required: 3,
    created_at: new Date().toISOString(),
    isPremium: false
  },
  {
    id: 'mock-18',
    title: 'Product Manager',
    company: 'LaunchPad',
    location: 'Remote',
    salary_range: '$120k - $150k',
    required_skills: ['Product', 'Roadmaps', 'Stakeholders'],
    description: 'Lead discovery and delivery for core product lines.',
    job_type: 'Full-time',
    experience_required: 4,
    created_at: new Date().toISOString(),
    isPremium: false,
    job_track: 'non_technical',
  },
  {
    id: 'mock-19',
    title: 'UI/UX Designer',
    company: 'Mint Studio',
    location: 'Los Angeles, CA',
    salary_range: '$95k - $125k',
    required_skills: ['Figma', 'Design Systems', 'Research'],
    description: 'Create user-centered designs for mobile and web.',
    job_type: 'Full-time',
    experience_required: 3,
    created_at: new Date().toISOString(),
    isPremium: false,
    job_track: 'non_technical',
  },
  {
    id: 'mock-20',
    title: 'Sales Development Rep',
    company: 'RevenueCore',
    location: 'Remote',
    salary_range: '$60k - $80k',
    required_skills: ['Sales', 'Outbound', 'CRM'],
    description: 'Generate pipeline and qualify inbound leads.',
    job_type: 'Full-time',
    experience_required: 1,
    created_at: new Date().toISOString(),
    isPremium: false,
    job_track: 'non_technical',
  }
];

const Jobs = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(6);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [pendingAssignmentResponse, setPendingAssignmentResponse] = useState<string | undefined>(undefined);
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [compareJobs, setCompareJobs] = useState<Set<string>>(new Set());
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [roleType, setRoleType] = useState<"technical" | "non_technical">("technical");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const {
    isVerified, 
    isLoading: verificationLoading, 
    verificationProgress, 
    currentStage,
    requiresVerification,
    isExpertVerified,
    isNonTechVerified,
  } = useVerificationGate();

  const isJobLocked = (job: Job) => {
    if (job.job_track === 'non_technical') return !isNonTechVerified;
    return Boolean(job.isPremium && !isExpertVerified);
  };

  // Search States
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [skill, setSkill] = useState('');

  // Filter States
  const [jobTypes, setJobTypes] = useState({
    'Full-time': false,
    'Part-time': false,
    'Remote': false,
    'Contract': false,
    'Internship': false
  });

  const [selectedSalary, setSelectedSalary] = useState('');

  const [experience, setExperience] = useState({
    'Entry Level': false,
    'Mid Level': false,
    'Senior Level': false,
  });

  // Handle URL params for job type filtering
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam) {
      const typeMap: Record<string, string> = {
        'remote': 'Remote',
        'fulltime': 'Full-time',
        'parttime': 'Part-time',
        'contract': 'Contract',
        'internship': 'Internship'
      };
      const mappedType = typeMap[typeParam.toLowerCase()];
      if (mappedType) {
        setJobTypes(prev => ({
          ...prev,
          [mappedType]: true
        }));
      }
    }
  }, [searchParams]);

  // Recruiter: job listing is for job seekers; redirect to recruiter experience
  useEffect(() => {
    if (user && userRole === 'recruiter') {
      navigate('/for-employers', { replace: true });
      return;
    }
  }, [user, userRole, navigate]);

  useEffect(() => {
    if (user && userRole === 'recruiter') return;
    loadJobs();
    if (user && userRole === 'jobseeker') {
      loadSavedJobs();
      loadAppliedJobs();
      loadUserSkills();
      setUserEmail(user.email || '');
    }
  }, [user, userRole]);

  const loadUserSkills = async () => {
    try {
      const { profile } = await api.get<{ profile: any }>("/api/users/job-seeker-profile");
      setUserSkills(profile?.skills || []);
      const rt = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical";
      setRoleType(rt);
    } catch (error: any) {
      console.error('Error loading user skills:', error);
    }
  };

  const loadAppliedJobs = async () => {
    try {
      const { applications } = await api.get<{ applications: any[] }>("/api/jobs/me/applications");
      setAppliedJobs(new Set(applications?.map((item) => item.jobId || item.job_id) || []));
    } catch (error: any) {
      console.error('Error loading applied jobs:', error);
    }
  };

  const loadJobs = async () => {
    try {
      let track: string | null = null;
      if (user && userRole === "jobseeker") {
        try {
          const { profile } = await api.get<{ profile: any }>("/api/users/job-seeker-profile");
          const rt = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
          track = rt === "non_technical" ? "non_technical" : "tech";
          setRoleType(rt as "technical" | "non_technical");
        } catch (_) {}
      }
      const url = track ? `/api/jobs?track=${track}` : "/api/jobs";
      const { jobs: data } = await api.get<{ jobs: any[] }>(url);
      const jobsData = (data || []) as unknown as (Job & { job_track?: string; jobTrack?: string; verification_required?: string })[];
      const normalizedJobs = jobsData.map(job => {
        const jt = job.job_track ?? job.jobTrack;
        return {
          ...job,
          job_track: (jt === 'non_technical' ? 'non_technical' : 'tech') as 'tech' | 'non_technical',
          isPremium: jt !== 'non_technical' && (job as any).verification_required === 'premium',
        };
      });
      const mockFiltered = track
        ? MOCK_JOBS.filter((j) =>
            track === "non_technical"
              ? j.job_track === "non_technical"
              : (j.job_track !== "non_technical" || !j.job_track)
          )
        : MOCK_JOBS;
      setJobs(normalizedJobs.length > 0 ? [...normalizedJobs, ...mockFiltered] : mockFiltered);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      setJobs(MOCK_JOBS);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedJobs = async () => {
    try {
      const { saved } = await api.get<{ saved: any[] }>("/api/jobs/me/saved");
      setSavedJobs(new Set(saved?.map((item) => item.jobId || item.job_id) || []));
    } catch (error: any) {
      console.error('Error loading saved jobs:', error);
    }
  };

  const handleJobTypeChange = (type: string) => {
    setJobTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }));
  };

  const handleExperienceChange = (level: string) => {
    setExperience(prev => ({ ...prev, [level]: !prev[level as keyof typeof prev] }));
  };

  const handleSalaryChange = (range: string) => {
    setSelectedSalary(prev => prev === range ? '' : range);
  };

  const clearFilters = () => {
    setJobTypes({ 'Full-time': false, 'Part-time': false, 'Remote': false, 'Contract': false, 'Internship': false });
    setExperience({ 'Entry Level': false, 'Mid Level': false, 'Senior Level': false });
    setSelectedSalary('');
    setKeyword('');
    setLocation('');
    setSkill('');
  };

  const getExperienceLevel = (years: number | null): string => {
    if (years === null || years === undefined) return 'Mid Level';
    if (years <= 1) return 'Entry Level';
    if (years <= 4) return 'Mid Level';
    return 'Senior Level';
  };

  const parseSalaryMax = (salaryStr: string | null): number | null => {
    if (!salaryStr) return null;
    const match = salaryStr.match(/\$?([\d,]+)k?\s*-?\s*\$?([\d,]+)k?/i) || salaryStr.match(/\$?([\d,]+)k?/i);
    if (match) {
      const max = match[2] ? parseInt(match[2].replace(/,/g, ''), 10) : parseInt(match[1].replace(/,/g, ''), 10);
      return isNaN(max) ? null : max;
    }
    return null;
  };

  const parseSalaryMin = (salaryStr: string | null): number | null => {
    if (!salaryStr) return null;
    const match = salaryStr.match(/\$?([\d,]+)k?\s*-?\s*\$?([\d,]+)k?/i);
    if (match) {
      const min = parseInt(match[1].replace(/,/g, ''), 10);
      return isNaN(min) ? null : min;
    }
    const single = salaryStr.match(/\$?([\d,]+)k?/i);
    if (single) {
      const v = parseInt(single[1].replace(/,/g, ''), 10);
      return isNaN(v) ? null : v;
    }
    return null;
  };

  const matchesSalaryRange = (job: Job, range: string): boolean => {
    const sr = job.salary_range || '';
    const min = parseSalaryMin(sr);
    const max = parseSalaryMax(sr);
    if (min == null && max == null) return true;
    const jobMin = min ?? 0;
    const jobMax = max ?? min ?? 999;
    switch (range) {
      case 'Above $100k': return jobMin >= 100 || jobMax >= 100;
      case '$80k - $100k': return jobMin <= 100 && jobMax >= 80;
      case '$60k - $80k': return jobMin <= 80 && jobMax >= 60;
      case 'Below $60k': return jobMax < 60;
      default: return true;
    }
  };

  const jobsToShow = jobs.length > 0 ? jobs : MOCK_JOBS;
  const filteredJobs = jobsToShow.filter((job) => {
    const matchesKeyword = !keyword ||
      job.title.toLowerCase().includes(keyword.toLowerCase()) ||
      job.company?.toLowerCase().includes(keyword.toLowerCase());

    const matchesLocation = !location ||
      job.location?.toLowerCase().includes(location.toLowerCase());

    const matchesSkill = !skill ||
      job.required_skills?.some(s => s.toLowerCase().includes(skill.toLowerCase()));

    const activeJobTypes = Object.entries(jobTypes).filter(([_, isActive]) => isActive).map(([type]) => type);
    const matchesJobType = activeJobTypes.length === 0 || (job.job_type && activeJobTypes.includes(job.job_type));

    const activeExperience = Object.entries(experience).filter(([_, isActive]) => isActive).map(([level]) => level);
    const jobExpLevel = getExperienceLevel(job.experience_required);
    const matchesExperience = activeExperience.length === 0 || activeExperience.includes(jobExpLevel);

    const matchesSalary = !selectedSalary || matchesSalaryRange(job, selectedSalary);

    return matchesKeyword && matchesLocation && matchesSkill && matchesJobType && matchesExperience && matchesSalary;
  });

  const displayedJobs = filteredJobs.slice(0, displayLimit);
  const lockedJobsCount = filteredJobs.filter(job => isJobLocked(job)).length;

  const handleToggleCompare = (jobId: string) => {
    const job = jobsToShow.find(j => j.id === jobId);
    if (job && isJobLocked(job)) {
      toast(job.job_track === 'non_technical' ? 'Complete non-tech verification to compare' : 'Verify your profile to compare premium roles', { icon: '🔒' });
      setShowVerificationDialog(true);
      return;
    }
    setCompareJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        if (newSet.size >= 4) {
          toast.error('You can compare up to 4 jobs at a time');
          return prev;
        }
        newSet.add(jobId);
        toast.success('Job added to comparison');
      }
      return newSet;
    });
  };

  const handleRemoveFromCompare = (jobId: string) => {
    setCompareJobs(prev => {
      const newSet = new Set(prev);
      newSet.delete(jobId);
      return newSet;
    });
  };

  const handleApplyFromCompare = (jobId: string) => {
    const job = jobsToShow.find(j => j.id === jobId);
    if (job) {
      setSelectedJob(job);
      setShowCompareDialog(false);
      setShowJobDetails(true);
    }
  };

  const getCompareJobs = () => {
    return jobsToShow.filter(job => compareJobs.has(job.id));
  };

  const handleViewJobDetails = (job: Job) => {
    if (isJobLocked(job)) {
      toast(job.job_track === 'non_technical' ? 'Complete non-tech verification to apply' : 'This role is available after verification', { icon: '🔒' });
      setShowVerificationDialog(true);
      return;
    }
    setSelectedJob(job);
    setShowJobDetails(true);
  };

  const handleApplyFromDetails = async (assignmentResponse?: string) => {
    if (!selectedJob) return;
    
    if (!user) {
      toast('Please sign in to apply', { icon: '🔒' });
      setShowJobDetails(false);
      navigate('/auth');
      return;
    }

    if (userRole !== 'jobseeker') {
      toast.error('Only job seekers can apply to jobs');
      return;
    }

    // Verification is now optional - users can apply without it
    // The benefits banner shows what they unlock by getting verified

    // For mock jobs, just show success
    if (selectedJob.id.startsWith('mock-')) {
      toast.success('Application submitted successfully!');
      setAppliedJobs(prev => new Set([...prev, selectedJob.id]));
      setShowJobDetails(false);
      return;
    }

    try {
      if (appliedJobs.has(selectedJob.id)) {
        toast.error('You have already applied to this job');
        return;
      }

      const { profile } = await api.get<{ profile: any }>("/api/users/job-seeker-profile");
      if (!profile?.resumeUrl) {
        setSelectedJobId(selectedJob.id);
        setPendingAssignmentResponse(assignmentResponse);
        setShowJobDetails(false);
        setShowResumeDialog(true);
        return;
      }

      await applyToJob(selectedJob.id, profile.resumeUrl, assignmentResponse);
      setAppliedJobs(prev => new Set([...prev, selectedJob.id]));
      setShowJobDetails(false);
    } catch (error: any) {
      console.error('Error checking application status:', error);
      toast.error('Failed to process application');
    }
  };

  const handleApplyNow = async (jobId: string) => {
    const job = jobsToShow.find(j => j.id === jobId);
    if (job) {
      handleViewJobDetails(job);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile || !selectedJobId) return;

    setUploading(true);
    try {
      const fileExt = resumeFile.name.split('.').pop();
      const fileName = `${user!.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user!.id}/${fileName}`;

      const form = new FormData();
      form.append("file", resumeFile);
      const { url } = await api.post<{ url: string }>("/api/uploads", form);
      await api.post("/api/users/job-seeker-profile", { resumeUrl: url });
      await applyToJob(selectedJobId, url, pendingAssignmentResponse);
      setShowResumeDialog(false);
      setResumeFile(null);
      setPendingAssignmentResponse(undefined);
    } catch (error: any) {
      console.error('Error uploading resume:', error);
      toast.error('Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  const applyToJob = async (jobId: string, resumeUrl: string, assignmentResponse?: string) => {
    try {
      await api.post(`/api/jobs/${jobId}/apply`, { resumeUrl, assignmentResponse: assignmentResponse || undefined });
      toast.success('Application submitted successfully!');
    } catch (error: any) {
      console.error('Error applying to job:', error);
      toast.error(error?.response?.data?.error || 'Failed to submit application');
    }
  };

  const handleSaveJob = async (jobId: string) => {
    if (!user) {
      toast('Please sign in to save jobs', { icon: '🔒' });
      navigate('/auth');
      return;
    }

    if (userRole !== 'jobseeker') {
      toast.error('Only job seekers can save jobs');
      return;
    }

    const job = jobsToShow.find(j => j.id === jobId);
    if (job && isJobLocked(job)) {
      toast(job.job_track === 'non_technical' ? 'Complete non-tech verification to save' : 'Verify your profile to save premium roles', { icon: '🔒' });
      setShowVerificationDialog(true);
      return;
    }

    // Verification is now optional for saving jobs

    // For mock jobs, just toggle locally
    if (jobId.startsWith('mock-')) {
      setSavedJobs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(jobId)) {
          newSet.delete(jobId);
          toast.success('Job removed from saved');
        } else {
          newSet.add(jobId);
          toast.success('Job saved!');
        }
        return newSet;
      });
      return;
    }

    try {
      if (savedJobs.has(jobId)) {
        await api.del(`/api/jobs/${jobId}/save`);
        setSavedJobs(prev => {
          const newSet = new Set(prev);
          newSet.delete(jobId);
          return newSet;
        });
        toast.success('Job removed from saved');
      } else {
        await api.post(`/api/jobs/${jobId}/save`, {});
        setSavedJobs(prev => new Set([...prev, jobId]));
        toast.success('Job saved!');
      }
    } catch (error: any) {
      console.error('Error saving job:', error);
      toast.error('Failed to save job');
    }
  };


  if (loading && jobs.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-secondary">
        <Navbar />
        <div className="flex-1 pt-24 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-secondary">
      <Navbar />
      
      <div className="flex-1 pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="container mx-auto px-4 sm:px-6">
          {/* Page Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-6 sm:mb-8 bg-gradient-hero bg-clip-text text-transparent">
            Find Your Dream Job
          </h1>

          {/* Premium unlock banner */}
          {!isVerified && lockedJobsCount > 0 && (
            <div className="max-w-5xl mx-auto mb-6">
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Unlock premium roles</p>
                    <p className="text-sm text-muted-foreground">
                      {lockedJobsCount} high‑package roles are available after verification.
                    </p>
                  </div>
                </div>
                <Button onClick={() => navigate(user ? '/verification' : '/auth')} className="bg-gradient-hero hover:opacity-90">
                  Get Verified
                </Button>
              </div>
            </div>
          )}

          {/* Verified Benefits Banner - Show for unverified job seekers */}
          {user && userRole === 'jobseeker' && (
            <div className="max-w-7xl mx-auto mb-6">
              <VerifiedBenefitsBanner
                isVerified={isVerified}
                verificationProgress={verificationProgress}
                onStartVerification={() => navigate('/verification')}
              />
            </div>
          )}

          {/* Advanced Search Bar */}
          <div className="jobs-search-bar max-w-5xl mx-auto mb-8">
            <div className="flex flex-col md:flex-row gap-3 p-4 bg-card rounded-xl shadow-md border border-border">
              <div className="flex-1 flex items-center gap-2">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="e.g. Software Engineer"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0"
                />
              </div>
              <div className="hidden md:block w-px bg-border" />
              <div className="flex-1 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="e.g. Bangalore"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0"
                />
              </div>
              <div className="hidden md:block w-px bg-border" />
              <div className="flex-1 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="e.g. React, Python"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0"
                />
              </div>
              <Button className="bg-gradient-hero hover:opacity-90">Search</Button>
            </div>
          </div>

          {/* Main Layout */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 max-w-7xl mx-auto">
            {/* Sidebar Filters - Desktop: sticky sidebar; Mobile: Sheet */}
            {(() => {
              const filtersContent = (
                <div className="bg-card rounded-xl p-4 sm:p-6 shadow-sm border border-border">
                  <div className="mb-6">
                    <h3 className="font-semibold mb-4 text-foreground">Job Type</h3>
                    <div className="space-y-3">
                      {Object.keys(jobTypes).map(type => (
                        <label key={type} className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={jobTypes[type as keyof typeof jobTypes]}
                            onCheckedChange={() => handleJobTypeChange(type)}
                          />
                          <span className="text-sm text-foreground">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mb-6">
                    <h3 className="font-semibold mb-4 text-foreground">Experience</h3>
                    <div className="space-y-3">
                      {Object.keys(experience).map(level => (
                        <label key={level} className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={experience[level as keyof typeof experience]}
                            onCheckedChange={() => handleExperienceChange(level)}
                          />
                          <span className="text-sm text-foreground">{level}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mb-6">
                    <h3 className="font-semibold mb-4 text-foreground">Salary</h3>
                    <div className="space-y-3">
                      {['Above $100k', '$80k - $100k', '$60k - $80k', 'Below $60k'].map(range => (
                        <label key={range} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="salary"
                            checked={selectedSalary === range}
                            onChange={() => handleSalaryChange(range)}
                            className="h-4 w-4 text-primary border-border"
                          />
                          <span className="text-sm text-foreground">{range}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </div>
              );
              return (
                <aside className="hidden lg:block w-72 shrink-0">
                  <div className="sticky top-24">{filtersContent}</div>
                </aside>
              );
            })()}

            {/* Jobs Grid */}
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{filteredJobs.length}</span> Jobs Found
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="lg:hidden">
                        <Filter className="h-4 w-4 mr-1.5" />
                        Filters
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-xl">
                      <div className="pt-2 pb-6">
                        <h3 className="font-semibold text-lg mb-4">Filters</h3>
                        <div className="bg-card rounded-xl p-4 shadow-sm border border-border space-y-6">
                          <div>
                            <h3 className="font-semibold mb-3 text-foreground">Job Type</h3>
                            <div className="space-y-2">
                              {Object.keys(jobTypes).map(type => (
                                <label key={type} className="flex items-center gap-3 cursor-pointer">
                                  <Checkbox checked={jobTypes[type as keyof typeof jobTypes]} onCheckedChange={() => handleJobTypeChange(type)} />
                                  <span className="text-sm">{type}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h3 className="font-semibold mb-3 text-foreground">Experience</h3>
                            <div className="space-y-2">
                              {Object.keys(experience).map(level => (
                                <label key={level} className="flex items-center gap-3 cursor-pointer">
                                  <Checkbox checked={experience[level as keyof typeof experience]} onCheckedChange={() => handleExperienceChange(level)} />
                                  <span className="text-sm">{level}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h3 className="font-semibold mb-3 text-foreground">Salary</h3>
                            <div className="space-y-2">
                              {['Above $100k', '$80k - $100k', '$60k - $80k', 'Below $60k'].map(range => (
                                <label key={range} className="flex items-center gap-3 cursor-pointer">
                                  <input type="radio" name="salary-mobile" checked={selectedSalary === range} onChange={() => handleSalaryChange(range)} className="h-4 w-4" />
                                  <span className="text-sm">{range}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" className="w-full" onClick={() => setMobileFiltersOpen(false)}>Done</Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                  {userRole === 'jobseeker' && (
                    <>
                      <JobAlertSettings userSkills={userSkills} userEmail={userEmail} />
                      <SkillGapAnalysis jobs={filteredJobs} userSkills={userSkills} />
                    </>
                  )}
                  {compareJobs.size > 0 && (
                    <Button
                      onClick={() => setShowCompareDialog(true)}
                      className="bg-gradient-hero hover:opacity-90"
                    >
                      <Scale className="h-4 w-4 mr-2" />
                      Compare ({compareJobs.size})
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedJobs.map((job) => {
                  const isPremiumLocked = isJobLocked(job);
                  return (
                  <div key={job.id} className={`job-card bg-card rounded-xl p-4 sm:p-6 shadow-sm border transition-all ${compareJobs.has(job.id) ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:shadow-lg hover:border-primary/30'} ${isPremiumLocked ? 'opacity-70' : ''}`}>
                    {/* Badges + Compare — top row, no overlap */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex flex-wrap gap-1.5 min-w-0">
                        {(job.isPremium || job.job_track === 'non_technical') && (
                          job.job_track === 'non_technical' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#00C9A7]/90 border border-[#00F5D4]/50 text-[#0B1C2D] text-xs font-semibold">
                              Non-Technical
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/20 border border-primary/40 text-primary text-xs font-semibold">
                              Premium
                            </span>
                          )
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleCompare(job.id)}
                        className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                          compareJobs.has(job.id) 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                        }`}
                        title={compareJobs.has(job.id) ? 'Remove from comparison' : 'Add to comparison'}
                        disabled={isPremiumLocked}
                      >
                        {compareJobs.has(job.id) ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Scale className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {job.company?.[0] || 'C'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
                        <p className="text-sm text-muted-foreground">{job.company}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location || 'Remote'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.job_type || 'Full-time'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-sm font-medium text-accent mb-4">
                      <DollarSign className="h-4 w-4" />
                      {job.salary_range || 'Competitive'}
                    </div>

                    {job.required_skills && job.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {job.required_skills.slice(0, 3).map((s, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {job.required_skills.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{job.required_skills.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Verified Priority Indicator */}
                    {user && userRole === 'jobseeker' && !isVerified && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3 bg-secondary/50 rounded-lg px-2 py-1.5">
                        <Shield className="h-3 w-3" />
                        <span>Verified applicants get priority review</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleViewJobDetails(job)}
                        disabled={isPremiumLocked}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button
                        className="flex-1 bg-gradient-hero hover:opacity-90"
                        onClick={() => handleApplyNow(job.id)}
                        disabled={appliedJobs.has(job.id) || isPremiumLocked}
                      >
                        {appliedJobs.has(job.id) ? 'Applied' : 'Apply Now'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleSaveJob(job.id)}
                        className={savedJobs.has(job.id) ? 'text-primary border-primary' : ''}
                        disabled={isPremiumLocked}
                      >
                        {savedJobs.has(job.id) ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {isPremiumLocked && (
                      <div className="mt-3 bg-secondary/70 border border-border rounded-lg p-3 text-sm text-muted-foreground flex items-center justify-between gap-3">
                        <span>{job.job_track === 'non_technical' ? 'Complete non-tech verification to apply.' : 'Verify to unlock this premium role.'}</span>
                        <Button size="sm" onClick={() => navigate(user ? '/verification' : '/auth')}>
                          Get Verified
                        </Button>
                      </div>
                    )}
                  </div>
                )})}
              </div>

              {filteredJobs.length === 0 && (
                <div className="text-center py-12 bg-card rounded-xl border border-border">
                  <p className="text-muted-foreground">No jobs found matching your criteria.</p>
                </div>
              )}

              {filteredJobs.length > displayLimit && (
                <div className="mt-8 text-center">
                  <p className="text-muted-foreground mb-4">
                    Showing {displayedJobs.length} of {filteredJobs.length} jobs
                  </p>
                  <Button variant="outline" size="lg" onClick={() => setDisplayLimit(prev => prev + 6)}>
                    Load More
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume Upload Dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Your Resume</DialogTitle>
            <DialogDescription>
              Please upload your resume to apply for this position
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="resume">Resume (PDF, DOC, DOCX)</Label>
              <Input
                id="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
            </div>
            <Button
              className="w-full bg-gradient-hero hover:opacity-90"
              onClick={handleResumeUpload}
              disabled={!resumeFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload and Apply'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verification Gate Dialog */}
      <VerificationGateDialog
        open={showVerificationDialog}
        onOpenChange={setShowVerificationDialog}
        verificationProgress={verificationProgress}
        currentStage={currentStage}
      />

      {/* Job Details Dialog */}
      <JobDetailsDialog
        job={selectedJob}
        open={showJobDetails}
        onOpenChange={setShowJobDetails}
        onApply={handleApplyFromDetails}
        hasApplied={selectedJob ? appliedJobs.has(selectedJob.id) : false}
      />

      {/* Job Comparison Dialog */}
      <JobComparisonDialog
        jobs={getCompareJobs()}
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
        onRemoveJob={handleRemoveFromCompare}
        onApply={handleApplyFromCompare}
        appliedJobs={appliedJobs}
        userSkills={userSkills}
      />

      <Footer />
    </div>
  );
};

export default Jobs;
