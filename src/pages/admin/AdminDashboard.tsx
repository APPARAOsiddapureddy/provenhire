import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProctoringReview from "./ProctoringReview";
import ProctoringAnalytics from "@/components/admin/ProctoringAnalytics";
import RealtimeProctoringAlerts from "@/components/admin/RealtimeProctoringAlerts";
import IntegrityControls from "@/components/admin/IntegrityControls";
import TestAppealsManager from "@/components/admin/TestAppealsManager";
import AIInterviewReview from "@/components/admin/AIInterviewReview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, Users, Briefcase, Mail, LogOut, RefreshCw, Flag, BarChart3, Bell, Scale, Video, CheckCircle, FileText, UserPlus, X, MoreHorizontal, Trash2, MessageSquare, Download, Settings } from "lucide-react";
import BroadcastMessageDialog from "@/components/admin/BroadcastMessageDialog";
import { toast } from "sonner";

interface JobSeeker {
  id: string;
  user_id: string;
  college: string | null;
  experience_years: number | null;
  skills: string[] | null;
  verification_status: string | null;
  phone: string | null;
  created_at: string;
  profile?: { full_name?: string | null; email?: string | null };
  certification_level?: number;
  certification_label?: string;
}

interface Recruiter {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
  is_active: boolean;
  source: string | null;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  status: string | null;
  created_at: string;
}

