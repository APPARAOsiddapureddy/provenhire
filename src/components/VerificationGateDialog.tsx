import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, Lock, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface VerificationGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verificationProgress: number;
  currentStage: string | null;
}

const VerificationGateDialog = ({
  open,
  onOpenChange,
  verificationProgress,
  currentStage,
}: VerificationGateDialogProps) => {
  const navigate = useNavigate();

  const getStageName = (stage: string | null) => {
    if (!stage) return "Profile Setup";
    const names: Record<string, string> = {
      profile_setup: "Profile Setup",
      aptitude_test: "Aptitude Test",
      dsa_round: "DSA Round",
      expert_interview: "Expert Interview",
      completed: "Verification Complete",
    };
    return names[stage] || stage.replace("_", " ");
  };

  const handleStartVerification = () => {
    onOpenChange(false);
    navigate("/verification");
  };

  const handleGoToDashboard = () => {
    onOpenChange(false);
    navigate("/dashboard/jobseeker");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Complete Verification First
          </DialogTitle>
          <DialogDescription className="text-center">
            To access this feature, you need to complete the ProvenHire verification process. This helps employers trust your skills and qualifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Verification Progress</span>
              <span className="font-medium">{Math.round(verificationProgress)}%</span>
            </div>
            <Progress value={verificationProgress} className="h-2" />
          </div>

          {/* Current Stage */}
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Next Step</p>
              <p className="text-xs text-muted-foreground">
                {getStageName(currentStage)}
              </p>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">After verification, you can:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Browse and apply to all job listings</li>
              <li>Get matched with employers via AI</li>
              <li>Receive your Skill Passport certification</li>
              <li>Stand out with a verified profile badge</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button 
            onClick={handleStartVerification}
            className="w-full bg-gradient-hero hover:opacity-90"
          >
            {verificationProgress > 0 ? "Continue Verification" : "Start Verification"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            onClick={handleGoToDashboard}
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VerificationGateDialog;
