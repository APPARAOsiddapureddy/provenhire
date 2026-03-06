/**
 * Gate that collects mobile number from recruiters and interviewers after sign-in.
 * Blocks dashboard access until phone is provided.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { Phone } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface PhoneCollectGateProps {
  role: "recruiter" | "expert_interviewer";
  children: React.ReactNode;
}

export default function PhoneCollectGate({ role, children }: PhoneCollectGateProps) {
  const [checking, setChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        if (role === "recruiter") {
          const { profile } = await api.get<{ profile: { phone?: string | null } }>("/api/users/recruiter-profile");
          setNeedsPhone(!profile?.phone?.trim());
        } else {
          const { interviewer } = await api.get<{ interviewer: { phone?: string | null } }>("/api/expert/profile");
          setNeedsPhone(!interviewer?.phone?.trim());
        }
      } catch {
        setNeedsPhone(false);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Please enter your mobile number");
      return;
    }
    setSaving(true);
    try {
      if (role === "recruiter") {
        await api.post("/api/users/recruiter-profile", { phone: phone.trim() });
      } else {
        await api.patch("/api/expert/profile", { phone: phone.trim() });
      }
      toast.success("Mobile number saved");
      setNeedsPhone(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (needsPhone) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-2">
              <Phone className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-center">Add your mobile number</DialogTitle>
            <DialogDescription className="text-center">
              We need your mobile number so our team can easily connect with you. This helps with onboarding and support.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Number *</Label>
              <PhoneInput
                id="phone"
                value={phone}
                onChange={setPhone}
                placeholder="9876543210"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
}
