import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// TODO: Replace with your actual UPI ID before deploying to production
const PROVENHIRE_UPI_ID = "provenhire@upi";

// TODO: Replace with your actual WhatsApp number before deploying to production
const PROVENHIRE_WHATSAPP = "+91 XXXXXXXXXX";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  stage: string;
  cooldownUntil: Date | null;
  singlePrice: number;
  bundlePrice: number;
}

const STAGE_NAMES: Record<string, string> = {
  ai_skills_interview: "AI Skills Interview",
  data_skills_interview: "AI Skills Interview (Data)",
  system_design_interview: "System Design Interview",
  data_system_design: "Data System Design Interview",
  expert_interview: "Expert Interview",
  non_tech_assignment: "Non-Technical Assignment Retake",
};

export const PaywallModal = ({
  open,
  onClose,
  stage,
  cooldownUntil,
  singlePrice,
  bundlePrice,
}: PaywallModalProps) => {
  const [showPaymentInstructions, setShowPaymentInstructions] = useState<
    "single" | "bundle" | null
  >(null);

  const stageName = STAGE_NAMES[stage] ?? "Interview";
  const isCooldown = cooldownUntil && new Date(cooldownUntil) > new Date();
  const cooldownDateStr = cooldownUntil
    ? new Date(cooldownUntil).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  if (showPaymentInstructions) {
    const amount =
      showPaymentInstructions === "single" ? singlePrice : bundlePrice;
    const attempts = showPaymentInstructions === "single" ? 1 : 2;

    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Your Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <p className="font-semibold text-lg">Pay ₹{amount} via UPI</p>
              <p className="text-sm text-muted-foreground">
                {attempts} retake attempt{attempts > 1 ? "s" : ""} · Valid for
                90 days
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">UPI ID:</p>
              <div className="bg-muted rounded px-3 py-2 font-mono text-sm select-all">{PROVENHIRE_UPI_ID}</div>
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <p className="font-medium">After payment:</p>
              <p className="text-muted-foreground">
                Send your payment screenshot to:
              </p>
              <p className="font-medium">WhatsApp: {PROVENHIRE_WHATSAPP}</p>
              <p className="text-muted-foreground text-xs">
                Include your registered email address in the message. Credits
                will be added within 2 hours.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowPaymentInstructions(null)}
            >
              Back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Get Another Attempt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Your first{" "}
            <span className="font-medium text-foreground">{stageName}</span>{" "}
            attempt has been used.
          </p>

          {isCooldown && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Next attempt available after:{" "}
                <span className="font-medium">{cooldownDateStr}</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-xl p-4 space-y-3">
              <div>
                <p className="font-semibold text-lg">₹{singlePrice}</p>
                <p className="text-sm text-muted-foreground">Single retake</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1 attempt</li>
                <li>Valid for 90 days</li>
              </ul>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setShowPaymentInstructions("single")}
              >
                Buy Now
              </Button>
            </div>

            <div className="border-2 border-primary rounded-xl p-4 space-y-3 relative">
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">
                Best Value
              </Badge>
              <div>
                <p className="font-semibold text-lg">₹{bundlePrice}</p>
                <p className="text-sm text-muted-foreground">Two retakes</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>2 attempts</li>
                <li>Valid for 90 days</li>
                <li>Save ₹{singlePrice * 2 - bundlePrice}</li>
              </ul>
              <Button
                className="w-full"
                onClick={() => setShowPaymentInstructions("bundle")}
              >
                Buy Bundle
              </Button>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Your verification is valid for 365 days once you pass.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
