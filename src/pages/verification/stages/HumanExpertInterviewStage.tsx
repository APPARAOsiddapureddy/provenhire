import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface HumanExpertInterviewStageProps {
  onComplete: () => void;
  onReturnToDashboard: () => void;
}

const formatSlot = (d: string) =>
  new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

interface MatchedInterviewer {
  id: string;
  name: string | null;
  domain: string | null;
  track: string;
  domains: string[] | null;
  experienceYears: number | null;
  slots: { id: string; startsAt: string; endsAt: string | null }[];
}

export default function HumanExpertInterviewStage({ onComplete, onReturnToDashboard }: HumanExpertInterviewStageProps) {
  const navigate = useNavigate();
  const [interviewers, setInterviewers] = useState<MatchedInterviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookedSession, setBookedSession] = useState<{ scheduledAt: string; meetingLink?: string | null } | null>(null);
  const [refreshingSession, setRefreshingSession] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ interviewers: MatchedInterviewer[] }>("/api/verification/matched-interviewers");
        setInterviewers(res.interviewers ?? []);

        const sessionRes = await api.get<{ session: { scheduledAt: string; meetingLink?: string | null } | null }>("/api/verification/human-interview-session").catch(() => null);
        if (sessionRes?.session?.scheduledAt) {
          setBookedSession({ scheduledAt: sessionRes.session.scheduledAt, meetingLink: sessionRes.session.meetingLink });
        }
      } catch {
        toast.error("Failed to load interviewers");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleBook = async (slotId: string) => {
    setBookingSlotId(slotId);
    try {
      const res = await api.post<{ session: { scheduledAt: string } }>("/api/verification/book-slot", { slotId });
      const scheduledAt = res.session?.scheduledAt ?? "";
      const formatted = formatSlot(scheduledAt);
      toast.success(`Slot booked! Your interview is scheduled for ${formatted}.`);
      onReturnToDashboard();
      navigate("/dashboard/jobseeker");
    } catch (err: any) {
      toast.error(err?.message || "Failed to book slot");
    } finally {
      setBookingSlotId(null);
    }
  };

  const refreshSession = async () => {
    setRefreshingSession(true);
    try {
      const res = await api.get<{ session: { scheduledAt: string; meetingLink?: string | null } | null }>("/api/verification/human-interview-session");
      if (res?.session) {
        setBookedSession({ scheduledAt: res.session.scheduledAt, meetingLink: res.session.meetingLink });
        if (res.session.meetingLink) toast.success("Google Meet link is ready!");
        else toast("Interviewer will share the link shortly. Try again before your scheduled time.");
      }
    } catch {
      toast.error("Failed to load session");
    } finally {
      setRefreshingSession(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const GOOGLE_MEET_LANDING = "https://meet.google.com/landing";

  if (bookedSession) {
    const hasGoogleMeetLink = bookedSession.meetingLink?.includes("meet.google.com") && !bookedSession.meetingLink.includes("/landing");
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Interview scheduled
          </CardTitle>
          <CardDescription>
            Your human expert interview is scheduled for {formatSlot(bookedSession.scheduledAt)}.
            Join via Google Meet at the scheduled time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <a href={hasGoogleMeetLink ? bookedSession.meetingLink! : GOOGLE_MEET_LANDING} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Google Meet
            </a>
          </Button>
          {hasGoogleMeetLink ? (
            <p className="text-sm text-muted-foreground">
              The interviewer will meet you there. After the interview, they&apos;ll submit your evaluation and you&apos;ll get your ProvenHire badge.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Opens meet.google.com. The interviewer will share their meeting link—refresh to see it when they add it.
              </p>
              <Button variant="outline" onClick={refreshSession} disabled={refreshingSession}>
                {refreshingSession ? "Checking..." : "Refresh for link"}
              </Button>
            </>
          )}
          <Button onClick={onReturnToDashboard} variant="outline" className="w-full">
            Return to dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (interviewers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Human Expert Interview</CardTitle>
          <CardDescription>
            No interviewers with availability right now. Check back in a few days or return to your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onReturnToDashboard} variant="outline">
            Return to dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book your Human Expert Interview</CardTitle>
        <CardDescription>
          Select an interviewer (5+ years experience) and time slot. Interviewers are matched to your track.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {interviewers.map((inv) => (
          <div key={inv.id} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-medium">{inv.name || "Expert Interviewer"}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {inv.domain && <Badge variant="secondary">{inv.domain}</Badge>}
                  {inv.experienceYears != null && (
                    <Badge variant="outline">{inv.experienceYears} yrs exp</Badge>
                  )}
                  {(inv.domains as string[])?.slice(0, 2).map((d) => (
                    <Badge key={d} variant="outline" className="text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {inv.slots.map((slot) => (
                <Button
                  key={slot.id}
                  variant="outline"
                  size="sm"
                  disabled={bookingSlotId !== null}
                  onClick={() => handleBook(slot.id)}
                >
                  {bookingSlotId === slot.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Calendar className="h-4 w-4 mr-1" />
                  )}
                  {formatSlot(slot.startsAt)}
                </Button>
              ))}
            </div>
          </div>
        ))}
        <Button variant="ghost" onClick={onReturnToDashboard} className="mt-4">
          Return to dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
