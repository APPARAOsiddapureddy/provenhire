import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, Users, TrendingUp, Settings, LogOut, Plus, Eye, Edit, Trash2, MapPin, Clock, Building2, Mail, Phone, Globe, UserCheck, BarChart3, Calendar, Search, Bell, ChevronRight } from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const RecruiterDashboard = () => {
  const { user, signOut, changePassword } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalApplicants: 0,
    interviewsScheduled: 0,
    hiredCount: 0,
    profileViews: 0,
  });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
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
  const [editedProfile, setEditedProfile] = useState({
    full_name: '',
    phone: '',
    company_name: '',
  });

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const [jobsResult, profileResult] = await Promise.all([
        supabase
          .from('jobs')
          .select('*')
          .eq('recruiter_id', user?.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user?.id)
          .maybeSingle()
      ]);

      if (jobsResult.error) throw jobsResult.error;

      // Check if onboarding is completed - redirect if not
      if (profileResult.data && !profileResult.data.onboarding_completed) {
        navigate('/dashboard/recruiter/onboarding');
        return;
      }

      setJobs(jobsResult.data || []);
      setProfile(profileResult.data as RecruiterProfile);
      if (profileResult.data) {
        setEditedProfile({
          full_name: profileResult.data.full_name || '',
          phone: profileResult.data.phone || '',
          company_name: profileResult.data.company_name || '',
        });
      }

      // Get all applications for recruiter's jobs
      if (jobsResult.data && jobsResult.data.length > 0) {
        const { data: applicationsData } = await supabase
          .from('job_applications')
          .select('*, jobs(title, company)')
          .in('job_id', jobsResult.data.map(j => j.id))
          .order('applied_at', { ascending: false });

        setApplications(applicationsData || []);

        setStats({
          activeJobs: jobsResult.data.filter(j => j.status === 'active').length,
          totalApplicants: applicationsData?.length || 0,
          interviewsScheduled: applicationsData?.filter(a => a.status === 'interview_scheduled').length || 0,
          hiredCount: applicationsData?.filter(a => a.status === 'hired').length || 0,
          profileViews: Math.floor(Math.random() * 500) + 100, // Placeholder
        });
      } else {
        setStats({
          activeJobs: 0,
          totalApplicants: 0,
          interviewsScheduled: 0,
          hiredCount: 0,
          profileViews: 0,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewJobDetails = async (job: Job) => {
    setSelectedJob(job);
    setShowJobDetails(true);
    
    const { data } = await supabase
      .from('job_applications')
      .select('*')
      .eq('job_id', job.id)
      .order('applied_at', { ascending: false });
    
    setJobApplications(data || []);
  };

  const handleToggleJobStatus = async (jobId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId);

      if (error) throw error;

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
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobToDelete);

      if (error) throw error;

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
      const { error } = await supabase
        .from('job_applications')
        .update({ status: newStatus })
        .eq('id', applicationId);

      if (error) throw error;

      const application = applications.find(a => a.id === applicationId);
      
      if (application && application.jobs) {
        try {
          await supabase.functions.invoke('send-status-notification', {
            body: {
              applicationId,
              newStatus,
              jobTitle: application.jobs.title,
              companyName: application.jobs.company,
              candidateEmail: user?.email || '',
              candidateName: 'Candidate',
            }
          });
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
        }
      }

      setApplications(prev => prev.map(a => a.id === applicationId ? { ...a, status: newStatus } : a));
      setJobApplications(prev => prev.map(a => a.id === applicationId ? { ...a, status: newStatus } : a));
      toast.success('Application status updated & notification sent');
    } catch (error: any) {
      console.error('Error updating application:', error);
      toast.error('Failed to update application status');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editedProfile.full_name,
          phone: editedProfile.phone,
          company_name: editedProfile.company_name,
        })
        .eq('user_id', user?.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...editedProfile } : null);
      setShowProfileEdit(false);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const statsDisplay = [
    { label: "Active Jobs", value: stats.activeJobs.toString(), icon: Briefcase, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Total Applicants", value: stats.totalApplicants.toString(), icon: Users, color: "text-accent", bgColor: "bg-accent/10" },
    { label: "Interviews", value: stats.interviewsScheduled.toString(), icon: Calendar, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { label: "Hired", value: stats.hiredCount.toString(), icon: UserCheck, color: "text-green-500", bgColor: "bg-green-500/10" },
  ];

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="bg-background/95 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center shadow-glow">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-hero bg-clip-text text-transparent">
                ProvenHire Recruiter
              </h1>
              <p className="text-xs text-muted-foreground">{profile?.company_name || 'Your Company'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-white flex items-center justify-center">
                {applications.filter(a => a.status === 'applied').length}
              </span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowProfileEdit(true)} title="Edit Profile">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
              Reset Password
            </Button>
            <Separator orientation="vertical" className="h-8" />
            <div className="hidden md:flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {profile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'R'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:block">
                <p className="text-sm font-medium">{profile?.full_name || 'Recruiter'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'Recruiter'}! 👋
          </h2>
          <p className="text-muted-foreground">
            Here's what's happening with your job postings today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statsDisplay.map((stat, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - Quick Actions & Progress */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  className="w-full justify-start h-12 bg-gradient-hero hover:opacity-90"
                  onClick={() => navigate('/post-job')}
                >
                  <Plus className="h-5 w-5 mr-3" />
                  Post New Job
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start h-12"
                  onClick={() => navigate('/candidate-search')}
                >
                  <Search className="h-5 w-5 mr-3" />
                  Search Candidates
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start h-12"
                  asChild
                >
                  <Link to="/jobs">
                    <Eye className="h-5 w-5 mr-3" />
                    View All Jobs
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Hiring Progress */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Hiring Progress</CardTitle>
                <CardDescription>Your hiring funnel overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Conversion Rate</span>
                    <span className="font-medium">{getHiringProgress()}%</span>
                  </div>
                  <Progress value={getHiringProgress()} className="h-2" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Applied</span>
                    <span className="font-medium">{applications.filter(a => a.status === 'applied').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewing</span>
                    <span className="font-medium">{applications.filter(a => a.status === 'reviewing').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interview</span>
                    <span className="font-medium">{stats.interviewsScheduled}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hired</span>
                    <span className="font-medium text-green-600">{stats.hiredCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Recruitment Analytics</CardTitle>
                <CardDescription>Snapshot of your hiring funnel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Jobs</span>
                  <span className="font-medium">{stats.activeJobs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profile Views</span>
                  <span className="font-medium">{stats.profileViews}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Applicants</span>
                  <span className="font-medium">{stats.totalApplicants}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interviews Scheduled</span>
                  <span className="font-medium">{stats.interviewsScheduled}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hired</span>
                  <span className="font-medium text-green-600">{stats.hiredCount}</span>
                </div>
              </CardContent>
            </Card>

            {/* Company Profile Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Company Profile</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowProfileEdit(true)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{profile?.company_name || 'Add company name'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{profile?.phone || 'Add phone number'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Jobs & Applications */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="jobs" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="jobs" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Jobs ({jobs.length})
                </TabsTrigger>
                <TabsTrigger value="applications" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Applications ({applications.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="jobs">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Your Job Postings</CardTitle>
                        <CardDescription>Manage and track your open positions</CardDescription>
                      </div>
                      <Button onClick={() => navigate('/post-job')} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        New Job
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {jobs.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                          <Briefcase className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold mb-2">No jobs posted yet</h3>
                        <p className="text-muted-foreground text-sm mb-4">Create your first job posting to start receiving applications</p>
                        <Button onClick={() => navigate('/post-job')}>
                          <Plus className="h-4 w-4 mr-2" />
                          Post Your First Job
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {jobs.map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group"
                            onClick={() => handleViewJobDetails(job)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">{job.title}</h3>
                                <Badge className={getStatusColor(job.status || 'active')}>
                                  {job.status || 'active'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {job.company}
                                </span>
                                {job.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {job.location}
                                  </span>
                                )}
                                {job.job_type && (
                                  <Badge variant="outline" className="text-xs">{job.job_type}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleJobStatus(job.id, job.status || 'active');
                                }}
                              >
                                {job.status === 'active' ? 'Close' : 'Activate'}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobToDelete(job.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="applications">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Applications</CardTitle>
                    <CardDescription>Review and manage candidate applications</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {applications.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                          <Users className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold mb-2">No applications yet</h3>
                        <p className="text-muted-foreground text-sm">Applications will appear here once candidates apply to your jobs</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {applications.slice(0, 10).map((app) => (
                          <div
                            key={app.id}
                            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {app.job_seeker_id.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <h3 className="font-medium truncate">{app.jobs?.title || 'Unknown Position'}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {app.jobs?.company} • Applied {new Date(app.applied_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Select
                                value={app.status}
                                onValueChange={(value) => handleUpdateApplicationStatus(app.id, value)}
                              >
                                <SelectTrigger className="w-[140px]">
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
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

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
                        <p className="text-xs text-muted-foreground">
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