import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  MapPin, 
  Briefcase, 
  DollarSign, 
  GraduationCap,
  Building2,
  X,
  CheckCircle2,
  Sparkles,
  TrendingUp
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary_range: string | null;
  job_type: string | null;
  required_skills: string[] | null;
  description: string | null;
  experience_required: number | null;
  created_at: string;
}

interface JobComparisonDialogProps {
  jobs: Job[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveJob: (jobId: string) => void;
  onApply: (jobId: string) => void;
  appliedJobs: Set<string>;
  userSkills?: string[];
}

const JobComparisonDialog = ({ 
  jobs, 
  open, 
  onOpenChange, 
  onRemoveJob,
  onApply,
  appliedJobs,
  userSkills = []
}: JobComparisonDialogProps) => {
  const getExperienceText = (years: number | null) => {
    if (years === null || years === undefined) return 'Not specified';
    if (years === 0) return 'Fresher';
    if (years === 1) return '1 year';
    return `${years}+ years`;
  };

  const calculateMatchScore = (job: Job): { score: number; matchedSkills: string[]; missingSkills: string[] } => {
    if (!job.required_skills || job.required_skills.length === 0 || userSkills.length === 0) {
      return { score: 0, matchedSkills: [], missingSkills: job.required_skills || [] };
    }

    const normalizedUserSkills = userSkills.map(s => s.toLowerCase().trim());
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    job.required_skills.forEach(skill => {
      const normalizedSkill = skill.toLowerCase().trim();
      const isMatch = normalizedUserSkills.some(userSkill => 
        userSkill.includes(normalizedSkill) || normalizedSkill.includes(userSkill)
      );
      if (isMatch) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    });

    const score = Math.round((matchedSkills.length / job.required_skills.length) * 100);
    return { score, matchedSkills, missingSkills };
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const comparisonFields = [
    {
      label: 'Company',
      icon: Building2,
      getValue: (job: Job) => job.company
    },
    {
      label: 'Location',
      icon: MapPin,
      getValue: (job: Job) => job.location || 'Remote'
    },
    {
      label: 'Job Type',
      icon: Briefcase,
      getValue: (job: Job) => job.job_type || 'Full-time'
    },
    {
      label: 'Salary',
      icon: DollarSign,
      getValue: (job: Job) => job.salary_range || 'Competitive'
    },
    {
      label: 'Experience',
      icon: GraduationCap,
      getValue: (job: Job) => getExperienceText(job.experience_required)
    }
  ];

  if (jobs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold text-foreground">
            Compare Jobs ({jobs.length})
          </DialogTitle>
          <DialogDescription className="sr-only">Side-by-side job comparison</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <div className="p-6 pt-4">
            {/* Job Headers with Match Score */}
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(200px, 1fr))` }}>
              {jobs.map((job) => {
                const { score, matchedSkills } = calculateMatchScore(job);
                const hasUserSkills = userSkills.length > 0;
                
                return (
                  <div key={job.id} className="bg-secondary/50 rounded-xl p-4 relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveJob(job.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {job.company?.[0] || 'C'}
                      </div>
                      <div className="min-w-0 pr-6">
                        <h3 className="font-semibold text-foreground text-sm leading-tight truncate">
                          {job.title}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                      </div>
                    </div>

                    {/* Match Score */}
                    {hasUserSkills && job.required_skills && job.required_skills.length > 0 && (
                      <div className="mb-3 p-3 bg-card rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className={`h-4 w-4 ${getScoreColor(score)}`} />
                            <span className="text-xs font-medium text-foreground">Match Score</span>
                          </div>
                          <span className={`text-lg font-bold ${getScoreColor(score)}`}>{score}%</span>
                        </div>
                        <Progress 
                          value={score} 
                          className="h-2"
                          style={{ 
                            '--progress-background': score >= 80 ? 'rgb(34 197 94)' : score >= 50 ? 'rgb(234 179 8)' : 'rgb(249 115 22)'
                          } as React.CSSProperties}
                        />
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {matchedSkills.length} of {job.required_skills.length} skills matched
                        </p>
                      </div>
                    )}

                    {!hasUserSkills && (
                      <div className="mb-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-xs">Add skills to see match score</span>
                        </div>
                      </div>
                    )}

                    <Button
                      size="sm"
                      className="w-full bg-gradient-hero hover:opacity-90"
                      onClick={() => onApply(job.id)}
                      disabled={appliedJobs.has(job.id)}
                    >
                      {appliedJobs.has(job.id) ? 'Applied' : 'Apply Now'}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Comparison Table */}
            <div className="mt-6 space-y-1">
              {comparisonFields.map((field) => (
                <div 
                  key={field.label}
                  className="grid gap-4 py-3 border-b border-border"
                  style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(200px, 1fr))` }}
                >
                  {jobs.map((job, index) => (
                    <div key={job.id} className="flex items-start gap-2">
                      {index === 0 && (
                        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                          <field.icon className="h-4 w-4 shrink-0" />
                        </div>
                      )}
                      <div className="min-w-0">
                        {index === 0 && (
                          <p className="text-xs text-muted-foreground mb-1">{field.label}</p>
                        )}
                        {index !== 0 && (
                          <p className="text-xs text-muted-foreground mb-1 opacity-0">{field.label}</p>
                        )}
                        <p className="text-sm font-medium text-foreground">{field.getValue(job)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Skills Comparison with Match Indicators */}
              <div 
                className="grid gap-4 py-3"
                style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(200px, 1fr))` }}
              >
                {jobs.map((job) => {
                  const { matchedSkills, missingSkills } = calculateMatchScore(job);
                  const hasUserSkills = userSkills.length > 0;
                  
                  return (
                    <div key={job.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Required Skills</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {job.required_skills && job.required_skills.length > 0 ? (
                          <>
                            {hasUserSkills ? (
                              <>
                                {matchedSkills.map((skill, idx) => (
                                  <Badge 
                                    key={`matched-${idx}`} 
                                    variant="secondary" 
                                    className="text-xs bg-green-500/10 text-green-600 border border-green-500/20"
                                  >
                                    ✓ {skill}
                                  </Badge>
                                ))}
                                {missingSkills.map((skill, idx) => (
                                  <Badge 
                                    key={`missing-${idx}`} 
                                    variant="secondary" 
                                    className="text-xs bg-orange-500/10 text-orange-600 border border-orange-500/20"
                                  >
                                    {skill}
                                  </Badge>
                                ))}
                              </>
                            ) : (
                              job.required_skills.map((skill, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="secondary" 
                                  className="text-xs bg-primary/10 text-primary border border-primary/20"
                                >
                                  {skill}
                                </Badge>
                              ))
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not specified</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Description Comparison */}
              <div 
                className="grid gap-4 py-3 border-t border-border"
                style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(200px, 1fr))` }}
              >
                {jobs.map((job) => (
                  <div key={job.id}>
                    <p className="text-xs text-muted-foreground mb-2">Description</p>
                    <p className="text-sm text-muted-foreground line-clamp-4">
                      {job.description || 'No description provided.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default JobComparisonDialog;
