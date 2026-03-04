/**
 * Embedded Daily.co video call — local + remote participants.
 */
import { useEffect, useState } from "react";
import {
  DailyProvider,
  useDaily,
  useParticipantIds,
  DailyVideo,
  useDailyError,
} from "@daily-co/daily-react";
import { Button } from "@/components/ui/button";
import { Mic, Video, PhoneOff } from "lucide-react";

interface VideoCallInnerProps {
  onLeave?: () => void;
  isOwner?: boolean;
}

function VideoCallInner({ onLeave, isOwner }: VideoCallInnerProps) {
  const daily = useDaily();
  const error = useDailyError();
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!daily || joined) return;
    const state = daily.meetingState();
    if (state === "joined-meeting" || state === "joining-meeting") setJoined(true);
    else {
      daily.join()
        .then(() => setJoined(true))
        .catch((err) => console.error("[Daily join]", err));
    }
  }, [daily, joined]);
  const [permissionError, setPermissionError] = useState(false);
  const localId = useParticipantIds({ filter: "local" })[0];
  const remoteIds = useParticipantIds({ filter: "remote", sort: "joined-at" });

  useEffect(() => {
    if (!daily) return;
    const handleError = (e: { errorMsg?: string }) => {
      const msg = (e?.errorMsg ?? "").toLowerCase();
      if (msg.includes("permission") || msg.includes("camera") || msg.includes("microphone")) {
        setPermissionError(true);
      }
    };
    daily.on("error", handleError);
    return () => daily.off("error", handleError);
  }, [daily]);

  if (error) {
    const msg = String(error).toLowerCase();
    if (msg.includes("permission") || msg.includes("camera") || msg.includes("microphone")) {
      setPermissionError(true);
    }
  }

  if (permissionError) {
    return (
      <div className="rounded-xl border-2 border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="font-medium text-destructive">Please allow camera and microphone access in your browser</p>
        <p className="text-sm text-muted-foreground mt-2">Check your browser settings and refresh the page.</p>
      </div>
    );
  }

  const toggleCamera = () => daily?.setLocalVideo(!daily?.localVideo());
  const toggleMic = () => daily?.setLocalAudio(!daily?.localAudio());
  const leave = () => {
    daily?.leave();
    onLeave?.();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 aspect-video min-h-[240px] rounded-xl overflow-hidden bg-muted">
        {localId && (
          <div className="relative bg-muted rounded-lg overflow-hidden">
            <DailyVideo sessionId={localId} type="video" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span className="absolute bottom-2 left-2 text-xs bg-black/60 text-white px-2 py-1 rounded">
              You
            </span>
          </div>
        )}
        {remoteIds[0] ? (
          <div className="relative bg-muted rounded-lg overflow-hidden">
            <DailyVideo sessionId={remoteIds[0]} type="video" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span className="absolute bottom-2 left-2 text-xs bg-black/60 text-white px-2 py-1 rounded">
              Candidate
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-muted/80 rounded-lg">
            <p className="text-sm text-muted-foreground">
              {isOwner ? "Waiting for candidate to join..." : "Waiting for the interviewer to join..."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={toggleCamera} title="Toggle camera">
          <Video className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={toggleMic} title="Toggle microphone">
          <Mic className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" onClick={leave} title="Leave call">
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface VideoCallSectionProps {
  roomUrl: string;
  token?: string | null;
  isOwner?: boolean;
  onCreateRoom?: () => void;
}

export function VideoCallSection({ roomUrl, token, isOwner, onCreateRoom }: VideoCallSectionProps) {
  if (!roomUrl) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 text-center">
        <p className="text-muted-foreground">Video call is being set up...</p>
        {onCreateRoom && (
          <Button className="mt-4" onClick={onCreateRoom}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <DailyProvider
      url={roomUrl}
      token={token || undefined}
      joinConfig={{
        startVideoOff: false,
        startAudioOff: false,
      }}
    >
      <VideoCallInner isOwner={isOwner} />
    </DailyProvider>
  );
}
