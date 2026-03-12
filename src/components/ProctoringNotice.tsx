import { Shield } from "lucide-react";

/**
 * Always display integrity messaging to maintain recruiter trust.
 * Per product: "Even if proctoring enforcement is OFF, the platform should
 * still display: 'ProvenHire uses integrity monitoring to ensure fair assessments.'"
 */
const ProctoringNotice = () => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
    <div className="flex items-center gap-2">
      <Shield className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm font-medium text-foreground">
        ProvenHire uses integrity monitoring to ensure fair assessments.
      </span>
    </div>
  </div>
);

export default ProctoringNotice;
