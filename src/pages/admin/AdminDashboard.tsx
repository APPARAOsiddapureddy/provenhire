import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProctoringReview from "./ProctoringReview";
import ProctoringAnalytics from "@/components/admin/ProctoringAnalytics";
import RealtimeProctoringAlerts from "@/components/admin/RealtimeProctoringAlerts";
import TestAppealsManager from "@/components/admin/TestAppealsManager";
import AIInterviewReview from "@/components/admin/AIInterviewReview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Users, Briefcase, Mail, LogOut, RefreshCw, Send, MessageSquare, Flag, BarChart3, Bell, Scale, Video } from "lucide-react";
import { toast } from "sonner";

interface JobSeeker {
  id: string;
  user_id: string;
  college: string | null;
  experience_years: number | null;
  skills: string[] | null;
  verification_status: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface Recruiter {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user: authUser, userRole, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState({
    totalJobSeekers: 0,
    totalRecruiters: 0,
    totalSubscribers: 0,
    totalJobs: 0,
  });
  const [jobSeekerSearch, setJobSeekerSearch] = useState("");
  const [jobSeekerStatusFilter, setJobSeekerStatusFilter] = useState("all");
  const [recruiterSearch, setRecruiterSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [adminActions, setAdminActions] = useState<
    { id: string; action: string; time: string }[]
  >([]);
  
  // Messaging state
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [recipientType, setRecipientType] = useState<"jobseeker" | "recruiter" | "all">("jobseeker");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (authUser && userRole === "admin") {
        setCurrentUser(authUser);
        fetchAllData();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        navigate("/admin");
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .single();

      if (roleError || !roleData) {
        setLoading(false);
        toast.error("Access denied. Admin privileges required.");
        await supabase.auth.signOut();
        navigate("/admin");
        return;
      }

      setCurrentUser(session.user);
      fetchAllData();
    };

    checkAdminAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (authUser && userRole === "admin") return;
      if (event === 'SIGNED_OUT' || !session) {
        navigate("/admin");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, authUser, userRole]);

  const fetchAllData = async () => {
    const FETCH_TIMEOUT_MS = 20000;
    setLoading(true);
    try {
      const fetchPromise = (async () => {
        const { data: seekerData } = await supabase
          .from("job_seeker_profiles")
          .select("*")
          .order("created_at", { ascending: false });

        const { data: recruiterRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "recruiter");

        const recruiterUserIds = recruiterRoles?.map((r) => r.user_id) || [];

        const { data: recruiterProfiles } = await supabase
          .from("profiles")
          .select("*")
          .in("user_id", recruiterUserIds);

        const { data: jobsData } = await supabase
          .from("jobs")
          .select("*")
          .order("created_at", { ascending: false });

        const { count: subscriberCount } = await supabase
          .from("newsletter_subscribers")
          .select("*", { count: "exact", head: true });

        return { seekerData, recruiterProfiles, jobsData, subscriberCount };
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Dashboard request timed out. Check your connection and try again.')), FETCH_TIMEOUT_MS)
      );

      const { seekerData, recruiterProfiles, jobsData, subscriberCount } = await Promise.race([fetchPromise, timeoutPromise]);

      setJobSeekers(seekerData || []);
      setRecruiters(
        (recruiterProfiles || []).map((p) => ({
          id: p.id,
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          company_name: p.company_name,
          created_at: p.created_at || new Date().toISOString(),
        }))
      );
      setJobs(jobsData || []);
      
      setStats({
        totalJobSeekers: seekerData?.length || 0,
        totalRecruiters: recruiterProfiles?.length || 0,
        totalSubscribers: subscriberCount || 0,
        totalJobs: jobsData?.length || 0,
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
    const matchesSearch =
      !jobSeekerSearch ||
      seeker.user_id?.toLowerCase().includes(jobSeekerSearch.toLowerCase()) ||
      seeker.college?.toLowerCase().includes(jobSeekerSearch.toLowerCase()) ||
      seeker.skills?.join(" ").toLowerCase().includes(jobSeekerSearch.toLowerCase());
    const matchesStatus =
      jobSeekerStatusFilter === "all" ||
      (seeker.verification_status || "pending") === jobSeekerStatusFilter;
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

  const sendMessage = async () => {
    if (!messageSubject.trim() || !messageContent.trim()) {
      toast.error("Please fill in subject and message");
      return;
    }

    setSendingMessage(true);
    try {
      let recipients: string[] = [];

      if (recipientType === "all") {
        // Get all user IDs
        const jobSeekerIds = jobSeekers.map(js => js.user_id);
        const recruiterIds = recruiters.map(r => r.user_id);
        recipients = [...jobSeekerIds, ...recruiterIds];
      } else if (recipientType === "jobseeker" && selectedRecipient) {
        recipients = [selectedRecipient];
      } else if (recipientType === "recruiter" && selectedRecipient) {
        recipients = [selectedRecipient];
      } else if (recipientType === "jobseeker") {
        recipients = jobSeekers.map(js => js.user_id);
      } else if (recipientType === "recruiter") {
        recipients = recruiters.map(r => r.user_id);
      }

      if (recipients.length === 0) {
        toast.error("No recipients found");
        setSendingMessage(false);
        return;
      }

      // Use edge function to send messages (bypasses RLS)
      const { data, error } = await supabase.functions.invoke('send-admin-message', {
        body: {
          recipientIds: recipients,
          subject: messageSubject,
          message: messageContent,
        },
      });

      if (error) throw error;

      toast.success(`Message sent to ${recipients.length} user(s)`);
      setAdminActions((prev) => [
        {
          id: crypto.randomUUID(),
          action: `Sent message to ${recipientType === "all" ? "all users" : recipientType}`,
          time: new Date().toISOString(),
        },
        ...prev,
      ]);
      setMessageDialogOpen(false);
      setMessageSubject("");
      setMessageContent("");
      setSelectedRecipient("");
    } catch (error: any) {
      toast.error("Failed to send message: " + error.message);
    } finally {
      setSendingMessage(false);
    }
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
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">ProvenHire Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {currentUser && (
              <div className="text-right text-sm text-muted-foreground">
                <div className="font-medium text-foreground">{currentUser.email}</div>
                <div>
                  Last login: {currentUser.last_sign_in_at ? formatDate(currentUser.last_sign_in_at) : "—"}
                </div>
              </div>
            )}
            <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send Message
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Send In-App Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Recipient Type</Label>
                    <Select 
                      value={recipientType} 
                      onValueChange={(v) => {
                        setRecipientType(v as any);
                        setSelectedRecipient("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jobseeker">Job Seekers</SelectItem>
                        <SelectItem value="recruiter">Recruiters</SelectItem>
                        <SelectItem value="all">All Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {recipientType !== "all" && (
                    <div className="space-y-2">
                      <Label>Select Specific User (Optional)</Label>
                      <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                        <SelectTrigger>
                          <SelectValue placeholder="All users of selected type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All {recipientType === "jobseeker" ? "Job Seekers" : "Recruiters"}</SelectItem>
                          {recipientType === "jobseeker" 
                            ? jobSeekers.map(js => (
                                <SelectItem key={js.user_id} value={js.user_id}>
                                  {js.college || js.user_id.slice(0, 8)}
                                </SelectItem>
                              ))
                            : recruiters.map(r => (
                                <SelectItem key={r.user_id} value={r.user_id}>
                                  {r.full_name || r.email || r.user_id.slice(0, 8)}
                                </SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input 
                      value={messageSubject} 
                      onChange={(e) => setMessageSubject(e.target.value)}
                      placeholder="Message subject..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea 
                      value={messageContent} 
                      onChange={(e) => setMessageContent(e.target.value)}
                      placeholder="Type your message here..."
                      rows={5}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMessageDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={sendMessage} disabled={sendingMessage}>
                    <Send className="h-4 w-4 mr-2" />
                    {sendingMessage ? "Sending..." : "Send Message"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={fetchAllData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg dark:bg-blue-900">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalJobSeekers}</p>
                  <p className="text-sm text-muted-foreground">Job Seekers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg dark:bg-green-900">
                  <Briefcase className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalRecruiters}</p>
                  <p className="text-sm text-muted-foreground">Recruiters</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg dark:bg-purple-900">
                  <Mail className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalSubscribers}</p>
                  <p className="text-sm text-muted-foreground">Subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg dark:bg-orange-900">
                  <Briefcase className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalJobs}</p>
                  <p className="text-sm text-muted-foreground">Total Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recent Admin Actions</CardTitle>
            <CardDescription>Quick activity log for this session</CardDescription>
          </CardHeader>
          <CardContent>
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

        {/* Data Tables */}
        <Tabs defaultValue="jobseekers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-9 max-w-5xl">
            <TabsTrigger value="jobseekers">Job Seekers</TabsTrigger>
            <TabsTrigger value="recruiters">Recruiters</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="interviews" className="flex items-center gap-1">
              <Video className="h-3 w-3" />
              Interviews
            </TabsTrigger>
            <TabsTrigger value="proctoring" className="flex items-center gap-1">
              <Flag className="h-3 w-3" />
              Proctoring
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="appeals" className="flex items-center gap-1">
              <Scale className="h-3 w-3" />
              Appeals
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
          </TabsList>

          <TabsContent value="jobseekers">
            <Card>
              <CardHeader>
                <CardTitle>Job Seekers</CardTitle>
                <CardDescription>All registered job seekers on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by user ID, college, skill..."
                    value={jobSeekerSearch}
                    onChange={(e) => setJobSeekerSearch(e.target.value)}
                  />
                  <Select value={jobSeekerStatusFilter} onValueChange={setJobSeekerStatusFilter}>
                    <SelectTrigger className="md:w-48">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>College</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobSeekers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No job seekers match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredJobSeekers.map((seeker) => (
                        <TableRow key={seeker.id}>
                          <TableCell className="font-mono text-xs">
                            {seeker.user_id?.slice(0, 8)}...
                          </TableCell>
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
                            <Badge
                              variant={seeker.verification_status === "verified" ? "default" : "secondary"}
                            >
                              {seeker.verification_status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(seeker.created_at)}</TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setRecipientType("jobseeker");
                                setSelectedRecipient(seeker.user_id);
                                setMessageDialogOpen(true);
                              }}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recruiters">
            <Card>
              <CardHeader>
                <CardTitle>Recruiters</CardTitle>
                <CardDescription>All registered recruiters on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by name, email, company..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecruiters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No recruiters match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecruiters.map((recruiter) => (
                        <TableRow key={recruiter.id}>
                          <TableCell className="font-medium">{recruiter.full_name || "-"}</TableCell>
                          <TableCell>{recruiter.email || "-"}</TableCell>
                          <TableCell>{recruiter.company_name || "-"}</TableCell>
                          <TableCell>{formatDate(recruiter.created_at)}</TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setRecipientType("recruiter");
                                setSelectedRecipient(recruiter.user_id);
                                setMessageDialogOpen(true);
                              }}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader>
                <CardTitle>Jobs</CardTitle>
                <CardDescription>All job listings on the platform</CardDescription>
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <Input
                    placeholder="Search by title, company, location..."
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
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
              <CardHeader>
                <CardTitle>Newsletter Subscribers</CardTitle>
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
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
