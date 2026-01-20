import { Shield, Star, Zap, Eye, Lock, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

interface VerifiedBenefitsBannerProps {
  isVerified: boolean;
  verificationProgress: number;
  onStartVerification?: () => void;
}

const VERIFIED_BENEFITS = [
  {
    icon: Eye,
    title: "Priority Visibility",
    description: "Your profile appears first to recruiters",
    locked: true,
  },
  {
    icon: Zap,
    title: "Fast-Track Screening",
    description: "Skip initial interviews with verified badge",
    locked: true,
  },
  {
    icon: Star,
    title: "Higher Response Rate",
    description: "3x more recruiter responses on average",
    locked: true,
  },
  {
    icon: Shield,
    title: "Verified Badge",
    description: "Stand out with a trust badge on your profile",
    locked: true,
  },
];

const VerifiedBenefitsBanner = ({
  isVerified,
  verificationProgress,
  onStartVerification,
}: VerifiedBenefitsBannerProps) => {
  const navigate = useNavigate();

  if (isVerified) {
    return (
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-full">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-green-700 dark:text-green-400">
              You're Verified!
            </h3>
            <p className="text-sm text-muted-foreground">
              Enjoy priority visibility and faster hiring
            </p>
          </div>
          <Badge className="ml-auto bg-green-500 text-white">
            <Shield className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 border border-primary/20 rounded-xl p-6 mb-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Section - CTA */}
        <div className="lg:w-1/3">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-lg text-foreground">Unlock Premium Benefits</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Get verified to stand out from other candidates and get hired faster.
          </p>
          
          {verificationProgress > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Verification Progress</span>
                <span>{verificationProgress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${verificationProgress}%` }}
                />
              </div>
            </div>
          )}
          
          <Button 
            onClick={onStartVerification || (() => navigate('/verification'))}
            className="bg-gradient-hero hover:opacity-90 w-full"
          >
            {verificationProgress > 0 ? 'Continue Verification' : 'Get Verified'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Takes ~30 mins • One-time process
          </p>
        </div>

        {/* Right Section - Benefits Grid */}
        <div className="lg:w-2/3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VERIFIED_BENEFITS.map((benefit, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-border/50 relative overflow-hidden"
              >
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <benefit.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm text-foreground truncate">
                      {benefit.title}
                    </h4>
                    <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {benefit.description}
                  </p>
                </div>
                {/* Subtle locked overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/30 pointer-events-none" />
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">
            💡 You can still apply to jobs without verification
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifiedBenefitsBanner;