interface InterviewerApplication {
  id: string;
  name: string;
  email: string;
  experienceYears: number | null;
  track: string;
  domains: string[] | null;
  phone: string | null;
  linkedIn: string | null;
  whyJoin: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user: authUser, userRole, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicationSearch, setApplicationSearch] = useState("");
  const [stats, setStats] = useState({
    totalJobSeekers: 0,
    totalRecruiters: 0,
    totalInterviewers: 0,
    totalSubscribers: 0,
    totalJobs: 0,
    totalApplications: 0,
    totalVerified: 0,
    certificationLevels: { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<number, number>,
  });
  const [applications, setApplications] = useState<any[]>([]);
  const [interviewerApplications, setInterviewerApplications] = useState<InterviewerApplication[]>([]);
  const [jobSeekerSearch, setJobSeekerSearch] = useState("");
  const [jobSeekerStatusFilter, setJobSeekerStatusFilter] = useState("all");
  const [recruiterSearch, setRecruiterSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [adminActions, setAdminActions] = useState<
    { id: string; action: string; time: string }[]
  >([]);
  
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [inviteLinkDialog, setInviteLinkDialog] = useState<{ email: string; link: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ userId: string; email: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<{ userId: string; label: string } | null>(null);

  useEffect(() => {
    if (authUser && userRole === "admin") {
      setCurrentUser(authUser);
      fetchAllData();
      return;
    }
    setLoading(false);
    navigate("/admin");
  }, [navigate, authUser, userRole]);

  const fetchAllData = async () => {
    const FETCH_TIMEOUT_MS = 20000;
    setLoading(true);
    try {
      const [jobsRes, jobSeekersRes, recruitersRes, statsRes, applicationsRes, interviewerAppsRes] = await Promise.allSettled([
        api.get<{ jobs: Job[] }>("/api/jobs"),
        api.get<{ jobSeekers: JobSeeker[] }>("/api/admin/job-seekers"),
        api.get<{ recruiters: Recruiter[] }>("/api/admin/recruiters"),
        api.get<{ totalJobSeekers: number; totalRecruiters: number; totalInterviewers: number; totalJobs: number; totalApplications: number; totalVerified: number; certificationLevels?: Record<number, number> }>("/api/admin/stats"),
        api.get<{ applications: any[] }>("/api/admin/applications"),
        api.get<{ applications: InterviewerApplication[] }>("/api/admin/interviewer-applications"),
      ]);

      const jobsData = jobsRes.status === "fulfilled" ? jobsRes.value?.jobs ?? [] : [];
      const seekersData = jobSeekersRes.status === "fulfilled" ? jobSeekersRes.value?.jobSeekers ?? [] : [];
      const recruitersData = recruitersRes.status === "fulfilled" ? recruitersRes.value?.recruiters ?? [] : [];
      const statsData = statsRes.status === "fulfilled" ? statsRes.value : null;
      const appsData = applicationsRes.status === "fulfilled" ? applicationsRes.value?.applications ?? [] : [];
      const interviewerAppsData = interviewerAppsRes.status === "fulfilled" ? interviewerAppsRes.value?.applications ?? [] : [];

      setJobs(jobsData);
      setJobSeekers(seekersData);
      setRecruiters(recruitersData);
      setApplications(appsData);
      setInterviewerApplications(interviewerAppsData);
      setStats({
        totalJobSeekers: statsData?.totalJobSeekers ?? seekersData.length,
        totalRecruiters: statsData?.totalRecruiters ?? recruitersData.length,
        totalInterviewers: statsData?.totalInterviewers ?? 0,
        totalSubscribers: 0,
        totalJobs: statsData?.totalJobs ?? jobsData.length,
        totalApplications: statsData?.totalApplications ?? appsData.length,
        totalVerified: statsData?.totalVerified ?? 0,
        certificationLevels: statsData?.certificationLevels ?? { 0: 0, 1: 0, 2: 0, 3: 0 },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch data";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredJobSeekers = jobSeekers.filter((seeker) => {
    const q = jobSeekerSearch.toLowerCase();
    const matchesSearch =
      !jobSeekerSearch ||
      seeker.user_id?.toLowerCase().includes(q) ||
      seeker.college?.toLowerCase().includes(q) ||
      seeker.profile?.full_name?.toLowerCase().includes(q) ||
      seeker.profile?.email?.toLowerCase().includes(q) ||
      (Array.isArray(seeker.skills) ? seeker.skills.join(" ").toLowerCase().includes(q) : false);
    const status = seeker.verification_status || "pending";
    const matchesStatus =
      jobSeekerStatusFilter === "all" ||
      (jobSeekerStatusFilter === "verified" && (status === "verified" || status === "expert_verified")) ||
      (jobSeekerStatusFilter === "expert_verified" && status === "expert_verified") ||
      (jobSeekerStatusFilter === "pending" && status !== "verified" && status !== "expert_verified");
    return matchesSearch && matchesStatus;
  });

  const filteredRecruiters = recruiters.filter((recruiter) => {
    if (!recruiterSearch) return true;
    const query = recruiterSearch.toLowerCase();
    return (
      recruiter.full_name?.toLowerCase().includes(query) ||
      recruiter.email?.toLowerCase().includes(query) ||
      recruiter.company_name?.toLowerCase().includes(query)
    );
  });

  const filteredJobs = jobs.filter((job) => {
    if (!jobSearch) return true;
    const query = jobSearch.toLowerCase();
    return (
      job.title.toLowerCase().includes(query) ||
      job.company.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query)
    );
  });

  const filteredApplications = applications.filter((a) => {
    if (!applicationSearch) return true;
    const q = applicationSearch.toLowerCase();
    return (
      a.jobTitle?.toLowerCase().includes(q) ||
      a.company?.toLowerCase().includes(q) ||
      a.seekerEmail?.toLowerCase().includes(q)
    );
  });

  const handleApproveInterviewer = async (appId: string) => {
    setApprovingId(appId);
    try {
      const res = await api.post<{ setPasswordLink: string; email: string; emailSent?: boolean }>(
        `/api/admin/interviewer-applications/${appId}/approve`
      );
      setInterviewerApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: "approved", reviewedAt: new Date().toISOString() } : a))
      );
      setInviteLinkDialog({ email: res.email, link: res.setPasswordLink });
      toast.success(
        res.emailSent
          ? `Interviewer approved. Email sent to ${res.email}.`
          : "Interviewer approved. Share the set-password link manually (email not configured)."
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      await api.del(`/api/admin/users/${deleteDialog.userId}`);
      setJobSeekers((prev) => prev.filter((s) => s.user_id !== deleteDialog.userId));
      setRecruiters((prev) => prev.filter((r) => r.user_id !== deleteDialog.userId));
      toast.success("User deleted. Email blocked from future signups.");
      setDeleteDialog(null);
      fetchAllData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const handleRejectInterviewer = async (appId: string) => {
    try {
      await api.post(`/api/admin/interviewer-applications/${appId}/reject`);
      setInterviewerApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: "rejected", reviewedAt: new Date().toISOString() } : a))
      );
      toast.success("Application rejected.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject");
    }
  };

  const handleBroadcastSent = () => {
    fetchAllData();
    setAdminActions((prev) => [
      { id: crypto.randomUUID(), action: "Broadcast message sent", time: new Date().toISOString() },
      ...prev,
    ]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" style={{ animationDuration: "0.6s" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header — responsive: stack on mobile, hide user details on small screens */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Shield className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate">Admin Dashboard</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">ProvenHire Management</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {currentUser && (
                <div className="hidden md:block text-right text-sm text-muted-foreground">
                  <div className="font-medium text-foreground truncate max-w-[180px]">{currentUser.email}</div>
                  <div className="text-xs">
                    Last login: {currentUser.last_sign_in_at ? formatDate(currentUser.last_sign_in_at) : "—"}
                  </div>
                </div>
              )}
              <BroadcastMessageDialog
                stats={{
                  totalJobSeekers: stats.totalJobSeekers,
                  totalRecruiters: stats.totalRecruiters,
                  totalInterviewers: stats.totalInterviewers,
                }}
                onSent={handleBroadcastSent}
                open={messageDialogOpen}
                onOpenChange={(o) => {
                  setMessageDialogOpen(o);
                  if (!o) setMessageRecipient(null);
                }}
                initialRecipient={messageRecipient ?? undefined}
                trigger={
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setMessageRecipient(null)}>
                    <MessageSquare className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Send Message</span>
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const url = "/api/admin/export-users";
                  const token = localStorage.getItem("ph_jwt") || "";
                  try {
                    const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                    if (!r.ok) throw new Error("Download failed");
                    const csv = await r.text();
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = u;
                    a.download = "provenhire-users-export.csv";
                    a.click();
                    URL.revokeObjectURL(u);
                    toast.success("Users export downloaded");
                  } catch {
                    toast.error("Download failed");
                  }
                }}
                className="shrink-0"
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Download Users</span>
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAllData} className="shrink-0">
                <RefreshCw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button variant="destructive" size="sm" onClick={handleLogout} className="shrink-0">
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats Cards — responsive grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg dark:bg-blue-900 shrink-0">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalJobSeekers}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Job Seekers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-emerald-100 rounded-lg dark:bg-emerald-900 shrink-0">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalVerified}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg dark:bg-green-900 shrink-0">
                  <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalRecruiters}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Recruiters</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg dark:bg-orange-900 shrink-0">
                  <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalJobs}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-violet-100 rounded-lg dark:bg-violet-900 shrink-0">
                  <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalApplications}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Applications</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg dark:bg-purple-900 shrink-0">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-bold truncate">{stats.totalSubscribers}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Certification Level Funnel</CardTitle>
            <CardDescription>Candidate distribution across certification tiers</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Level 0</div>
              <div className="text-2xl font-bold">{stats.certificationLevels[0] ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Level 1</div>
              <div className="text-2xl font-bold">{stats.certificationLevels[1] ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Level 2</div>
              <div className="text-2xl font-bold">{stats.certificationLevels[2] ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Level 3</div>
              <div className="text-2xl font-bold">{stats.certificationLevels[3] ?? 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 sm:mb-8">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Recent Admin Actions</CardTitle>
            <CardDescription>Quick activity log for this session</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {adminActions.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No actions yet. Activity like messages will show here.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {adminActions.slice(0, 5).map((action) => (
                  <div key={action.id} className="flex items-center justify-between">
                    <span>{action.action}</span>
                    <span className="text-muted-foreground">{formatDate(action.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Tables — scrollable tabs on mobile */}
        <Tabs defaultValue="jobseekers" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <TabsList className="inline-flex w-max min-w-full sm:min-w-0 sm:w-auto flex-nowrap gap-1 p-1 h-auto">
            <TabsTrigger value="jobseekers" className="shrink-0">Job Seekers</TabsTrigger>
            <TabsTrigger value="recruiters" className="shrink-0">Recruiters</TabsTrigger>
            <TabsTrigger value="jobs" className="shrink-0">Jobs</TabsTrigger>
            <TabsTrigger value="applications" className="shrink-0">Applications</TabsTrigger>
            <TabsTrigger value="interviews" className="flex items-center gap-1 shrink-0">
              <Video className="h-3 w-3" />
              Interviews
            </TabsTrigger>
            <TabsTrigger value="proctoring" className="flex items-center gap-1 shrink-0">
              <Flag className="h-3 w-3" />
              Proctoring
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-1 shrink-0">
              <Bell className="h-3 w-3" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="appeals" className="flex items-center gap-1 shrink-0">
              <Scale className="h-3 w-3" />
              Appeals
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 shrink-0">
              <BarChart3 className="h-3 w-3" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="subscribers" className="shrink-0">Subscribers</TabsTrigger>
            <TabsTrigger value="interviewer-apps" className="flex items-center gap-1 shrink-0">
              <UserPlus className="h-3 w-3" />
              Interviewer Apps
            </TabsTrigger>
            <TabsTrigger value="integrity" className="flex items-center gap-1 shrink-0">
              <Settings className="h-3 w-3" />
              Integrity Controls
            </TabsTrigger>
          </TabsList>
          </div>

          <Dialog open={!!inviteLinkDialog} onOpenChange={() => setInviteLinkDialog(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Set Password Link</DialogTitle>
                <DialogDescription>Share the link below so the user can set their password and log in.</DialogDescription>
              </DialogHeader>
              {inviteLinkDialog && (
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Share this link with <strong>{inviteLinkDialog.email}</strong> so they can set their password and log in.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={inviteLinkDialog.link} className="font-mono text-xs flex-1 min-w-0" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLinkDialog.link);
                        toast.success("Link copied to clipboard");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!deleteDialog} onOpenChange={() => !deleting && setDeleteDialog(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Delete User</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{deleteDialog?.name}</strong> ({deleteDialog?.email})? This cannot be undone. The email will be permanently blocked from future signups.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TabsContent value="jobseekers">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Job Seekers</CardTitle>
                <CardDescription>All registered job seekers on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by user ID, college, skill..."
                    value={jobSeekerSearch}
                    onChange={(e) => setJobSeekerSearch(e.target.value)}
                  />
                    <Select value={jobSeekerStatusFilter} onValueChange={setJobSeekerStatusFilter}>
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="expert_verified">Expert Verified</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                      <TableHead>Name / Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>College</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Certification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobSeekers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No job seekers match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredJobSeekers.map((seeker) => (
                        <TableRow key={seeker.id}>
                          <TableCell>
                            <div className="font-medium">{seeker.profile?.full_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{seeker.profile?.email || seeker.user_id?.slice(0, 12) + "…"}</div>
                          </TableCell>
                          <TableCell>{seeker.phone || "-"}</TableCell>
                          <TableCell>{seeker.college || "-"}</TableCell>
                          <TableCell>{seeker.experience_years ? `${seeker.experience_years} yrs` : "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {seeker.skills?.slice(0, 3).map((skill, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                              {(seeker.skills?.length || 0) > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(seeker.skills?.length || 0) - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline">L{seeker.certification_level ?? 0}</Badge>
                              <span className="text-xs text-muted-foreground">{seeker.certification_label ?? "Level 0 - Not Yet Certified"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={seeker.verification_status === "verified" ? "default" : "secondary"}
                            >
                              {seeker.verification_status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(seeker.created_at)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setMessageRecipient({
                                      userId: seeker.user_id,
                                      label: seeker.profile?.full_name || seeker.profile?.email || seeker.college || seeker.user_id.slice(0, 8),
                                    });
                                    setMessageDialogOpen(true);
                                  }}
                                >
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Send Message
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    setDeleteDialog({
                                      userId: seeker.user_id,
                                      email: seeker.profile?.email || seeker.user_id,
                                      name: seeker.profile?.full_name || "Job Seeker",
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recruiters">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Recruiters</CardTitle>
                <CardDescription>All registered recruiters on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by name, email, company..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecruiters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No recruiters match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecruiters.map((recruiter) => (
                        <TableRow key={recruiter.id}>
                          <TableCell className="font-medium">{recruiter.full_name || "-"}</TableCell>
                          <TableCell>{recruiter.email || "-"}</TableCell>
                          <TableCell>{recruiter.phone || "-"}</TableCell>
                          <TableCell>{recruiter.company_name || "-"}</TableCell>
                          <TableCell>{formatDate(recruiter.created_at)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setMessageRecipient({
                                      userId: recruiter.user_id,
                                      label: recruiter.full_name || recruiter.email || recruiter.company_name || recruiter.user_id.slice(0, 8),
                                    });
                                    setMessageDialogOpen(true);
                                  }}
                                >
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Send Message
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    setDeleteDialog({
                                      userId: recruiter.user_id,
                                      email: recruiter.email || recruiter.user_id,
                                      name: recruiter.full_name || "Recruiter",
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Jobs</CardTitle>
                <CardDescription>All job listings on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by title, company, location..."
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Posted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No jobs match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">{job.title}</TableCell>
                          <TableCell>{job.company}</TableCell>
                          <TableCell>{job.location || "Remote"}</TableCell>
                          <TableCell>
                            <Badge variant={job.status === "active" ? "default" : "secondary"}>
                              {job.status || "active"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(job.created_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Job Applications</CardTitle>
                <CardDescription>Recent applications across all jobs</CardDescription>
                <Input
                  placeholder="Search by job title, company, or applicant email..."
                  value={applicationSearch}
                  onChange={(e) => setApplicationSearch(e.target.value)}
                  className="mt-3 max-w-full sm:max-w-md"
                />
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Applicant</TableHead>
                      <TableHead>Job</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No applications match.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredApplications.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.seekerEmail || a.seekerId?.slice(0, 8) + "…"}</TableCell>
                          <TableCell>{a.jobTitle || "—"}</TableCell>
                          <TableCell>{a.company || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={a.status === "hired" ? "default" : "secondary"}>{a.status}</Badge>
                          </TableCell>
                          <TableCell>{formatDate(a.appliedAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interviews">
            <AIInterviewReview />
          </TabsContent>

          <TabsContent value="proctoring">
            <ProctoringReview />
          </TabsContent>

          <TabsContent value="alerts">
            <RealtimeProctoringAlerts />
          </TabsContent>

          <TabsContent value="appeals">
            <TestAppealsManager />
          </TabsContent>

          <TabsContent value="analytics">
            <ProctoringAnalytics />
          </TabsContent>

          <TabsContent value="subscribers">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Newsletter Subscribers</CardTitle>
                <CardDescription>
                  Users who subscribed to newsletter updates. Total: {stats.totalSubscribers}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Subscriber data is protected and viewable via backend only.</p>
                  <p className="text-sm mt-2">Total subscribers: {stats.totalSubscribers}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrity">
            <IntegrityControls />
          </TabsContent>

          <TabsContent value="interviewer-apps">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Interviewer Applications</CardTitle>
                <CardDescription>                Apply to become an Expert Interviewer. Approve to create account and send invite link.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Track</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Domains</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interviewerApplications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No interviewer applications yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interviewerApplications.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium">{app.name}</TableCell>
                          <TableCell>{app.email}</TableCell>
                          <TableCell>{app.phone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{app.track}</Badge>
                          </TableCell>
                          <TableCell>{app.experienceYears != null ? `${app.experienceYears} yrs` : "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {(app.domains || []).slice(0, 2).map((d) => (
                                <Badge key={d} variant="secondary" className="text-xs">
                                  {d}
                                </Badge>
                              ))}
                              {(app.domains?.length || 0) > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(app.domains?.length || 0) - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : "secondary"}
                            >
                              {app.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(app.createdAt)}</TableCell>
                          <TableCell>
                            {app.status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveInterviewer(app.id)}
                                  disabled={approvingId === app.id}
                                >
                                  {approvingId === app.id ? "..." : "Approve & Invite"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectInterviewer(app.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
