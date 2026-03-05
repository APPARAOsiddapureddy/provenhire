import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle, Clock, LogOut, Settings, TrendingUp, Award, Eye, FileText, BookmarkCheck, Trash2, ExternalLink, User, Lock, ShieldAlert, LayoutGrid, FileCheck, ListChecks } from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";
import { Link, useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SkillPassport from "@/components/SkillPassport";
import ReferAFriend from "@/components/ReferAFriend";
import VerificationGateDialog from "@/components/VerificationGateDialog";
import JobTitleModal from "@/components/JobTitleModal";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import { Skeleton } from "@/components/ui/skeleton";
import { preloadVerificationFlow } from "@/preloads";
import DashboardShell from "@/components/DashboardShell";

const TECHNICAL_STAGE_ORDER = ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview', 'human_expert_interview'] as const;
const NON_TECHNICAL_STAGE_ORDER = ['profile_setup', 'non_tech_assignment', 'human_expert_interview'] as const;
const STAGE_LABELS: Record<string, string> = {
  profile_setup: 'Profile Setup',
  aptitude_test: 'Aptitude Test',
  dsa_round: 'DSA Round',
  non_tech_assignment: 'Assignment',
  expert_interview: 'AI Expert Interview',
  human_expert_interview: 'Human Expert Interview',
};

const JobSeekerDashboard = () => {
  const { user, signOut, changePassword } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [verificationStages, setVerificationStages] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<{ aptitude: any; dsa: any }>({ aptitude: null, dsa: null });
  const [certificationLevel, setCertificationLevel] = useState<"A" | "B" | "C" | null>(null);
  const [stats, setStats] = useState({
    applicationsSent: 0,
    interviews: 0,
    profileViews: 0,
  });
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState({
    bio: '',
    location: '',
    phone: '',
    skills: [] as string[],
  });
  const [skillInput, setSkillInput] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<'candidate' | 'passport' | 'applications'>('candidate');
  const showJobTitleModal = Boolean(
    !loading &&
    profile &&
    !(profile.targetJobTitle ?? profile.target_job_title)?.trim()
  );
  const roleType = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical";
  const stageOrder = roleType === "non_technical" ? [...NON_TECHNICAL_STAGE_ORDER] : [...TECHNICAL_STAGE_ORDER];

  /** Highest completed stage for Skill Passport progressive display */
  const completedUpToStage = (() => {
    if (!verificationStages.length) return null;
    const completed = verificationStages.filter((s: { status?: string }) => s.status === "completed");
    if (roleType === "technical") {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "human_expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "ai_interview";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "dsa_round")) return "dsa";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "aptitude_test")) return "aptitude";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    } else {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "non_tech_assignment")) return "assignment";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    }
    return null;
  })();

  const getStageStatus = (stageName: string): 'done' | 'active' | 'locked' => {
    const stage = verificationStages.find((s: any) => s.stage_name === stageName);
    if (!stage) {
      const idx = stageOrder.indexOf(stageName);
      const prevDone = idx > 0 && verificationStages.some((s: any) => s.stage_name === stageOrder[idx - 1] && s.status === 'completed');
      return prevDone ? 'active' : idx === 0 ? 'active' : 'locked';
    }
    if (stage.status === 'completed') return 'done';
    if (stage.status === 'in_progress') return 'active';
    return 'locked';
  };

  const activeStageIndex = stageOrder.findIndex((s) => getStageStatus(s) === 'active');
  const nextStageLabel = activeStageIndex >= 0 && activeStageIndex < stageOrder.length
    ? STAGE_LABELS[stageOrder[activeStageIndex]]
    : 'Verification';

  const {
 
    isVerified, 
    verificationProgress: gateProgress, 
    currentStage,
    requiresVerification 
  } = useVerificationGate();

  const profileChecklist = [
    {
      label: "Personal details",
      done: Boolean((profile?.fullName ?? profile?.full_name) && profile?.phone && profile?.location),
    },
    {
      label: "Education",
      done: Boolean((profile?.college || profile?.graduationYear || profile?.graduation_year)),
    },
    {
      label: "Skills",
      done: Boolean(profile?.skills && (Array.isArray(profile.skills) ? profile.skills.length > 0 : true)),
    },
  ];
  const profileCompletion = profileChecklist.length
    ? Math.round(
        (profileChecklist.filter((item) => item.done).length / profileChecklist.length) * 100
      )
    : 0;
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setShowPasswordDialog(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      // handled in context
    }
  };

  const handleRestrictedAction = () => {
    if (requiresVerification()) {
      setShowVerificationDialog(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setProfile(null);
      setApplications([]);
      setSavedJobs([]);
      setVerificationStages([]);
      setTestResults({ aptitude: null, dsa: null });
      return;
    }
    setLoading(true);
    setLoadError(false);
    loadDashboardData();
  }, [user?.id]);

  // Preload Verification flow chunk so /verification opens fast when user clicks
  useEffect(() => {
    const id = setTimeout(() => preloadVerificationFlow(), 300);
    return () => clearTimeout(id);
  }, []);

  const loadDashboardData = async () => {
    const FETCH_TIMEOUT_MS = 20000;
    try {
      const queries = [
        api.get<{ profile: any }>("/api/users/job-seeker-profile"),
        api.get<{ applications: any[] }>("/api/jobs/me/applications"),
        api.get<{ saved: any[] }>("/api/jobs/me/saved"),
        api.get<{ stages: any[] }>("/api/verification/stages"),
        api.get<{ result: any }>("/api/verification/aptitude/latest"),
        api.get<{ result: any }>("/api/verification/dsa/latest"),
      ];
      const fetchPromise = Promise.allSettled(queries).then((results) =>
        results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason }))
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Dashboard request timed out. Check your connection and try again.')), FETCH_TIMEOUT_MS)
      );
      const resolved = await Promise.race([fetchPromise, timeoutPromise]);
      const [profileData, applicationsData, savedJobsData, stagesData, aptitudeData, dsaData] = resolved;

      const hasError = resolved.some((r: { error?: unknown }) => r?.error);
      setLoadError(hasError);
      if (hasError) {
        toast.error('Some data could not be loaded. Showing what’s available. Use Retry below if needed.');
      }

      const profile = profileData?.profile ?? null;
      const applicationsList = Array.isArray(applicationsData?.applications) ? applicationsData.applications : [];
      const savedList = Array.isArray(savedJobsData?.saved) ? savedJobsData.saved : [];
      const stagesList = Array.isArray(stagesData?.stages) ? stagesData.stages : [];
      const aptitudeResult = aptitudeData?.result ?? null;
      const dsaResult = dsaData?.result ?? null;

      if (profile) {
        setProfile(profile);
        setEditingProfile({
          bio: profile.bio || '',
          location: profile.location || '',
          phone: profile.phone || '',
          skills: profile.skills || [],
        });
      } else {
        setProfile(null);
      }
      setApplications(applicationsList);
      setSavedJobs(savedList);
      setVerificationStages(stagesList);
      setTestResults({ aptitude: aptitudeResult, dsa: dsaResult });

      if (profile?.verificationStatus === 'expert_verified' || profile?.verificationStatus === 'verified') {
        const role = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
        const interviewStage = stagesList.find((s: { stage_name?: string }) => s.stage_name === 'expert_interview');
        const interviewScore = interviewStage?.score ?? 0;
        if (role === "non_technical") {
          const pct = interviewScore ? Math.round((interviewScore / 15) * 100) : 0;
          if (pct >= 80) setCertificationLevel("A");
          else if (pct >= 60) setCertificationLevel("B");
          else setCertificationLevel("C");
        } else {
          const aptitudeScore = aptitudeResult?.total_score ?? 0;
          const dsaScore = dsaResult?.total_score ?? 0;
          const overallAvg = (aptitudeScore + dsaScore + interviewScore) / 3;
          if (overallAvg >= 12) setCertificationLevel("A");
          else if (overallAvg >= 9) setCertificationLevel("B");
          else setCertificationLevel("C");
        }
      }

      setStats({
        applicationsSent: applicationsList.length,
        interviews: applicationsList.filter((a: { status?: string }) => a.status === 'interview_scheduled').length,
        profileViews: profile?.profileViews ?? 0,
      });

      if (stagesList.length > 0) {
        const completed = stagesList.filter((s: { status?: string }) => s.status === 'completed').length;
        const role = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
        const total = role === "non_technical" ? 3 : 5;
        setVerificationProgress((completed / total) * 100);
      }
    } catch (error: unknown) {
      console.error('Error loading dashboard data:', error);
      setLoadError(true);
      const msg = error instanceof Error ? error.message : 'Failed to load dashboard';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSavedJob = async (savedJobId: string, jobId: string) => {
    try {
      await api.del(`/api/jobs/${jobId}/save`);

      setSavedJobs(prev => prev.filter(j => j.id !== savedJobId));
      toast.success('Job removed from saved');
    } catch (error: any) {
      console.error('Error removing saved job:', error);
      toast.error('Failed to remove saved job');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await api.post("/api/users/job-seeker-profile", {
        bio: editingProfile.bio,
        location: editingProfile.location,
        phone: editingProfile.phone,
        skills: editingProfile.skills,
      });

      setProfile((prev: any) => ({
        ...prev,
        ...editingProfile
      }));
      setShowProfileDialog(false);
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const addSkill = () => {
    if (skillInput.trim() && !editingProfile.skills.includes(skillInput.trim())) {
      setEditingProfile(prev => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim()]
      }));
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setEditingProfile(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill)
    }));
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'applied': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'reviewing': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      'interview_scheduled': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      'rejected': 'bg-red-500/20 text-red-300 border-red-500/30',
      'hired': 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    };
    return statusColors[status] || 'bg-white/10 text-gray-300 border-white/10';
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Lock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const statsDisplay = [
    { label: "Applications Sent", value: stats.applicationsSent.toString(), icon: Briefcase, color: "text-primary" },
    { label: "Interviews", value: stats.interviews.toString(), icon: TrendingUp, color: "text-accent" },
    { label: "Profile Views", value: stats.profileViews.toString(), icon: Eye, color: "text-secondary-foreground" },
  ];

  const sidebarSections: import("@/components/DashboardShell").DashboardSidebarSection[] = [
    {
      sectionLabel: "Candidate",
      items: [
        { label: "Verification Pipeline", onClick: () => setDashboardSection('candidate'), active: dashboardSection === 'candidate', icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
        { label: "Skill Passport", onClick: () => setDashboardSection('passport'), active: dashboardSection === 'passport', badge: isVerified ? "Active" : undefined, icon: <FileCheck className="w-[18px] h-[18px]" /> },
        { label: "Job Listings", to: "/jobs", icon: <Briefcase className="w-[18px] h-[18px]" /> },
        { label: "Applications", onClick: () => setDashboardSection('applications'), active: dashboardSection === 'applications', icon: <ListChecks className="w-[18px] h-[18px]" /> },
      ],
    },
  ];

  const userName = (profile?.fullName ?? profile?.full_name) || user?.email?.split('@')[0] || 'Candidate';
  const userInitials = ((profile?.fullName ?? profile?.full_name) || user?.email || 'U').split(/\s|@/).map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      <JobTitleModal
        open={showJobTitleModal}
        roleType={roleType}
        onSave={(title) => {
          setProfile((p: any) => (p ? { ...p, targetJobTitle: title } : p));
        }}
      />
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: userName, role: isVerified ? "Expert Verified ✦" : "Verification in progress", initials: userInitials }}
      >
        {loadError && (
          <div className="dashboard-section-content">
            <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span>Some data could not be loaded (e.g. slow connection or region).</span>
              <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-200 hover:bg-amber-500/20" onClick={() => { setLoadError(false); setLoading(true); loadDashboardData(); }}>Retry</Button>
            </div>
          </div>
        )}
        {loading && (
          <div className="dashboard-section-content space-y-6">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <div className="dashboard-stages-grid">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        )}
        {!loading && dashboardSection === 'passport' && (
          <div className="dashboard-section-content">
            <div className="dashboard-section-header">
              <div>
                <h1>Skill Passport</h1>
                <p>Your verified, portable credential — accepted by all ProvenHire partner companies</p>
              </div>
            </div>
            {profile && (
              <SkillPassport
                certificationLevel={certificationLevel}
                skills={profile.skills || []}
                verificationStatus={profile.verificationStatus ?? profile.verification_status}
                roleType={roleType}
                completedUpToStage={completedUpToStage}
                aptitudeScore={testResults.aptitude ? Math.round(testResults.aptitude.total_score ?? 0) : undefined}
                dsaScore={testResults.dsa ? Math.round((testResults.dsa.total_score / 15) * 100) : undefined}
                interviewScore={verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score ? Math.round((verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score / 15) * 100) : undefined}
              />
            )}
          </div>
        )}
        {!loading && dashboardSection === 'applications' && (
          <div className="dashboard-section-content">
            <div className="dashboard-section-header">
              <div>
                <h1>Applications</h1>
                <p>Track your job applications and saved jobs</p>
              </div>
              <Button asChild className="dashboard-btn-gold">
                <Link to="/jobs">Browse Jobs</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Your Applications</span>
                    <Badge variant="outline">{applications.length} total</Badge>
                  </CardTitle>
                  <CardDescription>Track your job applications</CardDescription>
                </CardHeader>
                <CardContent>
                  {applications.length === 0 ? (
                    <div className="text-center py-8">
                      <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground mb-4">No applications yet. Start browsing jobs!</p>
                      <Button asChild className="dashboard-btn-gold"><Link to="/jobs">Browse Jobs</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {applications.map((app) => (
                        <div key={app.id} className="flex items-center justify-between p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate text-white">{(app.job ?? app.jobs)?.title || 'Unknown Position'}</h3>
                            <p className="text-sm text-[var(--dash-text-muted)]">{(app.job ?? app.jobs)?.company || 'Unknown Company'}</p>
                            <p className="text-sm text-[var(--dash-text-muted)] mt-1">Applied {new Date(app.appliedAt ?? app.applied_at).toLocaleDateString()}</p>
                          </div>
                          <Badge className={getStatusBadge(app.status)}>{app.status.replace('_', ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Saved Jobs</span>
                    <Badge variant="outline">{savedJobs.length} saved</Badge>
                  </CardTitle>
                  <CardDescription>Jobs you've bookmarked for later</CardDescription>
                </CardHeader>
                <CardContent>
                  {savedJobs.length === 0 ? (
                    <div className="text-center py-8">
                      <BookmarkCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground mb-4">No saved jobs yet.</p>
                      <Button asChild className="dashboard-btn-gold"><Link to="/jobs">Browse Jobs</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {savedJobs.map((saved) => (
                        <div key={saved.id} className="flex items-center justify-between p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate text-white">{(saved.job ?? saved.jobs)?.title || 'Unknown Position'}</h3>
                            <p className="text-sm text-[var(--dash-text-muted)]">{(saved.job ?? saved.jobs)?.company || 'Unknown Company'}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button className="dashboard-btn-ghost" size="sm" asChild><Link to="/jobs"><ExternalLink className="h-3 w-3" /></Link></Button>
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleRemoveSavedJob(saved.id, saved.jobId ?? saved.job_id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        {!loading && dashboardSection === 'candidate' && (
          <div className="dashboard-candidate-section">
            <div className="dashboard-section-header flex-wrap gap-4">
              <div className="section-header-left">
                <h1>Verification Pipeline</h1>
                <p>
                  {roleType === "non_technical"
                    ? "Complete all 3 stages to unlock your Skill Passport and access premium opportunities"
                    : "Complete all 5 stages to unlock your Skill Passport and access premium opportunities"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="dashboard-proc-indicator">
                  <span className="dashboard-rec-dot" />
                  Session Proctored
                </span>
                <Button className="dashboard-btn-gold" onClick={() => navigate('/verification')}>
                  Continue {nextStageLabel} →
                </Button>
                <Button className="dashboard-btn-ghost" size="sm" onClick={() => setShowProfileDialog(true)}>Edit Profile</Button>
                <Button className="dashboard-btn-ghost" size="sm" onClick={() => setShowPasswordDialog(true)}>Reset Password</Button>
                <Button className="dashboard-btn-ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sign Out</Button>
              </div>
            </div>
            <div className="dashboard-section-content">
              <div className="dashboard-stage-header-card">
                <div className="flex justify-between items-start flex-wrap gap-4 mb-7">
                  <div>
                    <div className="dashboard-stage-greeting">Welcome back,</div>
                    <div className="dashboard-stage-name">{userName.split(' ')[0]} <span>{userName.split(' ').slice(1).join(' ') || ''}</span></div>
                    <div className="flex items-center gap-2 mt-2 text-base font-medium text-white/60">
                      <span>{profile?.current_role || profile?.current_company || 'Candidate'}</span>
                      {isVerified && <><span style={{ width: 4, height: 4, background: 'var(--dash-gold)', borderRadius: '50%', display: 'inline-block' }} /><span>Expert Verified Path</span></>}
                    </div>
                  </div>
                  <div className="dashboard-stage-time-badge">
                    <div className="dashboard-stage-time-label">Time to full verify</div>
                    <div className="dashboard-stage-time-value">≤ 48h</div>
                    <div className="dashboard-stage-time-label mt-1">
                      Complete all {roleType === "non_technical" ? 3 : 5} stages
                    </div>
                  </div>
                </div>
                <div className="dashboard-stage-progress-bar">
                  {stageOrder.map((stageName, idx) => {
                    const status = getStageStatus(stageName);
                    return (
                      <div key={stageName} className={`dashboard-stage-progress-step ${status}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className={`dashboard-stage-dot ${status}`}>
                            {status === 'done' ? '✓' : idx + 1}
                          </div>
                          <div className="dashboard-stage-dot-label">{STAGE_LABELS[stageName]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dashboard-stages-grid">
                {stageOrder.filter((s) => s !== 'human_expert_interview').map((stageName, idx) => {
                  const status = getStageStatus(stageName);
                  const isCompleted = status === 'done';
                  const isActive = status === 'active';
                  const isLocked = status === 'locked';
                  const aptitudePct = testResults.aptitude ? Math.round(testResults.aptitude.total_score ?? 0) : null;
                  const dsaSolved = testResults.dsa ? `${testResults.dsa.problems_solved || 0}/${testResults.dsa.total_problems || 4}` : null;
                  const stageDesc: Record<string, string> = {
                    profile_setup: 'AI-assisted profile creation with resume parsing and consistency checks.',
                    aptitude_test: 'Proctored 60-minute test covering logical reasoning, quantitative aptitude, and verbal ability.',
                    dsa_round: 'Proctored coding round with 2–4 algorithmic problems of increasing difficulty.',
                    non_tech_assignment: 'Role-based written assignment tailored to your target job title.',
                    expert_interview: 'Adaptive AI video interview. Questions generated from your resume, role, and experience level.',
                  };
                  return (
                    <div
                      key={stageName}
                      className={`dashboard-stage-card ${isCompleted ? 'completed' : ''} ${isActive ? 'active-stage' : ''} ${isLocked ? 'locked-stage' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`dashboard-stage-num ${isCompleted ? 'done-num' : isActive ? 'active-num' : 'locked-num'}`}>
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className={`flex items-center gap-1.5 dashboard-stage-pill px-3 py-1.5 rounded-[20px] ${isCompleted ? 'dashboard-pill-verified' : isActive ? 'dashboard-pill-active' : 'dashboard-pill-locked'}`}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {isCompleted ? 'Verified' : isActive ? 'In Progress' : 'Locked'}
                        </div>
                      </div>
                      <h3 className="dashboard-stage-card-title">{STAGE_LABELS[stageName]}</h3>
                      <p className="dashboard-stage-card-desc">{stageDesc[stageName] ?? ''}</p>
                      <div className="flex flex-wrap gap-1">
                        {stageName === 'profile_setup' && <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> AI Parsed</span>}
                        {stageName === 'aptitude_test' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Webcam Active</span></>}
                        {stageName === 'dsa_round' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Sandbox Executed</span></>}
                        {stageName === 'non_tech_assignment' && <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Job-Specific</span>}
                        {stageName === 'expert_interview' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Recording Active</span><span className="dashboard-trust-chip"><span style={{ background: 'var(--dash-gold)' }} className="w-1.5 h-1.5 rounded-full" /> AI Adaptive</span></>}
                      </div>
                      {isCompleted && stageName === 'profile_setup' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isCompleted && stageName === 'aptitude_test' && aptitudePct != null && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: `${aptitudePct}%` }} /></div><div className="dashboard-score-text">Score: {aptitudePct}%</div></>
                      )}
                      {isCompleted && stageName === 'dsa_round' && dsaSolved && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: '75%' }} /></div><div className="dashboard-score-text">{dsaSolved} Problems Solved</div></>
                      )}
                      {isCompleted && stageName === 'non_tech_assignment' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isCompleted && stageName === 'expert_interview' && <div className="dashboard-score-text">Certified Level {certificationLevel || '—'}</div>}
                      {isActive && (
                        <Button className="dashboard-btn-gold w-full mt-4 py-3" onClick={() => navigate('/verification')}>
                          Begin {STAGE_LABELS[stageName]} →
                        </Button>
                      )}
                    </div>
                  );
                })}

                {roleType === 'technical' && (
                <div className={`dashboard-stage-card locked-stage full-width ${getStageStatus('human_expert_interview') === 'locked' ? 'locked-stage' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="dashboard-stage-num locked-num">05</div>
                    <div className="dashboard-pill-locked flex items-center gap-1.5 dashboard-stage-pill px-3 py-1.5 rounded-[20px]">
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--dash-text-muted)' }} /> Locked
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 items-start">
                    <div>
                      <h3 className="dashboard-stage-card-title">Human Expert Interview</h3>
                      <p className="dashboard-stage-card-desc">
                        30–45 min live video interview with a domain expert (5+ yrs experience). NDA signed. Cannot be gamed by coaching or scripted answers.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Live Recorded</span>
                        <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> ID Verified</span>
                        <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> NDA Expert</span>
                      </div>
                    </div>
                    <div className="rounded-xl p-4 bg-white/5 border border-[var(--dash-navy-border)]">
                      <div className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-muted)] mb-2">Slot availability (after Stage 4)</div>
                      <div className="text-base font-bold text-[var(--dash-gold)]">Within 4–12 hours</div>
                      <div className="text-sm text-[var(--dash-text-muted)] mt-1">8 active experts · Morning, Evening & Weekend slots</div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DashboardShell>

      {/* Profile Edit Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your job seeker profile information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                placeholder="Tell us about yourself..."
                value={editingProfile.bio}
                onChange={(e) => setEditingProfile(prev => ({ ...prev, bio: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="e.g. Bangalore or Gurugram"
                  value={editingProfile.location}
                  onChange={(e) => setEditingProfile(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="+91 98765 43210"
                  value={editingProfile.phone}
                  onChange={(e) => setEditingProfile(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                />
                <Button type="button" onClick={addSkill} variant="outline">
                  Add
                </Button>
              </div>
              {editingProfile.skills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editingProfile.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="px-3 py-1">
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="ml-2 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateProfile}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Enter your current password to set a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleChangePassword}>
                Update Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verification Gate Dialog */}
      <VerificationGateDialog
        open={showVerificationDialog}
        onOpenChange={setShowVerificationDialog}
        verificationProgress={gateProgress}
        currentStage={currentStage}
      />
    </div>
  );
};

export default JobSeekerDashboard;
