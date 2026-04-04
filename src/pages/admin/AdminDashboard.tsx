import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getAuthToken } from "@/lib/api";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  certificationLevel?: "L1" | "L2" | "L3" | null;
  certificationLabelShort?: string | null;
}

function adminSeekerCertBadgeClasses(level: number): string {
  if (level >= 3) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300";
  if (level === 2) return "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300";
  if (level === 1) return "bg-amber-500/15 text-amber-800 border-amber-500/35 dark:text-amber-200";
  return "bg-muted text-muted-foreground border-border";
}

interface Recruiter {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  linked_in_profile: string | null;
  company_name: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_industry: string | null;
  company_size: string | null;
  company_location: string | null;
  company_linkedin: string | null;
  company_description: string | null;
  verification_document_url: string | null;
  verification_status: string | null;
  email_domain_verified: boolean | null;
  verification_rejected_reason: string | null;
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
  posted_at?: string;
  posted_by_user_id?: string | null;
  posted_by_email?: string | null;
  posted_by_name?: string | null;
  posted_by_recruiter_profile_id?: string | null;
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
  /** user_id values for bulk delete */
  const [selectedSeekerUserIds, setSelectedSeekerUserIds] = useState<Set<string>>(new Set());
  const [selectedRecruiterUserIds, setSelectedRecruiterUserIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    userIds: string[];
    kind: "jobseekers" | "recruiters";
    preview: { email: string; name: string }[];
  } | null>(null);
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
        api.get<{ jobs: Job[] }>("/api/admin/jobs"),
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

