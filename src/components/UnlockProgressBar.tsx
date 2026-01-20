import { Progress } from "@/components/ui/progress";
import { Eye, Star, Award, Lock, Check } from "lucide-react";

interface UnlockProgressBarProps {
  progress?: number;
  className?: string;
}

const UnlockProgressBar = ({ progress = 0, className = "" }: UnlockProgressBarProps) => {
  const milestones = [
    { 
      percentage: 30, 
      label: "Visible to companies", 
      icon: Eye,
      description: "Your profile appears in search"
    },
    { 
      percentage: 60, 
      label: "Priority screening", 
      icon: Star,
      description: "Get reviewed first by recruiters"
    },
    { 
      percentage: 100, 
      label: "Verified badge", 
      icon: Award,
      description: "Full access to all opportunities"
    },
  ];

  const getIconForMilestone = (milestone: typeof milestones[0]) => {
    const Icon = milestone.icon;
    const isUnlocked = progress >= milestone.percentage;
    
    if (isUnlocked) {
      return (
        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Check className="h-5 w-5 text-green-600" />
        </div>
      );
    }
    
    return (
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  };

  return (
    <div className={`bg-card p-6 rounded-xl border ${className}`}>
      <h3 className="font-semibold mb-4 text-center">What You Unlock</h3>
      
      {/* Progress Bar */}
      <div className="relative mb-6">
        <Progress value={progress} className="h-3" />
        <div className="absolute -top-1 left-0 right-0 flex justify-between">
          {milestones.map((milestone) => (
            <div
              key={milestone.percentage}
              className={`w-5 h-5 rounded-full border-2 ${
                progress >= milestone.percentage
                  ? "bg-primary border-primary"
                  : "bg-background border-muted"
              }`}
              style={{ marginLeft: milestone.percentage === 30 ? "27%" : milestone.percentage === 60 ? "0" : "0" }}
            />
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="grid grid-cols-3 gap-4">
        {milestones.map((milestone) => (
          <div 
            key={milestone.percentage} 
            className={`text-center ${progress >= milestone.percentage ? "" : "opacity-60"}`}
          >
            <div className="flex justify-center mb-2">
              {getIconForMilestone(milestone)}
            </div>
            <p className="text-sm font-medium">{milestone.percentage}%</p>
            <p className="text-xs text-muted-foreground">{milestone.label}</p>
          </div>
        ))}
      </div>

      {progress === 0 && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          Start verification to unlock benefits →
        </p>
      )}
    </div>
  );
};

export default UnlockProgressBar;
