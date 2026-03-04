import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, User, Loader2, CheckCircle, Video } from "lucide-react";
import { toast } from "sonner";
import { VideoCallSection } from "@/components/interview/VideoCallSection";

interface HumanExpertInterviewStageProps {
  onComplete: () => void;
  onReturnToDashboard: () => void;
}

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
  const [interviewers, setInterviewers] = useState<MatchedInterviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookedSession, setBookedSession] = useState<{ scheduledAt: string; meetingLink?: string | null } | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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
      setBookedSession({ scheduledAt: res.session?.scheduledAt ?? "" });
      toast.success("Slot booked! Attend the interview at the scheduled time.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to book slot");
    } finally {
      setBookingSlotId(null);
    }
  };

  const handleJoinInterview = async () => {
    setJoining(true);
    try {
      const res = await api.get<{ token: string; roomUrl: string }>("/api/verification/human-interview-session/room-token");
      setRoomUrl(res.roomUrl);
      setRoomToken(res.token);
      setJoinModalOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "Unable to join. The interviewer may not have started the room yet.");
    } finally {
      setJoining(false);
    }
  };

  const formatSlot = (d: string) =>
    new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (bookedSession) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Interview scheduled
            </CardTitle>
            <CardDescription>
              Your human expert interview is scheduled for {formatSlot(bookedSession.scheduledAt)}.
              Attend on time to complete this stage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleJoinInterview} disabled={joining}>
              <Video className="h-4 w-4 mr-2" />
              {joining ? "Joining..." : "Join Interview"}
            </Button>
            <Button onClick={onReturnToDashboard} variant="outline">
              Return to dashboard
            </Button>
          </CardContent>
        </Card>

        <Dialog open={joinModalOpen} onOpenChange={setJoinModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Video Interview</DialogTitle>
              <DialogDescription>
                Camera and microphone access required. Allow when prompted.
              </DialogDescription>
            </DialogHeader>
            {roomUrl && (
              <VideoCallSection
                roomUrl={roomUrl}
                token={roomToken}
                isOwner={false}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
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
          Select an interviewer and time slot. Technical interviewers are matched to your profile.
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
