import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Calendar, Loader2 } from "lucide-react";

type Eligibility = {
  admin_review_status: string;
  requires_payment: boolean;
  can_access_payment_page: boolean;
  can_access_slots: boolean;
  block_human_interview_section: boolean;
};

interface MatchedInterviewer {
  id: string;
  name: string | null;
  domain: string | null;
  track: string;
  domains: string[] | null;
  experienceYears: number | null;
  slots: { id: string; startsAt: string; endsAt: string | null }[];
}

const formatSlot = (d: string) =>
  new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function HumanInterviewSlotsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [interviewers, setInterviewers] = useState<MatchedInterviewer[]>([]);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let eligibilityLocal: Eligibility | null = null;
      try {
        const e = await api.get<Eligibility>("/api/human-interview/eligibility");
        setEligibility(e);
        eligibilityLocal = e;
        if (e.block_human_interview_section || !e.can_access_slots) {
          toast.message("Slot booking isn’t available yet.");
          if (e.can_access_payment_page) {
            navigate("/human-interview/payment", { replace: true });
          } else {
            navigate("/dashboard/jobseeker", { replace: true });
          }
          return;
        }
      } catch {
        navigate("/dashboard/jobseeker", { replace: true });
        return;
      }

      try {
        const res = await api.get<{ interviewers: MatchedInterviewer[]; gated?: boolean }>(
          "/api/verification/matched-interviewers"
        );
        if (res.gated) {
          toast.error("Complete payment or wait for admin approval first.");
          if (eligibilityLocal?.can_access_payment_page) {
            navigate("/human-interview/payment", { replace: true });
          } else {
            navigate("/dashboard/jobseeker", { replace: true });
          }
          return;
        }
        setInterviewers(res.interviewers ?? []);
      } catch {
        toast.error("Could not load slots");
        if (eligibilityLocal?.can_access_payment_page) {
          navigate("/human-interview/payment", { replace: true });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleBook = async (slotId: string) => {
    setBookingSlotId(slotId);
    try {
      await api.post("/api/verification/book-slot", { slotId });
      toast.success("Slot booked — check your email for details.");
      navigate("/dashboard/jobseeker", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Booking failed";
      toast.error(msg);
    } finally {
      setBookingSlotId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-12 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Book your Human Expert Interview
          </CardTitle>
          <CardDescription>Select an available slot. Confirmation will be emailed to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {interviewers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open slots in the next two weeks. Check back soon.</p>
          ) : (
            interviewers.map((inv) => (
              <div key={inv.id} className="border rounded-lg p-4 space-y-3">
                <div>
                  <p className="font-medium">{inv.name ?? "Expert interviewer"}</p>
                  <p className="text-sm text-muted-foreground">{inv.domain ?? inv.domains?.[0] ?? ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inv.slots.map((s) => (
                    <Button
                      key={s.id}
                      variant="outline"
                      size="sm"
                      disabled={bookingSlotId != null}
                      onClick={() => void handleBook(s.id)}
                    >
                      {bookingSlotId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : formatSlot(s.startsAt)}
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
          <Button variant="ghost" onClick={() => navigate("/dashboard/jobseeker")}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
