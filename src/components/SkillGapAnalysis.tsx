import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  TrendingUp, 
  Target, 
  Lightbulb, 
  CheckCircle2,
  Sparkles,
  BookOpen,
  ExternalLink,
  ChevronDown,
  Loader2,
  GraduationCap,
  Video,
  FileText,
  BookMarked
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface LearningResource {
  title: string;
  type: "course" | "documentation" | "tutorial" | "book" | "video";
  provider: string;
  url: string;
  duration: string;
  level: "beginner" | "intermediate" | "advanced";
  isFree: boolean;
}

interface SkillResources {
  skill: string;
  resources: LearningResource[];
}

interface Job {
  id: string;
  title: string;
  company: string;
  required_skills: string[] | null;
  salary_range: string | null;
}

interface SkillGapAnalysisProps {
  jobs: Job[];
  userSkills: string[];
}

interface SkillAnalysis {
  skill: string;
  demandCount: number;
  demandPercentage: number;
  isMatched: boolean;
  relatedJobs: { title: string; company: string }[];
}

const SkillGapAnalysis = ({ jobs, userSkills }: SkillGapAnalysisProps) => {
  const analysis = useMemo(() => {
    const skillDemand: Record<string, { count: number; jobs: { title: string; company: string }[] }> = {};
    const normalizedUserSkills = userSkills.map(s => s.toLowerCase().trim());

    // Count skill demand across all jobs
    jobs.forEach(job => {
      if (job.required_skills) {
        job.required_skills.forEach(skill => {
          const normalizedSkill = skill.toLowerCase().trim();
          if (!skillDemand[skill]) {
            skillDemand[skill] = { count: 0, jobs: [] };
          }
          skillDemand[skill].count++;
          if (skillDemand[skill].jobs.length < 3) {
            skillDemand[skill].jobs.push({ title: job.title, company: job.company });
          }
        });
      }
    });

    // Create analysis for each skill
    const totalJobs = jobs.length;
    const skillAnalysisList: SkillAnalysis[] = Object.entries(skillDemand)
      .map(([skill, data]) => {
        const normalizedSkill = skill.toLowerCase().trim();
        const isMatched = normalizedUserSkills.some(
          userSkill => userSkill.includes(normalizedSkill) || normalizedSkill.includes(userSkill)
        );
        return {
          skill,
          demandCount: data.count,
          demandPercentage: Math.round((data.count / totalJobs) * 100),
          isMatched,
          relatedJobs: data.jobs
        };
      })
      .sort((a, b) => b.demandCount - a.demandCount);

    const matchedSkills = skillAnalysisList.filter(s => s.isMatched);
    const missingSkills = skillAnalysisList.filter(s => !s.isMatched);
    const topMissingSkills = missingSkills.slice(0, 10);
    
    const overallMatchRate = totalJobs > 0 && skillAnalysisList.length > 0
      ? Math.round((matchedSkills.length / skillAnalysisList.length) * 100)
      : 0;

    return {
      matchedSkills,
      missingSkills,
      topMissingSkills,
      overallMatchRate,
      totalSkillsInDemand: skillAnalysisList.length,
      totalJobsAnalyzed: totalJobs
    };
  }, [jobs, userSkills]);

  const [loadingResources, setLoadingResources] = useState(false);
  const [skillResources, setSkillResources] = useState<SkillResources[]>([]);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const getDemandLevel = (percentage: number) => {
    if (percentage >= 40) return { label: 'Very High', color: 'text-red-500', bg: 'bg-red-500' };
    if (percentage >= 25) return { label: 'High', color: 'text-orange-500', bg: 'bg-orange-500' };
    if (percentage >= 15) return { label: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-500' };
    return { label: 'Low', color: 'text-green-500', bg: 'bg-green-500' };
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case "course": return <GraduationCap className="h-4 w-4" />;
      case "video": return <Video className="h-4 w-4" />;
      case "documentation": return <FileText className="h-4 w-4" />;
      case "book": return <BookMarked className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  const loadLearningResources = async () => {
    if (analysis.topMissingSkills.length === 0) return;
    
    setLoadingResources(true);
    try {
      const skillNames = analysis.topMissingSkills.slice(0, 5).map(s => s.skill);
      
      const { result } = await api.post<{ result: string }>("/api/ai/learning-resources", {
        profile: `Missing skills: ${skillNames.join(", ")}`,
      });
      let parsed: SkillResources[] = [];
      try {
        parsed = JSON.parse(result);
      } catch {
        parsed = [];
      }
      setSkillResources(parsed);
    } catch (error) {
      console.error("Error loading learning resources:", error);
      toast.error("Failed to load learning resources");
    } finally {
      setLoadingResources(false);
    }
  };

  const toggleSkillExpanded = (skill: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
        // Load resources if not already loaded
        if (skillResources.length === 0 && !loadingResources) {
          loadLearningResources();
        }
      }
      return next;
    });
  };

  const getResourcesForSkill = (skillName: string): LearningResource[] => {
    const found = skillResources.find(
      sr => sr.skill.toLowerCase() === skillName.toLowerCase()
    );
    return found?.resources || [];
  };

  if (userSkills.length === 0) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Skill Gap Analysis
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Skill Gap Analysis
            </SheetTitle>
          </SheetHeader>
          <div className="mt-8 text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Add Your Skills</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Complete your profile with skills to see personalized skill gap analysis and recommendations.
            </p>
            <Button className="mt-4 bg-gradient-hero hover:opacity-90" asChild>
              <a href="/dashboard/jobseeker">Go to Profile</a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <TrendingUp className="h-4 w-4" />
          Skill Gap Analysis
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-6 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Skill Gap Analysis
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)]">
          <div className="p-6 space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-primary">{analysis.overallMatchRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">Market Match Rate</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-foreground">{analysis.topMissingSkills.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Skills to Learn</p>
              </div>
            </div>

            {/* Your Matched Skills */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Your Matching Skills ({analysis.matchedSkills.length})
              </h3>
              {analysis.matchedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {analysis.matchedSkills.slice(0, 8).map((skill, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary"
                      className="bg-green-500/10 text-green-600 border border-green-500/20"
                    >
                      ✓ {skill.skill}
                      <span className="ml-1 opacity-60">({skill.demandPercentage}%)</span>
                    </Badge>
                  ))}
                  {analysis.matchedSkills.length > 8 && (
                    <Badge variant="secondary" className="opacity-60">
                      +{analysis.matchedSkills.length - 8} more
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  None of your skills match current job requirements.
                </p>
              )}
            </div>

            <Separator />

            {/* Skills to Learn */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Top Skills to Learn
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Based on {analysis.totalJobsAnalyzed} jobs, these skills will improve your chances:
              </p>

              {/* Load Resources Button */}
              {skillResources.length === 0 && !loadingResources && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLearningResources}
                  className="w-full mb-4 gap-2"
                >
                  <GraduationCap className="h-4 w-4" />
                  Load Learning Resources
                </Button>
              )}

              {loadingResources && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading personalized learning resources...
                </div>
              )}

              <div className="space-y-3">
                {analysis.topMissingSkills.map((skill, idx) => {
                  const demand = getDemandLevel(skill.demandPercentage);
                  const resources = getResourcesForSkill(skill.skill);
                  const isExpanded = expandedSkills.has(skill.skill);

                  return (
                    <Collapsible
                      key={idx}
                      open={isExpanded}
                      onOpenChange={() => toggleSkillExpanded(skill.skill)}
                    >
                      <div className="bg-card border border-border rounded-lg overflow-hidden">
                        <CollapsibleTrigger className="w-full p-4 text-left">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{skill.skill}</span>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${demand.color} border-current`}
                              >
                                {demand.label} Demand
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-primary">
                                {skill.demandPercentage}%
                              </span>
                              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                          
                          <Progress 
                            value={skill.demandPercentage} 
                            className="h-2 mb-2"
                          />
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Required in {skill.demandCount} job{skill.demandCount > 1 ? 's' : ''}</span>
                            {resources.length > 0 && (
                              <span className="text-primary">{resources.length} resources available</span>
                            )}
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                            {/* Example Jobs */}
                            {skill.relatedJobs.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Example jobs:</p>
                                <div className="flex flex-wrap gap-1">
                                  {skill.relatedJobs.map((job, jIdx) => (
                                    <span key={jIdx} className="text-xs bg-secondary/50 px-2 py-0.5 rounded">
                                      {job.title} at {job.company}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Learning Resources */}
                            {resources.length > 0 ? (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                                  <GraduationCap className="h-3 w-3" />
                                  Learning Resources
                                </p>
                                <div className="space-y-2">
                                  {resources.map((resource, rIdx) => (
                                    <a
                                      key={rIdx}
                                      href={resource.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors group"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="p-1.5 bg-primary/10 rounded text-primary">
                                          {getResourceIcon(resource.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                              {resource.title}
                                            </span>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                          </div>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-xs text-muted-foreground">{resource.provider}</span>
                                            <span className="text-xs text-muted-foreground">•</span>
                                            <span className="text-xs text-muted-foreground">{resource.duration}</span>
                                            <Badge 
                                              variant="secondary" 
                                              className={`text-[10px] px-1.5 py-0 ${
                                                resource.isFree 
                                                  ? 'bg-green-500/10 text-green-600' 
                                                  : 'bg-amber-500/10 text-amber-600'
                                              }`}
                                            >
                                              {resource.isFree ? 'Free' : 'Paid'}
                                            </Badge>
                                            <Badge 
                                              variant="outline" 
                                              className="text-[10px] px-1.5 py-0"
                                            >
                                              {resource.level}
                                            </Badge>
                                          </div>
                                        </div>
                                      </div>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : loadingResources ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading resources...
                              </div>
                            ) : skillResources.length > 0 ? (
                              <p className="text-xs text-muted-foreground">No specific resources found for this skill.</p>
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>

              {analysis.missingSkills.length > 10 && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  + {analysis.missingSkills.length - 10} more skills in demand
                </p>
              )}
            </div>

            <Separator />

            {/* Recommendations */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Quick Win</h4>
                  <p className="text-sm text-muted-foreground">
                    {analysis.topMissingSkills.length > 0 ? (
                      <>
                        Learning <span className="font-medium text-foreground">{analysis.topMissingSkills[0]?.skill}</span> could 
                        unlock {analysis.topMissingSkills[0]?.demandCount} more job opportunities!
                      </>
                    ) : (
                      "Your skills are well-matched to current job openings!"
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default SkillGapAnalysis;
