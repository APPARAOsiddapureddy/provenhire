import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Users, Calendar, UserCheck, Plus, Trash2, MapPin, Building2, Mail, Phone, Edit, LogOut, LayoutGrid, ChevronRight, FileText, Lock, CheckCircle2 } from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import DashboardShell from "@/components/DashboardShell";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  status: string | null;
  created_at: string;
  salary_range: string | null;
  job_type: string | null;
  description: string | null;
  required_skills: string[] | null;
  experience_required: number | null;
}

interface Application {
  id: string;
  job_id: string;
  job_seeker_id: string;
  status: string;
  applied_at: string;
  resume_url: string;
  jobs?: {
    title: string;
    company: string;
  };
}

interface RecruiterProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  designation: string | null;
  company_website: string | null;
  industry: string | null;
  hiring_for: string | null;
  onboarding_completed: boolean | null;
}

interface TalentCandidate {
  id: string;
  user_id: string;
  full_name?: string | null;
  current_role: string | null;
  experience_years: number | null;
  verification_status: string | null;
  skills: string[] | null;
  actively_looking_roles: string[] | null;
  resume_url: string | null;
}

const RecruiterDashboard = () => {
  const { user, signOut, changePassword } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [candidates, setCandidates] = useState<TalentCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalApplicants: 0,
    interviewsScheduled: 0,
    hiredCount: 0,
    profileViews: 0,
  });
  const [activeTab, setActiveTab] = useState<'discover' | 'jobs' | 'pipeline'>('discover');
  const [domainFilter, setDomainFilter] = useState<Record<string, boolean>>({
    'Software Engineering': true,
    'Data Science': false,
    'Product Management': false,
  });
  const [tierFilter, setTierFilter] = useState<Record<string, boolean>>({
    'A': true,
    'B': true,
    'C': false,
  });
  const [talentSort, setTalentSort] = useState<string>('highest_score');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const isTestAccount = user?.id?.startsWith?.('bypass-');

  const handleChangePassword = async () => {
    if (isTestAccount) {
      toast.info("Test accounts don't have a password to change. Sign in with a full account to use this.");
      setShowPasswordDialog(false);
      return;
    }
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
  const [editedProfile, setEditedProfile] = useState({
    full_name: '',
    phone: '',
    company_name: '',
  });

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    const FETCH_TIMEOUT_MS = 20000;
    try {
      const fetchPromise = Promise.all([
        api.get<{ jobs: Job[] }>("/api/jobs/recruiter"),
        api.get<{ profile: RecruiterProfile | null }>("/api/users/recruiter-profile"),
        api.get<{ applications: Application[] }>("/api/jobs/recruiter/applications"),
        api.get<{ profiles: TalentCandidate[] }>("/api/users/candidates"),
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Dashboard request timed out. Check your connection and try again.')), FETCH_TIMEOUT_MS)
      );
      const [jobsResult, profileResult, applicationsResult, candidatesResult] = await Promise.race([
        fetchPromise,
        timeoutPromise,
      ]);

      setJobs(jobsResult.jobs || []);
      setProfile(profileResult.profile as RecruiterProfile | null);
      if (profileResult.profile) {
        setEditedProfile({
          full_name: (profileResult.profile as any).full_name || "",
          phone: (profileResult.profile as any).phone || "",
          company_name: (profileResult.profile as any).company_name || "",
        });
      }

      setApplications(applicationsResult.applications || []);
      setCandidates(candidatesResult.profiles || []);

      setStats({
        activeJobs: (jobsResult.jobs || []).length,
        totalApplicants: (applicationsResult.applications || []).length,
        interviewsScheduled: (applicationsResult.applications || []).filter((a) => a.status === "interview_scheduled").length,
        hiredCount: (applicationsResult.applications || []).filter((a) => a.status === "hired").length,
        profileViews: Math.floor(Math.random() * 500) + 100,
      });
    } catch (error: unknown) {
      console.error('Error loading dashboard data:', error);
      const msg = error instanceof Error ? error.message : 'Failed to load dashboard data';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleViewJobDetails = async (job: Job) => {
    setSelectedJob(job);
    setShowJobDetails(true);
    const { applications } = await api.get<{ applications: Application[] }>(`/api/jobs/${job.id}/applications`);
    setJobApplications(applications || []);
  };

  const handleToggleJobStatus = async (jobId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    try {
      await api.post(`/api/jobs/${jobId}/status`, { status: newStatus });

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
      toast.success(`Job ${newStatus === 'active' ? 'activated' : 'closed'} successfully`);
    } catch (error: any) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job status');
    }
  };

  const handleDeleteJob = async () => {
    if (!jobToDelete) return;
    try {
      await api.del(`/api/jobs/${jobToDelete}`);

      setJobs(prev => prev.filter(j => j.id !== jobToDelete));
      setJobToDelete(null);
      toast.success('Job deleted successfully');
    } catch (error: any) {
      console.error('Error deleting job:', error);
      toast.error('Failed to delete job');
    }
  };

  const handleUpdateApplicationStatus = async (applicationId: string, newStatus: string) => {
    try {
      await api.post(`/api/jobs/applications/${applicationId}/status`, { status: newStatus });
      await api.post("/api/notifications/status", { applicationId, newStatus });

      setApplications(prev => prev.map(a => a.id === applicationId ? { ...a, status: newStatus } : a));
      setJobApplications(prev => prev.map(a => a.id === applicationId ? { ...a, status: newStatus } : a));
      toast.success('Application status updated & notification sent');
    } catch (error: any) {
      console.error('Error updating application:', error);
      toast.error('Failed to update application status');
    }
  };

  const handleUpdateProfile = async () => {
    if (isTestAccount) {
      toast.info('Test accounts can\'t save profile changes. Sign in with a full account to update your profile.');
      setShowProfileEdit(false);
      return;
    }
    try {
      await api.post("/api/users/recruiter-profile", {
        companyName: editedProfile.company_name,
        phone: editedProfile.phone,
      });

      setProfile(prev => prev ? { ...prev, ...editedProfile } : null);
      setShowProfileEdit(false);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error?.message || 'Failed to update profile');
    }
  };

  const statsDisplay = [
    { label: "Active Jobs", value: stats.activeJobs.toString(), icon: Briefcase },
    { label: "Verified Applicants", value: stats.totalApplicants.toString(), icon: Users },
    { label: "Interviews Scheduled", value: stats.interviewsScheduled.toString(), icon: Calendar },
    { label: "Hires This Month", value: stats.hiredCount.toString(), icon: UserCheck },
  ];

  const filteredCandidates = useMemo(() => {
    let list = [...candidates];
    const activeDomains = Object.entries(domainFilter).filter(([, v]) => v).map(([k]) => k);
    if (activeDomains.length > 0) {
      list = list.filter(c => {
        const roles = c.actively_looking_roles || [];
        const roleStr = (c.current_role || '') + (roles.join(' '));
        return activeDomains.some(d => roleStr.toLowerCase().includes(d.toLowerCase().replace(/\s/g, '')) || (c.skills || []).some(s => s.toLowerCase().includes(d.split(' ')[0].toLowerCase())));
      });
    }
    if (talentSort === 'highest_score') list = [...list].sort((a, b) => (b.experience_years ?? 0) - (a.experience_years ?? 0));
    if (talentSort === 'newest') list = [...list];
    return list;
  }, [candidates, domainFilter, talentSort]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'closed': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'draft': return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  const getApplicationStatusColor = (status: string) => {
    switch (status) {
      case 'applied': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'reviewing': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'interview_scheduled': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'hired': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  const getHiringProgress = () => {
    if (stats.totalApplicants === 0) return 0;
    return Math.round((stats.hiredCount / stats.totalApplicants) * 100);
  };

  const sidebarSections = [
    {
      sectionLabel: "Recruiter",
      items: [
        { label: "Talent Pool", active: activeTab === 'discover', onClick: () => setActiveTab('discover'), icon: <Users className="w-[18px] h-[18px]" /> },
        { label: "My Jobs", active: activeTab === 'jobs', onClick: () => setActiveTab('jobs'), icon: <Briefcase className="w-[18px] h-[18px]" /> },
        { label: "Pipeline & Tracking", active: activeTab === 'pipeline', onClick: () => setActiveTab('pipeline'), icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
        { label: "Log out", onClick: () => signOut(), icon: <LogOut className="w-[18px] h-[18px]" /> },
      ],
    },
  ];
  const userName = profile?.full_name || user?.email || 'Recruiter';
  const userInitials = (profile?.full_name || user?.email || 'R').toString().split(/\s|@/).map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: userName, role: profile?.company_name || 'Recruiter', initials: userInitials }}
      >
        {loading && (
          <div className="dashboard-section-content space-y-6">
            <div className="dashboard-stat-cards">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}
        {!loading && (
          <>
            <div className="dashboard-section-header flex-wrap gap-4">
              <div>
                <h1>Talent Discovery</h1>
                <p>Discover and hire verified talent</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button className="dashboard-btn-ghost" size="sm" onClick={() => setShowProfileEdit(true)}><Edit className="h-4 w-4 mr-1" /> Edit profile</Button>
                <Button className="dashboard-btn-ghost" size="sm" onClick={() => setShowPasswordDialog(true)}>Reset password</Button>
                <Button className="dashboard-btn-gold" onClick={() => navigate('/post-job')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Post New Job
                </Button>
                <Button className="dashboard-btn-ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4 mr-1" /> Log out</Button>
              </div>
            </div>

            <div className="dashboard-stat-cards">
              {statsDisplay.map((stat, idx) => (
                <div key={idx} className="dashboard-stat-card">
                  <div className="dashboard-stat-card-label">{stat.label}</div>
                  <div className="dashboard-stat-card-value">{stat.value}</div>
                  <div className="dashboard-stat-card-icon">
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              ))}
            </div>

            <div className="dashboard-tab-bar">
              <button type="button" className={`dashboard-tab ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>
                Discover Verified Talent
              </button>
              <button type="button" className={`dashboard-tab ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => setActiveTab('jobs')}>
                My Active Jobs ({jobs.length})
              </button>
              <button type="button" className={`dashboard-tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>
                Pipeline & Tracking
              </button>
            </div>

            {activeTab === 'discover' && (
              <div className="dashboard-recruiter-layout">
                <div className="dashboard-filter-panel">
                  <div className="dashboard-filter-panel-title">Domain / Role</div>
                  {(['Software Engineering', 'Data Science', 'Product Management'] as const).map((d) => (
                    <label key={d}>
                      <input type="checkbox" checked={domainFilter[d] ?? false} onChange={() => setDomainFilter(prev => ({ ...prev, [d]: !prev[d] }))} />
                      <span>{d}</span>
                    </label>
                  ))}
                  <div className="dashboard-filter-panel-title" style={{ marginTop: 20 }}>Verification Tier</div>
                  <label><input type="checkbox" checked={tierFilter['A'] ?? false} onChange={() => setTierFilter(prev => ({ ...prev, 'A': !prev['A'] }))} /><span>Level A (Top 5%)</span></label>
                  <label><input type="checkbox" checked={tierFilter['B'] ?? false} onChange={() => setTierFilter(prev => ({ ...prev, 'B': !prev['B'] }))} /><span>Level B (Top 15%)</span></label>
                  <label><input type="checkbox" checked={tierFilter['C'] ?? false} onChange={() => setTierFilter(prev => ({ ...prev, 'C': !prev['C'] }))} /><span>Level C (Top 30%)</span></label>
                </div>
                <div className="dashboard-talent-content">
                  <div className="dashboard-talent-header">
                    <h2 className="dashboard-talent-title">Verified Talent Pool</h2>
                    <select className="dashboard-sort-select" value={talentSort} onChange={(e) => setTalentSort(e.target.value)}>
                      <option value="highest_score">Sort by: Highest Score</option>
                      <option value="newest">Sort by: Newest</option>
                    </select>
                  </div>
                  {filteredCandidates.length === 0 ? (
                    <div className="text-center py-16 text-[var(--dash-text-muted)]">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No verified candidates match your filters. Try adjusting filters or check back later.</p>
                      <Button className="dashboard-btn-gold mt-4" asChild><Link to="/candidate-search">Search all candidates</Link></Button>
                    </div>
                  ) : (
                    <div className="dashboard-candidates-grid">
                      {filteredCandidates.map((c) => (
                        <div key={c.id} className="dashboard-candidate-card">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="h-12 w-12 rounded-full shrink-0 border-2 border-[var(--dash-navy-border)]">
                                <AvatarFallback className="bg-[var(--dash-navy-light)] text-[var(--dash-gold)] text-sm font-semibold">
                                  {(c.full_name || c.user_id).toString().slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-white truncate block">{c.full_name || 'Verified Candidate'}</span>
                                  <CheckCircle2 className="h-4 w-4 text-[var(--dash-gold)] shrink-0" />
                                </div>
                                <p className="text-sm text-[var(--dash-text-muted)] truncate">
                                  {c.current_role || 'Engineer'} • {c.experience_years ?? 0} Years Exp.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 justify-end">
                              <span className="dashboard-badge-a text-sm font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" /> Level A Verified
                              </span>
                              <span className="dashboard-verified-pill inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> AI + Human Validated
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm font-medium mb-4">
                            <div className="bg-white/5 rounded px-2 py-1.5"><span className="text-[var(--dash-text-muted)]">HUMAN EXPERT</span> <strong className="text-white">—</strong>/100</div>
                            <div className="bg-white/5 rounded px-2 py-1.5"><span className="text-[var(--dash-text-muted)]">DSA ROUND</span> <strong className="text-white">—</strong>/100</div>
                            <div className="bg-white/5 rounded px-2 py-1.5"><span className="text-[var(--dash-text-muted)]">AI INTERVIEW</span> <strong className="text-white">—</strong>/100</div>
                            <div className="bg-white/5 rounded px-2 py-1.5"><span className="text-[var(--dash-text-muted)]">APTITUDE</span> <strong className="text-white">—</strong>th %ile</div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="dashboard-btn-ghost flex-1" asChild>
                              <Link to="/candidate-search"><FileText className="h-3.5 w-3 mr-1" /> View Skill Passport</Link>
                            </Button>
                            <Button size="sm" className="dashboard-btn-gold flex-1" onClick={() => navigate('/post-job')}>
                              <Briefcase className="h-3.5 w-3 mr-1" /> Invite to Job
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'jobs' && (
              <div className="dashboard-section-content">
                {jobs.length === 0 ? (
                  <div className="text-center py-16 text-[var(--dash-text-muted)]">
                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium text-white mb-2">No jobs posted yet</p>
                    <p className="text-sm mb-4">Create your first job posting to start receiving applications</p>
                    <Button className="dashboard-btn-gold" onClick={() => navigate('/post-job')}><Plus className="h-4 w-4 mr-2" /> Post Your First Job</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 border border-[var(--dash-navy-border)] rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                        onClick={() => handleViewJobDetails(job)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white truncate">{job.title}</h3>
                            <Badge className={job.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/10 text-gray-300 border-white/10'}>
                              {job.status || 'active'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-[var(--dash-text-muted)]">
                            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{job.company}</span>
                            {job.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button className="dashboard-btn-ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleToggleJobStatus(job.id, job.status || 'active'); }}>
                            {job.status === 'active' ? 'Close' : 'Activate'}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setJobToDelete(job.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[var(--dash-text-muted)] ml-2" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'pipeline' && (
              <div className="dashboard-section-content">
                {applications.length === 0 ? (
                  <div className="text-center py-16 text-[var(--dash-text-muted)]">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium text-white mb-2">No applications yet</p>
                    <p className="text-sm">Applications will appear here once candidates apply to your jobs</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {applications.slice(0, 20).map((app) => (
                      <div key={app.id} className="flex items-center justify-between p-4 border border-[var(--dash-navy-border)] rounded-xl hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="bg-[var(--dash-navy-light)] text-[var(--dash-gold)]">{app.job_seeker_id.slice(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <h3 className="font-medium text-white truncate">{app.jobs?.title || 'Unknown Position'}</h3>
                            <p className="text-sm text-[var(--dash-text-muted)]">{app.jobs?.company} • Applied {new Date(app.applied_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Select value={app.status} onValueChange={(v) => handleUpdateApplicationStatus(app.id, v)}>
                            <SelectTrigger className="w-[140px] bg-[var(--dash-navy-light)] border-[var(--dash-navy-border)] text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="applied">Applied</SelectItem>
                              <SelectItem value="reviewing">Reviewing</SelectItem>
                              <SelectItem value="interview_scheduled">Interview</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                              <SelectItem value="hired">Hired</SelectItem>
                            </SelectContent>
                          </Select>
                          {app.resume_url && <ResumeViewButton resumeUrl={app.resume_url} label="Resume" showIcon={false} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DashboardShell>

      {/* Job Details Dialog */}
      <Dialog open={showJobDetails} onOpenChange={setShowJobDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedJob?.title}
              <Badge className={getStatusColor(selectedJob?.status || 'active')}>
                {selectedJob?.status || 'active'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {selectedJob?.company}
              </span>
              {selectedJob?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedJob?.location}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {selectedJob?.job_type && (
                <Badge variant="outline">{selectedJob.job_type}</Badge>
              )}
              {selectedJob?.salary_range && (
                <Badge variant="secondary">{selectedJob.salary_range}</Badge>
              )}
              {selectedJob?.experience_required && (
                <Badge variant="outline">{selectedJob.experience_required}+ yrs exp</Badge>
              )}
            </div>

            {selectedJob?.description && (
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedJob.description}</p>
              </div>
            )}

            {selectedJob?.required_skills && selectedJob.required_skills.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedJob.required_skills.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            
            <Separator />
            
            <div>
              <h4 className="font-semibold mb-3">Applications ({jobApplications.length})</h4>
              {jobApplications.length === 0 ? (
                <p className="text-muted-foreground text-sm">No applications yet</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {jobApplications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Applicant ID: {app.job_seeker_id.slice(0, 8)}...</p>
                        <p className="text-sm text-muted-foreground">
                          Applied {new Date(app.applied_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getApplicationStatusColor(app.status)}>
                          {app.status.replace('_', ' ')}
                        </Badge>
                        {app.resume_url && (
                          <ResumeViewButton 
                            resumeUrl={app.resume_url}
                            label="Resume"
                            showIcon={false}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Edit Dialog */}
      <Dialog open={showProfileEdit} onOpenChange={setShowProfileEdit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Company Profile</DialogTitle>
            <DialogDescription>Update your company and contact information</DialogDescription>
          </DialogHeader>
          {isTestAccount && (
            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Test accounts can't save profile changes. Sign in with a full account to update your profile.
            </p>
          )}
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Your Name</Label>
              <Input
                id="full_name"
                value={editedProfile.full_name}
                onChange={(e) => setEditedProfile(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={editedProfile.company_name}
                onChange={(e) => setEditedProfile(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="TechCorp Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={editedProfile.phone}
                onChange={(e) => setEditedProfile(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowProfileEdit(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleUpdateProfile}>
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
          {isTestAccount && (
            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Test accounts don't have a password to change. Sign in with a full account to use this.
            </p>
          )}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!jobToDelete} onOpenChange={() => setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job Posting?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the job posting and all associated applications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteJob} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RecruiterDashboard;