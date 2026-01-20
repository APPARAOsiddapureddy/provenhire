import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, MapPin, Briefcase, GraduationCap, CheckCircle2, Clock, Mail, Phone, User, Award, Trophy, Shield, Send, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ResumeViewButton from "@/components/ResumeViewButton";
import SkillPassport from "@/components/SkillPassport";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
  college: string | null;
  graduation_year: number | null;
  experience_years: number | null;
  skills: string[] | null;
  actively_looking_roles: string[] | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  resume_url: string | null;
  verification_status: string | null;
  profile_views: number | null;
  created_at: string | null;
}

const CandidateSearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<JobSeekerProfile[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<JobSeekerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("verified_first");
  const [allSkills, setAllSkills] = useState<string[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<JobSeekerProfile | null>(null);
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
  }, [candidates, searchQuery, skillFilter, experienceFilter, verificationFilter, sortBy]);

  const fetchCandidates = async () => {
    try {
      // Fetch all candidates
      const { data, error } = await supabase
        .from('job_seeker_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCandidates(data || []);

      // Extract all unique skills
      const skills = new Set<string>();
      data?.forEach(candidate => {
        candidate.skills?.forEach(skill => skills.add(skill));
      });
      setAllSkills(Array.from(skills).sort());
    } catch (error: any) {
      toast({
        title: "Error loading candidates",
        description: error.message,
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

  const incrementProfileView = async (candidateId: string) => {
    await supabase
      .from('job_seeker_profiles')
      .update({ profile_views: (candidates.find(c => c.id === candidateId)?.profile_views || 0) + 1 })
      .eq('id', candidateId);
  };

  const handleContactCandidate = async () => {
    if (!candidateToContact || !user) return;
    
    setContactingCandidate(candidateToContact.user_id);
    
    try {
      const { data, error } = await supabase.functions.invoke('contact-candidate', {
        body: {
          candidateUserId: candidateToContact.user_id,
          recruiterMessage: contactMessage || undefined,
        },
      });

      if (error) throw error;

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Find Verified Candidates</h1>
          <p className="text-muted-foreground">Browse and filter through our pool of verified job seekers</p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No candidates found</h3>
              <p className="text-muted-foreground">Try adjusting your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCandidates.map(candidate => (
              <Card key={candidate.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {candidate.actively_looking_roles?.[0] || "Job Seeker"}
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
                    {getVerificationBadge(candidate.verification_status)}
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

                    <div className="flex gap-2 mt-4">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            className="flex-1" 
                            variant="outline"
                            onClick={() => {
                              setSelectedCandidate(candidate);
                              incrementProfileView(candidate.id);
                            }}
                          >
                            View Profile
                          </Button>
                        </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center justify-between">
                            <span>{candidate.actively_looking_roles?.[0] || "Job Seeker"}</span>
                            {getVerificationBadge(candidate.verification_status)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Express Interest
            </DialogTitle>
            <DialogDescription>
              Send a notification to {candidateToContact?.actively_looking_roles?.[0] || 'this candidate'} letting them know you're interested in their profile.
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

      <Footer />
    </div>
  );
};

export default CandidateSearch;
