import { FileText, Brain, Video, UserCheck, Award, ArrowRight, Clock } from "lucide-react";

const VerificationFlowPreview = () => {
  const steps = [
    { 
      icon: FileText, 
      label: "Resume", 
      time: "2 min",
      description: "Upload your profile"
    },
    { 
      icon: Brain, 
      label: "Skill Check", 
      time: "30 min",
      description: "Aptitude + CS fundamentals"
    },
    { 
      icon: Video, 
      label: "AI Interview", 
      time: "20 min",
      description: "Behavioral & technical"
    },
    { 
      icon: UserCheck, 
      label: "Expert Review", 
      time: "Async",
      description: "Human validation"
    },
    { 
      icon: Award, 
      label: "Verified Badge", 
      time: "",
      description: "Level A/B/C certified"
    },
  ];

  return (
    <div className="w-full">
      {/* Desktop View */}
      <div className="hidden md:flex items-center justify-center gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center group">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-center">{step.label}</span>
              {step.time && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {step.time}
                </span>
              )}
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="h-5 w-5 text-muted-foreground mx-3" />
            )}
          </div>
        ))}
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-3">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              {index < steps.length - 1 && (
                <div className="absolute left-1/2 top-full h-3 w-0.5 bg-primary/20 -translate-x-1/2" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{step.label}</span>
                {step.time && (
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                    {step.time}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VerificationFlowPreview;
