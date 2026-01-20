import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle, Clock, LogOut, Settings, TrendingUp, Award, Eye, FileText, BookmarkCheck, Trash2, ExternalLink, User, Lock, ShieldAlert } from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";
import { Link, useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
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
import { useVerificationGate } from "@/hooks/useVerificationGate";

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
  
  const { 
    isVerified, 
    verificationProgress: gateProgress, 
    currentStage,
    requiresVerification 
  } = useVerificationGate();

  const profileChecklist = [
    {
      label: "Personal details",
      done: Boolean(profile?.full_name && profile?.phone && profile?.location),
    },
    {
      label: "Education",
      done: Boolean(profile?.college && profile?.graduation_year),
    },
    {
      label: "Skills",
      done: Boolean(profile?.skills && profile.skills.length > 0),
    },
    {
      label: "Resume uploaded",
      done: Boolean(profile?.resume_url),
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
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const [profileData, applicationsData, savedJobsData, stagesData, aptitudeData, dsaData] = await Promise.all([
        supabase.from('job_seeker_profiles').select('*').eq('user_id', user?.id).maybeSingle(),
        supabase.from('job_applications').select('*, jobs(title, company, location)').eq('job_seeker_id', user?.id).order('applied_at', { ascending: false }),
        supabase.from('saved_jobs').select('*, jobs(id, title, company, location, salary_range, job_type)').eq('user_id', user?.id).order('saved_at', { ascending: false }),
        supabase.from('verification_stages').select('*').eq('user_id', user?.id).order('created_at', { ascending: true }),
        supabase.from('aptitude_test_results').select('*').eq('user_id', user?.id).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('dsa_round_results').select('*').eq('user_id', user?.id).order('completed_at', { ascending: false }).limit(1).maybeSingle()
      ]);

      if (profileData.data) {
        setProfile(profileData.data);
        setEditingProfile({
          bio: profileData.data.bio || '',
          location: profileData.data.location || '',
          phone: profileData.data.phone || '',
          skills: profileData.data.skills || [],
        });
      }
      if (applicationsData.data) setApplications(applicationsData.data);
      if (savedJobsData.data) setSavedJobs(savedJobsData.data);
      if (stagesData.data) setVerificationStages(stagesData.data);
      
      // Set test results
      setTestResults({
        aptitude: aptitudeData.data,
        dsa: dsaData.data
      });

      // Calculate certification level based on scores
      if (profileData.data?.verification_status === 'verified') {
        const aptitudeScore = aptitudeData.data?.total_score || 0;
        const dsaScore = dsaData.data?.total_score || 0;
        const avgScore = (aptitudeScore + dsaScore) / 2;
        
        // Get interview score from stages
        const interviewStage = stagesData.data?.find(s => s.stage_name === 'expert_interview');
        const interviewScore = interviewStage?.score || 0;
        
        const overallAvg = (aptitudeScore + dsaScore + interviewScore) / 3;
        
        if (overallAvg >= 12) {
          setCertificationLevel("A");
        } else if (overallAvg >= 9) {
          setCertificationLevel("B");
        } else {
          setCertificationLevel("C");
        }
      }

      setStats({
        applicationsSent: applicationsData.data?.length || 0,
        interviews: applicationsData.data?.filter(a => a.status === 'interview_scheduled').length || 0,
        profileViews: profileData.data?.profile_views || 0,
      });

      if (stagesData.data && stagesData.data.length > 0) {
        const completed = stagesData.data.filter(s => s.status === 'completed').length;
        setVerificationProgress((completed / 4) * 100);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSavedJob = async (savedJobId: string, jobId: string) => {
    try {
      const { error } = await supabase
        .from('saved_jobs')
        .delete()
        .eq('id', savedJobId);

      if (error) throw error;

      setSavedJobs(prev => prev.filter(j => j.id !== savedJobId));
      toast.success('Job removed from saved');
    } catch (error: any) {
      console.error('Error removing saved job:', error);
      toast.error('Failed to remove saved job');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await supabase
        .from('job_seeker_profiles')
        .update({
          bio: editingProfile.bio,
          location: editingProfile.location,
          phone: editingProfile.phone,
          skills: editingProfile.skills,
        })
        .eq('user_id', user?.id);

      if (error) throw error;

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
      'applied': 'bg-blue-100 text-blue-800',
      'reviewing': 'bg-yellow-100 text-yellow-800',
      'interview_scheduled': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'hired': 'bg-emerald-100 text-emerald-800',
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              ProvenHire Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">
              Welcome, {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setShowProfileDialog(true)} title="Edit Profile">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
              Reset Password
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Profile Quick View */}
        {profile && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{user?.email}</CardTitle>
                    <CardDescription>
                      {profile.location || 'Location not set'} • {profile.experience_years || 0} years experience
                    </CardDescription>
                    {profile.skills && profile.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {profile.skills.slice(0, 5).map((skill: string) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {profile.skills.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{profile.skills.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {profile.resume_url && (
                    <ResumeViewButton 
                      resumeUrl={profile.resume_url}
                      label="View Resume"
                    />
                  )}
                  <Button size="sm" onClick={() => setShowProfileDialog(true)}>
                    Edit Profile
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Skill Passport */}
        {profile && (
          <SkillPassport
            certificationLevel={certificationLevel}
            skills={profile.skills || []}
            verificationStatus={profile.verification_status}
            aptitudeScore={testResults.aptitude ? Math.round((testResults.aptitude.total_score / 15) * 100) : undefined}
            dsaScore={testResults.dsa ? Math.round((testResults.dsa.total_score / 15) * 100) : undefined}
            interviewScore={verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score ? Math.round((verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score / 15) * 100) : undefined}
          />
        )}

        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Profile Completeness</CardTitle>
                <CardDescription>Finish these items to improve visibility</CardDescription>
              </div>
              <Badge variant="secondary" className="text-base px-4 py-2">
                {profileCompletion}% Complete
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={profileCompletion} className="h-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {profileChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Verification Status */}
        <Card className="mb-8 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Progress</CardTitle>
                <CardDescription>Complete all stages to unlock full access</CardDescription>
              </div>
              <Badge variant="secondary" className="text-base px-4 py-2">
                {Math.round(verificationProgress)}% Complete
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={verificationProgress} className="h-3" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {verificationStages.length > 0 ? (
                verificationStages.map((stage) => (
                  <div key={stage.id} className={`flex items-center gap-3 p-3 bg-background/60 rounded-lg ${stage.status === 'locked' ? 'opacity-50' : ''}`}>
                    {getStageIcon(stage.status)}
                    <div>
                      <p className="font-medium text-sm capitalize">{stage.stage_name.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground capitalize">{stage.status.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 bg-background/60 rounded-lg">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="font-medium text-sm">Profile Setup</p>
                      <p className="text-xs text-muted-foreground">Start verification</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-background/60 rounded-lg opacity-50">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Aptitude Test</p>
                      <p className="text-xs text-muted-foreground">Locked</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-background/60 rounded-lg opacity-50">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">DSA Round</p>
                      <p className="text-xs text-muted-foreground">Locked</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-background/60 rounded-lg opacity-50">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Expert Interview</p>
                      <p className="text-xs text-muted-foreground">Locked</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <Button className="w-full bg-gradient-hero hover:opacity-90" onClick={() => navigate('/verification')}>
              {verificationProgress === 100 ? 'View Verification Status' : 'Continue Verification Process'}
            </Button>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {statsDisplay.map((stat, index) => (
            <Card key={index} className="hover-scale">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions - Show different content based on verification */}
        {isVerified ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Link to="/jobs" className="hover-scale">
              <Card className="cursor-pointer h-full hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Browse Jobs
                  </CardTitle>
                  <CardDescription>Find your next opportunity from our verified job listings</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Card className="hover-scale cursor-pointer h-full hover:border-accent/50 transition-colors" onClick={() => toast.info('AI Match feature coming soon!')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-accent" />
                  AI Match Score
                </CardTitle>
                <CardDescription>See your best matches based on your profile and skills</CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <>
            {/* Unverified User - Show restricted content */}
            <Card className="mb-8 border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-yellow-500/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <ShieldAlert className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Limited Access</CardTitle>
                    <CardDescription>
                      Complete verification to unlock all features
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div 
                    className="p-3 bg-background/60 rounded-lg text-center cursor-pointer hover:bg-background/80 transition-colors"
                    onClick={() => handleRestrictedAction()}
                  >
                    <Briefcase className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">Browse Jobs</p>
                    <Lock className="h-3 w-3 mx-auto mt-1 text-orange-500" />
                  </div>
                  <div 
                    className="p-3 bg-background/60 rounded-lg text-center cursor-pointer hover:bg-background/80 transition-colors"
                    onClick={() => handleRestrictedAction()}
                  >
                    <Award className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">AI Match</p>
                    <Lock className="h-3 w-3 mx-auto mt-1 text-orange-500" />
                  </div>
                  <div 
                    className="p-3 bg-background/60 rounded-lg text-center cursor-pointer hover:bg-background/80 transition-colors"
                    onClick={() => handleRestrictedAction()}
                  >
                    <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">Applications</p>
                    <Lock className="h-3 w-3 mx-auto mt-1 text-orange-500" />
                  </div>
                  <div 
                    className="p-3 bg-background/60 rounded-lg text-center cursor-pointer hover:bg-background/80 transition-colors"
                    onClick={() => handleRestrictedAction()}
                  >
                    <BookmarkCheck className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">Saved Jobs</p>
                    <Lock className="h-3 w-3 mx-auto mt-1 text-orange-500" />
                  </div>
                </div>
                <Button 
                  className="w-full bg-gradient-hero hover:opacity-90" 
                  onClick={() => navigate('/verification')}
                >
                  Complete Verification to Unlock
                </Button>
              </CardContent>
            </Card>
            
            {/* Refer a Friend - Show for unverified users */}
            <div className="mb-8">
              <ReferAFriend />
            </div>
          </>
        )}

        {/* Applications and Saved Jobs - Only show if verified */}
        {isVerified && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Applied Jobs */}
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
                  <Button asChild>
                    <Link to="/jobs">Browse Jobs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{app.jobs?.title || 'Unknown Position'}</h3>
                        <p className="text-sm text-muted-foreground">{app.jobs?.company || 'Unknown Company'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Applied {new Date(app.applied_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={getStatusBadge(app.status)}>
                        {app.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saved Jobs */}
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
                  <p className="text-muted-foreground mb-4">No saved jobs yet. Browse and save your favorites!</p>
                  <Button asChild>
                    <Link to="/jobs">Browse Jobs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {savedJobs.map((saved) => (
                    <div
                      key={saved.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{saved.jobs?.title || 'Unknown Position'}</h3>
                        <p className="text-sm text-muted-foreground">{saved.jobs?.company || 'Unknown Company'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {saved.jobs?.location && (
                            <span className="text-xs text-muted-foreground">{saved.jobs.location}</span>
                          )}
                          {saved.jobs?.salary_range && (
                            <Badge variant="secondary" className="text-xs">{saved.jobs.salary_range}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/jobs">
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveSavedJob(saved.id, saved.job_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </main>

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
                  placeholder="e.g. San Francisco, CA"
                  value={editingProfile.location}
                  onChange={(e) => setEditingProfile(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="+1 234 567 8900"
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
