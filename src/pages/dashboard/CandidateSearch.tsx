import { type ReactNode, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, MapPin, Briefcase, GraduationCap, CheckCircle2, Clock, Mail, Phone, User, Award, Trophy, Shield, Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ResumeViewButton from "@/components/ResumeViewButton";
import SkillPassport from "@/components/SkillPassport";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DashboardShell from "@/components/DashboardShell";
import { buildRecruiterSidebarSections } from "@/utils/recruiterSidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface JobSeekerProfile {
  id: string;
  user_id: string;
  full_name?: string | null;
  college: string | null;
  graduation_year: number | string | null;
  experience_years: number | null;
  skills: string[] | null;
  actively_looking_roles: string[] | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  resume_url: string | null;
  verification_status: string | null;
  profile_views?: number | null;
  created_at: string | null;
  certification_level?: number;
  certification_label?: string;
  certificationLevel?: "L1" | "L2" | "L3" | null;
  certificationLabelShort?: string | null;
  aptitude_score?: number | null;
  dsa_score?: number | null;
  ai_interview_score?: number | null;
  human_expert_interview_score?: number | null;
  integrity_score?: number | null;
  assignment_score?: number | null;
  notice_period?: string | null;
  current_salary?: string | null;
  expected_salary?: string | null;
}

function CandidateSearchSkeletonGrid({ recruiterView }: { recruiterView: boolean }) {
  return (
    <div className={recruiterView ? "candidate-search-grid" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <Card key={item} className={recruiterView ? "candidate-search-card" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-3 h-6 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-7 w-32 rounded-full" />
                <Skeleton className="ml-auto h-7 w-20 rounded-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-3 h-4 w-full" />
            <Skeleton className="mb-5 h-4 w-5/6" />
            <div className="mb-4 flex flex-wrap gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <div className={recruiterView ? "candidate-search-actions mt-4" : "flex gap-2 mt-4"}>
              <Skeleton className="h-11 flex-1 rounded-md" />
              <Skeleton className="h-11 flex-1 rounded-md" />
              <Skeleton className="h-11 w-12 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const CandidateSearch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<JobSeekerProfile[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<JobSeekerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [certificationFilter, setCertificationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("verified_first");
  const [allSkills, setAllSkills] = useState<string[]>([]);
  const [contactingCandidate, setContactingCandidate] = useState<string | null>(null);
  const [contactedCandidates, setContactedCandidates] = useState<Set<string>>(new Set());
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [candidateToContact, setCandidateToContact] = useState<JobSeekerProfile | null>(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

  useEffect(() => {
    filterCandidates();
  }, [candidates, searchQuery, skillFilter, experienceFilter, verificationFilter, certificationFilter, sortBy]);

  const fetchCandidates = async () => {
    try {
      const { profiles } = await api.get<{ profiles: JobSeekerProfile[] }>(
        "/api/users/candidates"
      );
      const list = profiles || [];
      setCandidates(list);

      // Extract all unique skills
      const skills = new Set<string>();
      list.forEach(candidate => {
        candidate.skills?.forEach(skill => skills.add(skill));
      });
      setAllSkills(Array.from(skills).sort());
    } catch (error: any) {
      const msg = error?.message || "";
      const isAuthError = msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid token") || msg.toLowerCase().includes("credentials");
      toast({
        title: "Error loading candidates",
        description: isAuthError ? "Please log in again and try again." : (msg || "Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCandidates = () => {
    let filtered = [...candidates];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.bio?.toLowerCase().includes(query) ||
        c.location?.toLowerCase().includes(query) ||
        c.college?.toLowerCase().includes(query) ||
        c.skills?.some(s => s.toLowerCase().includes(query)) ||
        c.actively_looking_roles?.some(r => r.toLowerCase().includes(query))
      );
    }

    // Skill filter
    if (skillFilter) {
      filtered = filtered.filter(c => 
        c.skills?.some(s => s.toLowerCase().includes(skillFilter.toLowerCase()))
      );
    }

    // Experience filter
    if (experienceFilter !== "all") {
      filtered = filtered.filter(c => {
        const exp = c.experience_years || 0;
        switch (experienceFilter) {
          case "0-2": return exp <= 2;
          case "3-5": return exp >= 3 && exp <= 5;
          case "5-10": return exp >= 5 && exp <= 10;
          case "10+": return exp > 10;
          default: return true;
        }
      });
    }

    // Verification filter
    if (verificationFilter !== "all") {
      filtered = filtered.filter(c => c.verification_status === verificationFilter);
    }

    // Certification level filter
    if (certificationFilter === "level_2_plus") {
      filtered = filtered.filter((c) => (c.certification_level ?? 0) >= 2);
    } else if (certificationFilter === "level_1_plus") {
      filtered = filtered.filter((c) => (c.certification_level ?? 0) >= 1);
    }

    // Sort candidates
    if (sortBy === "verified_first") {
      filtered.sort((a, b) => {
        const order = { verified: 0, in_progress: 1, pending: 2 };
        const aOrder = order[a.verification_status as keyof typeof order] ?? 2;
        const bOrder = order[b.verification_status as keyof typeof order] ?? 2;
        return aOrder - bOrder;
      });
    } else if (sortBy === "experience_desc") {
      filtered.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0));
    } else if (sortBy === "experience_asc") {
      filtered.sort((a, b) => (a.experience_years || 0) - (b.experience_years || 0));
    } else if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } else if (sortBy === "dsa_desc") {
      filtered.sort((a, b) => (b.dsa_score ?? -1) - (a.dsa_score ?? -1));
    } else if (sortBy === "integrity_desc") {
      filtered.sort((a, b) => (b.integrity_score ?? -1) - (a.integrity_score ?? -1));
    }

    setFilteredCandidates(filtered);
  };

  const getVerificationBadge = (status: string | null) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" /> In Progress</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  const getCertificationBadge = (candidate: JobSeekerProfile) => {
    const lvl = candidate.certification_level ?? 0;
    const simplifiedLabel =
      lvl >= 3
        ? "Elite Verified"
        : lvl === 2
          ? "AI Interview Cleared"
          : lvl === 1
            ? "DSA Completed"
            : "Not Certified";
    const label =
      lvl === 1 || lvl === 2
        ? simplifiedLabel
        : candidate.certificationLabelShort?.trim() ||
          candidate.certification_label ||
          simplifiedLabel;
    const tone =
      lvl >= 3
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300"
        : lvl === 2
          ? "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-300"
          : lvl === 1
            ? "bg-amber-500/15 text-amber-900 border-amber-500/30 dark:text-amber-200"
            : "bg-muted text-muted-foreground border-border";
    const code = candidate.certificationLevel ?? (lvl >= 1 && lvl <= 3 ? (`L${lvl}` as const) : lvl <= 0 ? "L0" : null);
    return (
      <Badge className={tone}>
        {code ? `${code} · ` : ""}
        {label}
      </Badge>
    );
  };

  const incrementProfileView = async (candidateId: string) => {
    const current = candidates.find(c => c.id === candidateId);
    if (!current) return;
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, profile_views: (c.profile_views || 0) + 1 } : c));
  };

  const handleContactCandidate = async () => {
    if (!candidateToContact || !user) return;
    
    setContactingCandidate(candidateToContact.user_id);
    
    try {
      await api.post("/api/notifications/contact-candidate", {
        candidateUserId: candidateToContact.user_id,
        recruiterMessage: contactMessage || undefined,
      });

      toast({
        title: "Interest Sent!",
        description: "The candidate has been notified of your interest.",
      });

      setContactedCandidates(prev => new Set([...prev, candidateToContact.user_id]));
      setShowContactDialog(false);
      setContactMessage("");
      setCandidateToContact(null);
    } catch (error: any) {
      console.error("Error contacting candidate:", error);
      toast({
        title: "Failed to contact candidate",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setContactingCandidate(null);
    }
  };

  const openContactDialog = (candidate: JobSeekerProfile) => {
    setCandidateToContact(candidate);
    setContactMessage("");
    setShowContactDialog(true);
  };

  const isRecruiterView = user?.role === "recruiter";
  const sidebarSections = useMemo(() => buildRecruiterSidebarSections({ activeItem: "search" }), []);
  const shellName = user?.name || user?.email || "Recruiter";
  const shellUser = {
    name: shellName,
    role: "Recruiter",
    initials: shellName.toString().split(/\s|@/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  };
  const CandidateSearchFrame = ({ children }: { children: ReactNode }) =>
    isRecruiterView ? (
      <DashboardShell sidebarSections={sidebarSections} user={shellUser}>
        {children}
      </DashboardShell>
    ) : (
      <div className="min-h-screen bg-background">{children}</div>
    );

  return (
    <CandidateSearchFrame>
      {!isRecruiterView && <Navbar />}
      <div className={isRecruiterView ? "candidate-search-page" : "container mx-auto px-4 pt-16 sm:pt-20 pb-8"}>
        <div className={isRecruiterView ? "candidate-search-header" : "mb-8"}>
          <h1 className="text-3xl font-bold text-foreground mb-2">Elite Verified Candidates</h1>
          <p className="text-muted-foreground">
            Browse Level 2 verified job seekers - current verification complete, ready for hire
          </p>
        </div>

        {/* Filters */}
        <Card className={isRecruiterView ? "candidate-search-filter-card" : "mb-8"}>
          <CardContent className="pt-6">
            <div className={isRecruiterView ? "candidate-search-filters" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, skills, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Input
                placeholder="Filter by skill..."
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
              />

              <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Experience</SelectItem>
                  <SelectItem value="0-2">0-2 years</SelectItem>
                  <SelectItem value="3-5">3-5 years</SelectItem>
                  <SelectItem value="5-10">5-10 years</SelectItem>
                  <SelectItem value="10+">10+ years</SelectItem>
                </SelectContent>
              </Select>

              <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Verification Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="verified">
                    <span className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-green-500" />
                      Verified Only
                    </span>
                  </SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              <Select value={certificationFilter} onValueChange={setCertificationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Certification Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="level_1_plus">Level 1+</SelectItem>
                  <SelectItem value="level_2_plus">Level 2</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified_first">
                    <span className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-primary" />
                      Verified First
                    </span>
                  </SelectItem>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="experience_desc">Most Experience</SelectItem>
                  <SelectItem value="experience_asc">Least Experience</SelectItem>
                  <SelectItem value="dsa_desc">Highest DSA Score</SelectItem>
                  <SelectItem value="integrity_desc">Highest Integrity Score</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredCandidates.length} of {candidates.length} candidates
        </p>

        {/* Candidates Grid */}
        {loading ? (
          <CandidateSearchSkeletonGrid recruiterView={isRecruiterView} />
        ) : filteredCandidates.length === 0 ? (
          <Card className={isRecruiterView ? "candidate-search-empty" : ""}>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No candidates found</h3>
              <p className="text-muted-foreground">Try adjusting your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className={isRecruiterView ? "candidate-search-grid" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
            {filteredCandidates.map(candidate => (
              <Card key={candidate.id} className={isRecruiterView ? "candidate-search-card" : "hover:shadow-lg transition-shadow"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">
                        {candidate.full_name || candidate.actively_looking_roles?.[0] || "Job Seeker"}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        {candidate.location && (
                          <>
                            <MapPin className="h-3 w-3" />
                            {candidate.location}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className={isRecruiterView ? "candidate-search-card-badges" : "flex flex-col items-end gap-1"}>
                      {getCertificationBadge(candidate)}
                      {getVerificationBadge(candidate.verification_status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {candidate.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {candidate.bio}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {candidate.experience_years && (
                        <Badge variant="outline" className="text-xs">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {candidate.experience_years} yrs exp
                        </Badge>
                      )}
                      {candidate.college && (
                        <Badge variant="outline" className="text-xs">
                          <GraduationCap className="h-3 w-3 mr-1" />
                          {candidate.graduation_year}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {candidate.aptitude_score != null && <Badge variant="outline">Cognitive: {candidate.aptitude_score}%</Badge>}
                      {candidate.dsa_score != null && <Badge variant="outline">DSA: {candidate.dsa_score}%</Badge>}
                      {candidate.ai_interview_score != null && <Badge variant="outline">AI Interview: {candidate.ai_interview_score}%</Badge>}
                      {candidate.human_expert_interview_score != null && <Badge variant="outline">Expert: {candidate.human_expert_interview_score}%</Badge>}
                      {candidate.integrity_score != null && <Badge variant="outline">Integrity: {candidate.integrity_score}%</Badge>}
                    </div>

                    <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                      {candidate.notice_period && <span>Notice: {candidate.notice_period}</span>}
                      {candidate.current_salary && <span>Current CTC: {candidate.current_salary}</span>}
                      {candidate.expected_salary && <span>Expected CTC: {candidate.expected_salary}</span>}
                    </div>

                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {candidate.skills.slice(0, 4).map((skill, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {candidate.skills.length > 4 && (
                          <Badge variant="secondary" className="text-xs">
                            +{candidate.skills.length - 4} more
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className={isRecruiterView ? "candidate-search-actions mt-4" : "flex gap-2 mt-4"}>
                      <Button 
                        className="flex-1" 
                        variant="outline"
                        onClick={() => {
                          incrementProfileView(candidate.id);
                          navigate(`/candidate-search/${candidate.id}`);
                        }}
                      >
                        View Profile
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Quick Preview
                          </Button>
                        </DialogTrigger>
                        <DialogContent className={isRecruiterView ? "candidate-search-dialog max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-2xl max-h-[90vh] overflow-y-auto"}>
                        <DialogHeader>
                          <DialogTitle className="flex items-center justify-between">
                            <span>{candidate.full_name || candidate.actively_looking_roles?.[0] || "Job Seeker"}</span>
                            <div className="flex items-center gap-2">
                              {getCertificationBadge(candidate)}
                              {getVerificationBadge(candidate.verification_status)}
                            </div>
                          </DialogTitle>
                          <DialogDescription>
                            {candidate.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" /> {candidate.location}
                              </span>
                            )}
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-6 mt-4">
                          {candidate.bio && (
                            <div>
                              <h4 className="font-semibold mb-2">About</h4>
                              <p className="text-muted-foreground">{candidate.bio}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <Briefcase className="h-4 w-4" /> Experience
                              </h4>
                              <p className="text-muted-foreground">{candidate.experience_years || 0} years</p>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <GraduationCap className="h-4 w-4" /> Education
                              </h4>
                              <p className="text-muted-foreground">
                                {candidate.college || "Not specified"}
                                {candidate.graduation_year && ` (${candidate.graduation_year})`}
                              </p>
        </div>
      </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <h4 className="font-semibold mb-1">Notice period</h4>
                              <p className="text-muted-foreground">{candidate.notice_period || "Not specified"}</p>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-1">Current salary</h4>
                              <p className="text-muted-foreground">{candidate.current_salary || "Not specified"}</p>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-1">Expected salary</h4>
                              <p className="text-muted-foreground">{candidate.expected_salary || "Not specified"}</p>
                            </div>
                          </div>

                          {candidate.skills && candidate.skills.length > 0 && (
                            <div>
                              <h4 className="font-semibold mb-2">Skills</h4>
                              <div className="flex flex-wrap gap-2">
                                {candidate.skills.map((skill, i) => (
                                  <Badge key={i} variant="secondary">{skill}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {candidate.actively_looking_roles && candidate.actively_looking_roles.length > 0 && (
                            <div>
                              <h4 className="font-semibold mb-2">Looking For Roles</h4>
                              <div className="flex flex-wrap gap-2">
                                {candidate.actively_looking_roles.map((role, i) => (
                                  <Badge key={i} variant="outline">{role}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-4 pt-4 border-t">
                            {candidate.verification_status === 'verified' && (
                              <Button
                                onClick={() => openContactDialog(candidate)}
                                disabled={contactedCandidates.has(candidate.user_id) || contactingCandidate === candidate.user_id}
                                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                              >
                                {contactingCandidate === candidate.user_id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : contactedCandidates.has(candidate.user_id) ? (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                {contactedCandidates.has(candidate.user_id) ? 'Interest Sent' : 'Express Interest'}
                              </Button>
                            )}
                            {candidate.phone && (
                              <Button variant="outline" size="sm">
                                <Phone className="h-4 w-4 mr-2" />
                                {candidate.phone}
                              </Button>
                            )}
                            {candidate.resume_url && (
                              <ResumeViewButton 
                                resumeUrl={candidate.resume_url}
                                label="View Resume"
                              />
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Contact button on card */}
                    {candidate.verification_status === 'verified' && (
                      <Button
                        size="sm"
                        onClick={() => openContactDialog(candidate)}
                        disabled={contactedCandidates.has(candidate.user_id) || contactingCandidate === candidate.user_id}
                        className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                      >
                        {contactingCandidate === candidate.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : contactedCandidates.has(candidate.user_id) ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Contact Candidate Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className={isRecruiterView ? "candidate-search-dialog" : ""}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Express Interest
            </DialogTitle>
            <DialogDescription>
              Send a notification to {candidateToContact?.full_name || candidateToContact?.actively_looking_roles?.[0] || 'this candidate'} letting them know you're interested in their profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Add a personal message (optional)</label>
              <Textarea
                placeholder="e.g., We have an exciting opportunity that matches your skills..."
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>📧 The candidate will receive an email with:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Your company name and contact email</li>
                <li>Your personal message (if provided)</li>
                <li>Next steps for connecting</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowContactDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleContactCandidate}
                disabled={contactingCandidate !== null}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                {contactingCandidate ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Interest
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!isRecruiterView && <Footer />}
    </CandidateSearchFrame>
  );
};

export default CandidateSearch;
