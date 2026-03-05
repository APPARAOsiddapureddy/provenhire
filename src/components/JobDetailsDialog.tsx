import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { 
  MapPin, 
  Briefcase, 
  DollarSign, 
  Clock, 
  Building2, 
  Calendar,
  CheckCircle2,
  GraduationCap,
  FileText
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
  created_at?: string;
  createdAt?: string;
  assignment?: string | null;
}

interface JobDetailsDialogProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (assignmentResponse?: string) => void;
  hasApplied?: boolean;
  isApplying?: boolean;
}

const JobDetailsDialog = ({ 
  job, 
  open, 
  onOpenChange, 
  onApply,
  hasApplied = false,
  isApplying = false 
}: JobDetailsDialogProps) => {
  const [assignmentResponse, setAssignmentResponse] = useState("");
  useEffect(() => {
    setAssignmentResponse("");
  }, [job?.id]);

  if (!job) return null;

  const hasAssignment = !!job.assignment?.trim();
  const canApply = !hasAssignment || assignmentResponse.trim().length > 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getExperienceText = (years: number | null) => {
    if (years === null || years === undefined) return 'Not specified';
    if (years === 0) return 'Fresher / Entry Level';
    if (years === 1) return '1 year';
    return `${years}+ years`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-hero flex items-center justify-center text-white font-bold text-2xl shrink-0">
              {job.company?.[0] || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-2xl font-bold text-foreground mb-1">
                {job.title}
              </DialogTitle>
              <DialogDescription className="sr-only">Job details and application</DialogDescription>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">{job.company}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Quick Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <MapPin className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium text-foreground truncate">{job.location || 'Remote'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <Briefcase className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Job Type</p>
              <p className="text-sm font-medium text-foreground">{job.job_type || 'Full-time'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <DollarSign className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Salary</p>
              <p className="text-sm font-medium text-foreground truncate">{job.salary_range || 'Competitive'}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <GraduationCap className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Experience</p>
              <p className="text-sm font-medium text-foreground">{getExperienceText(job.experience_required)}</p>
            </div>
          </div>

          <Separator />

          {/* Job Description */}
          <div>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Job Description
            </h3>
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {job.description || 'No description provided for this position. Please contact the company for more details.'}
              </p>
            </div>
          </div>

          {/* Required Skills */}
          {job.required_skills && job.required_skills.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Required Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.required_skills.map((skill, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary" 
                    className="px-3 py-1.5 text-sm bg-primary/10 text-primary border border-primary/20"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Company Info */}
          <div>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              About {job.company}
            </h3>
            <div className="bg-secondary/30 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-hero flex items-center justify-center text-white font-bold text-lg">
                  {job.company?.[0] || 'C'}
                </div>
                <div>
                  <p className="font-medium text-foreground">{job.company}</p>
                  <p className="text-sm text-muted-foreground">Technology Company</p>
                </div>
              </div>
            </div>
          </div>

          {/* Assignment (non-technical jobs) */}
          {hasAssignment && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Take-Home Assignment (Required)
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Complete this assignment to apply. Your response will be reviewed by the recruiter.
                </p>
                <div className="bg-secondary/30 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">{job.assignment}</pre>
                </div>
                <div className="space-y-2">
                  <Label>Your response *</Label>
                  <Textarea
                    placeholder="Type your assignment response here..."
                    value={assignmentResponse}
                    onChange={(e) => setAssignmentResponse(e.target.value)}
                    rows={8}
                    className="resize-y min-h-[160px]"
                  />
                </div>
              </div>
            </>
          )}

          {/* Posted Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Posted on {formatDate(job.created_at ?? job.createdAt ?? '')}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              ← Back
            </Button>
            <Button 
              className="flex-1 bg-gradient-hero hover:opacity-90"
              onClick={() => onApply(hasAssignment ? assignmentResponse : undefined)}
              disabled={hasApplied || isApplying || !canApply}
            >
              {hasApplied ? 'Already Applied' : isApplying ? 'Applying...' : hasAssignment && !assignmentResponse.trim() ? 'Complete assignment to apply' : 'Apply Now'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JobDetailsDialog;