  const formatDateDisplay = (value: string | Date | null | undefined) => {
    if (value == null || value === "") return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const downloadAdminCsv = async (path: string, filename: string, successMsg: string) => {
    const token = getAuthToken();
    try {
      const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error("Download failed");
      const csv = await r.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(u);
      toast.success(successMsg);
    } catch {
      toast.error("Download failed");
    }
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

  const [recruiterReview, setRecruiterReview] = useState<Recruiter | null>(null);
  const [verificationRejectReason, setVerificationRejectReason] = useState("");
  const [verificationUpdating, setVerificationUpdating] = useState(false);

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
      job.id.toLowerCase().includes(query) ||
      job.title.toLowerCase().includes(query) ||
      job.company.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query) ||
      job.posted_by_email?.toLowerCase().includes(query) ||
      job.posted_by_name?.toLowerCase().includes(query)
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

  const allFilteredSeekersSelected =
    filteredJobSeekers.length > 0 && filteredJobSeekers.every((s) => selectedSeekerUserIds.has(s.user_id));
  const allFilteredRecruitersSelected =
    filteredRecruiters.length > 0 && filteredRecruiters.every((r) => selectedRecruiterUserIds.has(r.user_id));

  const toggleSeekerSelection = (userId: string) => {
    setSelectedSeekerUserIds((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const toggleRecruiterSelection = (userId: string) => {
    setSelectedRecruiterUserIds((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const setAllSeekersInFilter = (checked: boolean) => {
    setSelectedSeekerUserIds((prev) => {
      const n = new Set(prev);
      if (checked) {
        filteredJobSeekers.forEach((s) => n.add(s.user_id));
      } else {
        filteredJobSeekers.forEach((s) => n.delete(s.user_id));
      }
      return n;
    });
  };

  const setAllRecruitersInFilter = (checked: boolean) => {
    setSelectedRecruiterUserIds((prev) => {
      const n = new Set(prev);
      if (checked) {
        filteredRecruiters.forEach((r) => n.add(r.user_id));
      } else {
        filteredRecruiters.forEach((r) => n.delete(r.user_id));
      }
      return n;
    });
  };

  const openBulkDeleteSeekers = () => {
    const ids = [...selectedSeekerUserIds];
    if (ids.length === 0) return;
    if (ids.length > 100) {
      toast.error("You can delete at most 100 users at once. Narrow your selection.");
      return;
    }
    const preview = ids.slice(0, 10).map((id) => {
      const s = jobSeekers.find((j) => j.user_id === id);
      return {
        email: s?.profile?.email || id.slice(0, 12) + "…",
        name: s?.profile?.full_name || "Job seeker",
      };
    });
    setBulkDeleteDialog({ userIds: ids, kind: "jobseekers", preview });
  };

  const openBulkDeleteRecruiters = () => {
    const ids = [...selectedRecruiterUserIds];
    if (ids.length === 0) return;
    if (ids.length > 100) {
      toast.error("You can delete at most 100 users at once. Narrow your selection.");
      return;
    }
    const preview = ids.slice(0, 10).map((id) => {
      const r = recruiters.find((x) => x.user_id === id);
      return {
        email: r?.email || id.slice(0, 12) + "…",
        name: r?.full_name || "Recruiter",
      };
    });
    setBulkDeleteDialog({ userIds: ids, kind: "recruiters", preview });
  };

  const handleBulkDeleteUsers = async () => {
    if (!bulkDeleteDialog || bulkDeleteDialog.userIds.length === 0) return;
    setDeleting(true);
    try {
      const res = await api.post<{
        ok?: boolean;
        deleted?: number;
        message?: string;
        skippedAdmin?: number;
        notFound?: number;
      }>("/api/admin/users/bulk-delete", { userIds: bulkDeleteDialog.userIds });
      const extra =
        (res.skippedAdmin ?? 0) > 0 || (res.notFound ?? 0) > 0
          ? ` (${[res.skippedAdmin ? `${res.skippedAdmin} admin(s) skipped` : "", res.notFound ? `${res.notFound} not found` : ""].filter(Boolean).join(", ")})`
          : "";
      toast.success((res.message ?? `Deleted ${res.deleted ?? 0} user(s).`) + extra);
      setBulkDeleteDialog(null);
      setSelectedSeekerUserIds(new Set());
      setSelectedRecruiterUserIds(new Set());
      setDeleteDialog(null);
      await fetchAllData();
    } catch (err: unknown) {
      const ax = err as Error & { message?: string };
      toast.error(ax?.message || "Bulk delete failed");
    } finally {
      setDeleting(false);
    }
  };

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
      const uid = deleteDialog.userId;
      setJobSeekers((prev) => prev.filter((s) => s.user_id !== uid));
      setRecruiters((prev) => prev.filter((r) => r.user_id !== uid));
      setSelectedSeekerUserIds((prev) => {
        const n = new Set(prev);
        n.delete(uid);
        return n;
      });
      setSelectedRecruiterUserIds((prev) => {
        const n = new Set(prev);
        n.delete(uid);
        return n;
      });
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
                    Last login: {currentUser.last_sign_in_at ? formatDateDisplay(currentUser.last_sign_in_at) : "—"}
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
                onClick={() =>
                  downloadAdminCsv("/api/admin/export-users", "provenhire-users-export.csv", "All users export downloaded")
                }
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
                    <span className="text-muted-foreground">{formatDateDisplay(action.time)}</span>
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

          <Dialog open={!!bulkDeleteDialog} onOpenChange={() => !deleting && setBulkDeleteDialog(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Delete {bulkDeleteDialog?.userIds.length ?? 0} users</DialogTitle>
                <DialogDescription>
                  This cannot be undone. All selected accounts will be removed and their emails blocked from future signups.
                  Admin accounts in the selection are skipped automatically.
                </DialogDescription>
              </DialogHeader>
              {bulkDeleteDialog && (
                <div className="space-y-2 text-sm border rounded-md p-3 bg-muted/40 max-h-48 overflow-y-auto">
                  {bulkDeleteDialog.preview.map((p, i) => (
                    <div key={i} className="truncate">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground"> — {p.email}</span>
                    </div>
                  ))}
                  {bulkDeleteDialog.userIds.length > bulkDeleteDialog.preview.length && (
                    <p className="text-muted-foreground pt-1">
                      …and {bulkDeleteDialog.userIds.length - bulkDeleteDialog.preview.length} more
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkDeleteDialog(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleBulkDeleteUsers} disabled={deleting}>
                  {deleting ? "Deleting…" : `Delete ${bulkDeleteDialog?.userIds.length ?? 0} users`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TabsContent value="jobseekers">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Job Seekers</CardTitle>
                    <CardDescription>All registered job seekers on the platform</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    onClick={() =>
                      downloadAdminCsv(
                        "/api/admin/export-job-seekers",
                        "provenhire-job-seekers.csv",
                        "Job seekers export downloaded",
                      )
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
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
                {selectedSeekerUserIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <span className="text-sm font-medium">
                      {selectedSeekerUserIds.size} job seeker{selectedSeekerUserIds.size === 1 ? "" : "s"} selected
                    </span>
                    <Button size="sm" variant="destructive" onClick={openBulkDeleteSeekers} disabled={deleting}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete selected
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedSeekerUserIds(new Set())}
                      disabled={deleting}
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allFilteredSeekersSelected}
                          onCheckedChange={(v) => setAllSeekersInFilter(v === true)}
                          aria-label="Select all visible job seekers"
                          disabled={filteredJobSeekers.length === 0}
                        />
                      </TableHead>
                      <TableHead className="font-mono text-xs whitespace-nowrap min-w-[100px]">Profile ID</TableHead>
                      <TableHead className="font-mono text-xs whitespace-nowrap min-w-[100px]">User ID</TableHead>
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
                        <TableCell colSpan={12} className="text-center text-muted-foreground">
                          No job seekers match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredJobSeekers.map((seeker) => (
                        <TableRow key={seeker.id}>
                          <TableCell className="w-10">
                            <Checkbox
                              checked={selectedSeekerUserIds.has(seeker.user_id)}
                              onCheckedChange={() => toggleSeekerSelection(seeker.user_id)}
                              aria-label={`Select ${seeker.profile?.full_name || seeker.profile?.email || "user"}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[140px] break-all align-top">{seeker.id}</TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[140px] break-all align-top">{seeker.user_id}</TableCell>
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
                            {(() => {
                              const lvl = seeker.certification_level ?? 0;
                              const short =
                                seeker.certificationLabelShort?.trim() ||
                                (lvl >= 3
                                  ? "Elite Verified"
                                  : lvl === 2
                                    ? "Skill Passport"
                                    : lvl === 1
                                      ? "Cognitive Verified"
                                      : "Not Certified");
                              return (
                                <Badge
                                  variant="outline"
                                  className={`text-xs font-medium border ${adminSeekerCertBadgeClasses(lvl)}`}
                                >
                                  {lvl <= 0 ? "L0" : seeker.certificationLevel ?? `L${lvl}`} · {short}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={seeker.verification_status === "verified" ? "default" : "secondary"}
                            >
                              {seeker.verification_status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateDisplay(seeker.created_at)}</TableCell>
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Recruiters</CardTitle>
                    <CardDescription>All registered recruiters on the platform</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    onClick={() =>
                      downloadAdminCsv(
                        "/api/admin/export-recruiters",
                        "provenhire-recruiters.csv",
                        "Recruiters export downloaded",
                      )
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by name, email, company..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                  />
                </div>
                {selectedRecruiterUserIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <span className="text-sm font-medium">
                      {selectedRecruiterUserIds.size} recruiter{selectedRecruiterUserIds.size === 1 ? "" : "s"} selected
                    </span>
                    <Button size="sm" variant="destructive" onClick={openBulkDeleteRecruiters} disabled={deleting}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete selected
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedRecruiterUserIds(new Set())}
                      disabled={deleting}
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allFilteredRecruitersSelected}
                            onCheckedChange={(v) => setAllRecruitersInFilter(v === true)}
                            aria-label="Select all visible recruiters"
                            disabled={filteredRecruiters.length === 0}
                          />
                        </TableHead>
                        <TableHead className="font-mono text-xs whitespace-nowrap min-w-[100px]">Profile ID</TableHead>
                        <TableHead className="font-mono text-xs whitespace-nowrap min-w-[100px]">User ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecruiters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No recruiters match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecruiters.map((recruiter) => (
                        <TableRow key={recruiter.id}>
                          <TableCell className="w-10">
                            <Checkbox
                              checked={selectedRecruiterUserIds.has(recruiter.user_id)}
                              onCheckedChange={() => toggleRecruiterSelection(recruiter.user_id)}
                              aria-label={`Select ${recruiter.full_name || recruiter.email || "recruiter"}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[140px] break-all align-top">{recruiter.id}</TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[140px] break-all align-top">{recruiter.user_id}</TableCell>
                          <TableCell className="font-medium">{recruiter.full_name || "-"}</TableCell>
                          <TableCell>{recruiter.email || "-"}</TableCell>
                          <TableCell>{recruiter.company_name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={recruiter.verification_status === "verified" ? "default" : recruiter.verification_status === "rejected" ? "destructive" : "secondary"}>
                              {recruiter.verification_status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateDisplay(recruiter.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => { setRecruiterReview(recruiter); setVerificationRejectReason(""); }}>
                                Review
                              </Button>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={!!recruiterReview} onOpenChange={(open) => !open && setRecruiterReview(null)}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Recruiter verification</DialogTitle>
                  <DialogDescription>Review details and documents, then approve or reject.</DialogDescription>
                </DialogHeader>
                {recruiterReview && (
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Name</Label>
                        <p className="font-medium">{recruiterReview.full_name || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        <p className="font-medium">{recruiterReview.email || "-"}</p>
                        {recruiterReview.email_domain_verified && (
                          <Badge variant="secondary" className="mt-1">Domain matches website</Badge>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        <p className="font-medium">{recruiterReview.phone || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Job title</Label>
                        <p className="font-medium">{recruiterReview.designation || "-"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-muted-foreground">LinkedIn profile</Label>
                        <p className="font-medium">
                          {recruiterReview.linked_in_profile ? (
                            <a href={recruiterReview.linked_in_profile} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {recruiterReview.linked_in_profile}
                            </a>
                          ) : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">Company</h4>
                      <div className="flex gap-4 flex-wrap">
                        {recruiterReview.company_logo && (
                          <img src={recruiterReview.company_logo.startsWith("http") ? recruiterReview.company_logo : `${window.location.origin}${recruiterReview.company_logo}`} alt="Logo" className="h-16 w-16 object-contain rounded border" />
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 min-w-0">
                          <div><Label className="text-muted-foreground">Company name</Label><p className="font-medium">{recruiterReview.company_name || "-"}</p></div>
                          <div><Label className="text-muted-foreground">Website</Label><p className="font-medium">{recruiterReview.company_website ? <a href={recruiterReview.company_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{recruiterReview.company_website}</a> : "-"}</p></div>
                          <div><Label className="text-muted-foreground">Industry</Label><p className="font-medium">{recruiterReview.company_industry || "-"}</p></div>
                          <div><Label className="text-muted-foreground">Size</Label><p className="font-medium">{recruiterReview.company_size || "-"}</p></div>
                          <div><Label className="text-muted-foreground">Location</Label><p className="font-medium">{recruiterReview.company_location || "-"}</p></div>
                          <div className="sm:col-span-2"><Label className="text-muted-foreground">Company LinkedIn</Label><p className="font-medium">{recruiterReview.company_linkedin ? <a href={recruiterReview.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{recruiterReview.company_linkedin}</a> : "-"}</p></div>
                          {recruiterReview.company_description && <div className="sm:col-span-2"><Label className="text-muted-foreground">Description</Label><p className="text-sm text-muted-foreground">{recruiterReview.company_description}</p></div>}
                        </div>
                      </div>
                    </div>
                    {recruiterReview.verification_document_url && (
                      <div className="border-t pt-4">
                        <Label className="text-muted-foreground">Verification document</Label>
                        <a href={recruiterReview.verification_document_url.startsWith("http") ? recruiterReview.verification_document_url : `${window.location.origin}${recruiterReview.verification_document_url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline block mt-1">
                          View document (PDF/Image)
                        </a>
                      </div>
                    )}
                    {recruiterReview.verification_status === "rejected" && recruiterReview.verification_rejected_reason && (
                      <p className="text-sm text-muted-foreground">Rejection reason: {recruiterReview.verification_rejected_reason}</p>
                    )}
                    <div className="border-t pt-4 flex flex-wrap gap-2 items-end">
                      {recruiterReview.verification_status !== "verified" && (
                        <Button
                          disabled={verificationUpdating}
                          onClick={async () => {
                            setVerificationUpdating(true);
                            try {
                              await api.patch(`/api/admin/recruiters/${recruiterReview.id}/verification`, { status: "verified" });
                              setRecruiters((prev) => prev.map((r) => (r.id === recruiterReview.id ? { ...r, verification_status: "verified" } : r)));
                              setRecruiterReview(null);
                              toast.success("Recruiter approved.");
                            } catch (e) {
                              toast.error("Failed to approve.");
                            } finally {
                              setVerificationUpdating(false);
                            }
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      )}
                      {recruiterReview.verification_status !== "rejected" && (
                        <>
                          <Input placeholder="Rejection reason (optional)" value={verificationRejectReason} onChange={(e) => setVerificationRejectReason(e.target.value)} className="max-w-xs" />
                          <Button
                            variant="destructive"
                            disabled={verificationUpdating}
                            onClick={async () => {
                              setVerificationUpdating(true);
                              try {
                                await api.patch(`/api/admin/recruiters/${recruiterReview.id}/verification`, { status: "rejected", reason: verificationRejectReason || undefined });
                                setRecruiters((prev) => prev.map((r) => (r.id === recruiterReview.id ? { ...r, verification_status: "rejected", verification_rejected_reason: verificationRejectReason || null } : r)));
                                setRecruiterReview(null);
                                setVerificationRejectReason("");
                                toast.success("Recruiter rejected.");
                              } catch (e) {
                                toast.error("Failed to reject.");
                              } finally {
                                setVerificationUpdating(false);
                              }
                            }}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Jobs</CardTitle>
                    <CardDescription>
                      All listings including drafts. Posted date uses the record&apos;s created time (when the job was first saved).
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    onClick={() =>
                      downloadAdminCsv("/api/admin/export-jobs", "provenhire-jobs.csv", "Jobs export downloaded")
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
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
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono text-xs whitespace-nowrap min-w-[100px]">Job ID</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Posted by</TableHead>
                        <TableHead>Posted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No jobs match your search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredJobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-mono text-[10px] max-w-[140px] break-all align-top">{job.id}</TableCell>
                            <TableCell className="font-medium">{job.title}</TableCell>
                            <TableCell>{job.company}</TableCell>
                            <TableCell>{job.location || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  job.status === "published" || job.status === "active"
                                    ? "default"
                                    : job.status === "draft" || job.status === "closed"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {job.status || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{job.posted_by_name || "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono break-all">
                                {job.posted_by_email || job.posted_by_user_id?.slice(0, 12) || "—"}
                              </div>
                            </TableCell>
                            <TableCell>{formatDateDisplay(job.posted_at || job.created_at)}</TableCell>
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Job Applications</CardTitle>
                    <CardDescription>Recent applications across all jobs</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    onClick={() =>
                      downloadAdminCsv(
                        "/api/admin/export-applications",
                        "provenhire-applications.csv",
                        "Applications export downloaded",
                      )
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
                <Input
                  placeholder="Search by job title, company, or applicant email..."
                  value={applicationSearch}
                  onChange={(e) => setApplicationSearch(e.target.value)}
                  className="mt-3 max-w-full sm:max-w-md"
                />
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono text-xs whitespace-nowrap">Application ID</TableHead>
                        <TableHead className="font-mono text-xs whitespace-nowrap">Job ID</TableHead>
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
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No applications match.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredApplications.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-[10px] max-w-[120px] break-all align-top">{a.id}</TableCell>
                            <TableCell className="font-mono text-[10px] max-w-[120px] break-all align-top">{a.jobId}</TableCell>
                            <TableCell className="font-medium">{a.seekerEmail || a.seekerId?.slice(0, 8) + "…"}</TableCell>
                            <TableCell>{a.jobTitle || "—"}</TableCell>
                            <TableCell>{a.company || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={a.status === "hired" ? "default" : "secondary"}>{a.status}</Badge>
                            </TableCell>
                            <TableCell>{formatDateDisplay(a.appliedAt as string)}</TableCell>
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Newsletter Subscribers</CardTitle>
                    <CardDescription>
                      Users who subscribed to newsletter updates. Total: {stats.totalSubscribers}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    disabled
                    title="Connect a subscribers export endpoint when this list is backed by the API."
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Interviewer Applications</CardTitle>
                    <CardDescription>
                      Apply to become an Expert Interviewer. Approve to create account and send invite link.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 w-fit"
                    onClick={() =>
                      downloadAdminCsv(
                        "/api/admin/export-interviewer-applications",
                        "provenhire-interviewer-applications.csv",
                        "Interviewer applications export downloaded",
                      )
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    Download CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono text-xs whitespace-nowrap">Application ID</TableHead>
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
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No interviewer applications yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interviewerApplications.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="font-mono text-[10px] max-w-[120px] break-all align-top">{app.id}</TableCell>
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
                          <TableCell>{formatDateDisplay(app.createdAt)}</TableCell>
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
