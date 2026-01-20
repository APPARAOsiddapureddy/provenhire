import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Brain, MessageSquare, Shield, Star, TrendingUp, Lock } from "lucide-react";

interface SampleReportDialogProps {
  trigger?: React.ReactNode;
}

const SampleReportDialog = ({ trigger }: SampleReportDialogProps) => {
  const skillsData = [
    { name: "JavaScript", score: 92, level: "Expert" },
    { name: "React", score: 88, level: "Advanced" },
    { name: "Node.js", score: 75, level: "Intermediate" },
    { name: "System Design", score: 82, level: "Advanced" },
    { name: "Problem Solving", score: 95, level: "Expert" },
    { name: "Communication", score: 85, level: "Advanced" },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600 bg-green-100";
    if (score >= 75) return "text-blue-600 bg-blue-100";
    if (score >= 60) return "text-amber-600 bg-amber-100";
    return "text-red-600 bg-red-100";
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            View Sample Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            Sample Verification Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Candidate Summary */}
          <div className="bg-gradient-to-r from-primary/5 to-accent/5 p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">Verified Candidate</h3>
                <p className="text-sm text-muted-foreground">Frontend Developer • 3 years exp.</p>
              </div>
              <Badge className="bg-green-100 text-green-700 border-green-200">
                <Star className="h-3 w-3 mr-1" />
                Level A Certified
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Verification Date: Jan 15, 2026</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-green-600 font-medium">All stages passed</span>
            </div>
          </div>

          {/* Skills Heatmap */}
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Skills Heatmap
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {skillsData.map((skill) => (
                <div key={skill.name} className="bg-secondary/50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{skill.name}</span>
                    <Badge variant="secondary" className={getScoreColor(skill.score)}>
                      {skill.score}%
                    </Badge>
                  </div>
                  <Progress value={skill.score} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{skill.level}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Confidence Score */}
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600" />
              AI Confidence Score
            </h4>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="35"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-blue-100 dark:text-blue-900"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="35"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray={`${87 * 2.2} ${100 * 2.2}`}
                    className="text-blue-600"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-blue-600">
                  87%
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">
                  Based on response analysis, problem-solving approach, and communication clarity.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">Clear communicator</Badge>
                  <Badge variant="secondary" className="text-xs">Strong problem-solver</Badge>
                  <Badge variant="secondary" className="text-xs">Quick learner</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Expert Notes (Blurred) */}
          <div className="relative">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Expert Interview Notes
            </h4>
            <div className="bg-secondary/50 p-4 rounded-lg relative overflow-hidden">
              <div className="blur-sm select-none pointer-events-none">
                <p className="text-sm mb-2">
                  "Candidate demonstrated excellent understanding of React patterns and state management. 
                  Strong ability to break down complex problems into manageable parts..."
                </p>
                <p className="text-sm">
                  "Communication was clear and structured. Showed good awareness of trade-offs 
                  when discussing architectural decisions..."
                </p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                <div className="text-center">
                  <Lock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Full notes available to recruiters
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Stages Summary */}
          <div className="bg-secondary/30 p-4 rounded-lg">
            <h4 className="font-semibold mb-3">Verification Stages Completed</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  ✓
                </div>
                <span className="text-sm">Aptitude Test</span>
                <span className="text-sm text-muted-foreground ml-auto">Score: 85%</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  ✓
                </div>
                <span className="text-sm">Role-Specific Test (DSA)</span>
                <span className="text-sm text-muted-foreground ml-auto">Score: 78%</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  ✓
                </div>
                <span className="text-sm">Expert Interview</span>
                <span className="text-sm text-muted-foreground ml-auto">Rating: 4.5/5</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SampleReportDialog;
