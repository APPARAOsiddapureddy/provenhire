import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { skipSupabaseRequests } from "@/lib/skipSupabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Clock, Video } from "lucide-react";

interface HumanExpertInterviewStageProps {
  onComplete: () => void;
  onReturnToDashboard: () => void;
}

type SlotRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  interviewer_id: string;
  status: string;
  expert_interviewers?: { name: string | null; domain: string | null } | null;
};

type SessionRow = {
  id: string;
  scheduled_at: string | null;
  completed_at: string | null;
  status: string;
  interviewer_id: string;
};

const HumanExpertInterviewStage = ({ onComplete, onReturnToDashboard }: HumanExpertInterviewStageProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [session, setSession] = useState<SessionRow | null>(null);

  const selectedSlot = useMemo(() => slots.find((s) => s.id === selectedSlotId) ?? null, [slots, selectedSlotId]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (skipSupabaseRequests()) {
        setSlots([]);
        setSession(null);
        setLoading(false);
        return;
      }
      const { data: existingSession } = await supabase
        .from("human_interview_sessions")
        .select("id, scheduled_at, completed_at, status, interviewer_id")
        .eq("user_id", user.id)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        setSession(existingSession as SessionRow);
      }

      const { data: slotData, error: slotError } = await supabase
        .from("interviewer_slots")
        .select("id, starts_at, ends_at, interviewer_id, status, expert_interviewers(name, domain)")
        .eq("status", "available")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(20);

      if (slotError) throw slotError;
      setSlots((slotData || []) as unknown as SlotRow[]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Unable to load interview scheduling.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (!session?.id) return;
    if (session.status === "completed") return;

    const interval = window.setInterval(async () => {
      try {
        const { data } = await supabase
          .from("human_interview_sessions")
          .select("id, scheduled_at, completed_at, status, interviewer_id")
          .eq("id", session.id)
          .maybeSingle();

        if (data) {
          const updated = data as SessionRow;
          setSession(updated);
          if (updated.status === "completed") {
            toast.success("Human Expert Interview completed. Finalizing verification…");
            onComplete();
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [session?.id, session?.status, user, onComplete]);

  const bookSlot = async () => {
    if (!user) return;
    if (!selectedSlot) {
      toast.error("Please select a slot to book.");
      return;
    }
    setBooking(true);
    try {
      if (skipSupabaseRequests()) {
        setSession({
          id: "demo-session",
          scheduled_at: selectedSlot.starts_at,
          completed_at: null,
          status: "scheduled",
          interviewer_id: selectedSlot.interviewer_id,
        } as SessionRow);
        toast.success("Slot booked (demo). Complete verification when auth is enabled.");
        setBooking(false);
        return;
      }
      const { error: slotUpdateError } = await supabase
        .from("interviewer_slots")
        .update({ status: "booked", booked_user_id: user.id })
        .eq("id", selectedSlot.id)
        .eq("status", "available");

      if (slotUpdateError) throw slotUpdateError;

      const { data: sessionInsert, error: sessionError } = await supabase
        .from("human_interview_sessions")
        .insert({
          user_id: user.id,
          interviewer_id: selectedSlot.interviewer_id,
          scheduled_at: selectedSlot.starts_at,
          status: "scheduled",
          verification_tier: "expert",
        })
        .select("id, scheduled_at, completed_at, status, interviewer_id")
        .maybeSingle();

      if (sessionError) throw sessionError;

      setSession(sessionInsert as SessionRow);
      toast.success("Slot booked. You’ll receive confirmation soon.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Unable to book this slot.");
      await loadData();
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Stage 5: Human Expert Interview
          </CardTitle>
          <CardDescription>
            Book a live 30–45 minute interview with a domain expert. This stage completes your Expert Verified Skill Passport.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Live video</Badge>
            <Badge variant="secondary">Recorded</Badge>
            <Badge variant="secondary">Fraud-resistant</Badge>
          </div>
          <Button variant="outline" onClick={onReturnToDashboard}>
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>

      {session?.status === "scheduled" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Interview scheduled
            </CardTitle>
            <CardDescription>
              Your slot is booked. Please join on time. After the expert submits the evaluation, your verification will be finalized.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Scheduled at: <span className="font-medium text-foreground">{session.scheduled_at ? new Date(session.scheduled_at).toLocaleString("en-IN") : "—"}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Status: <span className="font-medium text-foreground">{session.status}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {session?.status === "completed" && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5" />
              Interview completed
            </CardTitle>
            <CardDescription>
              Your expert interview is completed. Finalizing your verification status…
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onComplete}>Finalize verification</Button>
          </CardContent>
        </Card>
      )}

      {!session && (
        <Card>
          <CardHeader>
            <CardTitle>Available slots</CardTitle>
            <CardDescription>Select a slot below to book your expert interview.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {slots.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No slots available right now. Please check back in a few hours.
              </div>
            ) : (
              <div className="grid gap-3">
                {slots.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;
                  const when = new Date(slot.starts_at).toLocaleString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlotId(slot.id)}
                      className={`text-left rounded-xl border p-4 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{when}</div>
                          <div className="text-sm text-muted-foreground">
                            Expert: {slot.expert_interviewers?.name || "ProvenHire Expert"} • {slot.expert_interviewers?.domain || "Domain"}
                          </div>
                        </div>
                        {isSelected && <Badge>Selected</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={loadData} disabled={booking}>
                Refresh slots
              </Button>
              <Button onClick={bookSlot} disabled={booking || !selectedSlotId || slots.length === 0}>
                {booking ? "Booking…" : "Book slot"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HumanExpertInterviewStage;

