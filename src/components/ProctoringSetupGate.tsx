import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Monitor, Video, Mic, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export type PermissionStatus = "pending" | "granted" | "denied" | "unsupported";

export interface ProctoringState {
  screenShare: PermissionStatus;
  camera: PermissionStatus;
  microphone: PermissionStatus;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
}

interface ProctoringSetupGateProps {
  /** Test name for display (e.g. "Aptitude Test", "DSA Round") */
  testName: string;
  onReady: (state: ProctoringState) => void;
  /** Optional: allow proceeding if screen share fails (e.g. unsupported browser) */
  screenShareOptional?: boolean;
  /** When true, show retry-friendly copy and try to re-use permissions (avoids repeated prompts) */
  isRetry?: boolean;
}

const ProctoringSetupGate = ({
  testName,
  onReady,
  screenShareOptional = false,
  isRetry = false,
}: ProctoringSetupGateProps) => {
  const [state, setState] = useState<ProctoringState>({
    screenShare: "pending",
    camera: "pending",
    microphone: "pending",
    screenStream: null,
    cameraStream: null,
  });
  const [requesting, setRequesting] = useState<string | null>(null);
  const [skippedScreenShare, setSkippedScreenShare] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const supportsScreenShare =
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    "getDisplayMedia" in navigator.mediaDevices;

  useEffect(() => {
    if (state.camera === "granted" && state.cameraStream && videoRef.current) {
      videoRef.current.srcObject = state.cameraStream;
    }
  }, [state.camera, state.cameraStream]);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  screenStreamRef.current = state.screenStream;
  cameraStreamRef.current = state.cameraStream;

  useEffect(() => {
    return () => {
      if (!handedOffRef.current) {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const requestScreenShare = async () => {
    if (!supportsScreenShare) {
      setState((s) => ({ ...s, screenShare: "unsupported" }));
      return;
    }
    setRequesting("screen");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setState((s) => {
          s.screenStream?.getTracks().forEach((t) => t.stop());
          return { ...s, screenShare: "pending", screenStream: null };
        });
      });
      setState((s) => ({ ...s, screenShare: "granted", screenStream: stream }));
    } catch (e) {
      setState((s) => ({ ...s, screenShare: "denied" }));
      toast.error("Screen share is required for proctoring. Please try again.");
    } finally {
      setRequesting(null);
    }
  };

  const requestCamera = async () => {
    setRequesting("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setState((s) => ({ ...s, camera: "granted", cameraStream: stream }));
    } catch (e) {
      setState((s) => ({ ...s, camera: "denied" }));
      toast.error("Camera access is required for proctoring.");
    } finally {
      setRequesting(null);
    }
  };

  const requestMicrophone = async () => {
    setRequesting("mic");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setState((s) => ({ ...s, microphone: "granted" }));
    } catch (e) {
      setState((s) => ({ ...s, microphone: "denied" }));
      toast.error("Microphone access is required for proctoring.");
    } finally {
      setRequesting(null);
    }
  };

  const requestAll = async () => {
    if (supportsScreenShare) {
      await requestScreenShare();
    } else {
      setState((s) => ({ ...s, screenShare: "unsupported" }));
    }
    await requestCamera();
    await requestMicrophone();
  };

  // On retry, auto-request permissions so browser may reuse recently granted access (avoids repeated prompts)
  useEffect(() => {
    if (isRetry && (state.camera === "pending" || state.microphone === "pending")) {
      requestAll();
    }
  }, [isRetry]);

  const canProceed =
    state.camera === "granted" &&
    state.microphone === "granted" &&
    (state.screenShare === "granted" ||
      state.screenShare === "unsupported" ||
      (screenShareOptional && (state.screenShare === "denied" || skippedScreenShare)));

  const handleSkipScreenShare = () => {
    if (screenShareOptional) {
      setSkippedScreenShare(true);
    }
  };

  const StatusIcon = ({ status }: { status: PermissionStatus }) => {
    if (status === "granted") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === "denied" || status === "unsupported") return <XCircle className="h-5 w-5 text-red-500" />;
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  };

  return (
    <Card className="border-2 border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>{isRetry ? "Re-enable proctoring" : "Proctoring setup required"}</CardTitle>
            <CardDescription>
              {isRetry
                ? `You're retrying the ${testName}. Click "Re-enable & Start" below — camera and mic may not prompt again if you recently granted access.`
                : `To ensure a fair assessment, please grant the following permissions before starting the ${testName}. Your session will be monitored throughout the test.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {/* Screen Share */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Screen sharing</p>
                <p className="text-sm text-muted-foreground">
                  Share your screen so we can monitor your activity during the test
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusIcon status={state.screenShare} />
              {state.screenShare === "pending" && supportsScreenShare && (
                <Button
                  size="sm"
                  onClick={requestScreenShare}
                  disabled={!!requesting}
                >
                  {requesting === "screen" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
                </Button>
              )}
              {state.screenShare === "unsupported" && (
                <span className="text-xs text-muted-foreground">Not supported</span>
              )}
              {state.screenShare === "denied" && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={requestScreenShare} disabled={!!requesting}>
                    {requesting === "screen" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Allow screen share"}
                  </Button>
                  {screenShareOptional && (
                    <Button size="sm" variant="outline" onClick={handleSkipScreenShare}>
                      Skip
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Camera */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Camera</p>
                <p className="text-sm text-muted-foreground">
                  Enable your webcam for face verification and proctoring
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusIcon status={state.camera} />
              {state.camera === "pending" && (
                <Button
                  size="sm"
                  onClick={requestCamera}
                  disabled={!!requesting}
                >
                  {requesting === "camera" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
                </Button>
              )}
            </div>
          </div>

          {/* Microphone */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Mic className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Microphone</p>
                <p className="text-sm text-muted-foreground">
                  Enable your microphone for audio monitoring during the test
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusIcon status={state.microphone} />
              {state.microphone === "pending" && (
                <Button
                  size="sm"
                  onClick={requestMicrophone}
                  disabled={!!requesting}
                >
                  {requesting === "mic" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Camera preview when granted */}
        {state.camera === "granted" && (
          <div className="rounded-lg border-2 border-primary/20 overflow-hidden bg-muted">
            <p className="text-xs font-medium px-3 py-2 bg-primary/5">Camera preview (you are being monitored)</p>
            <div className="aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Grant all / Start test */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {state.camera === "pending" || state.microphone === "pending" ? (
            <Button onClick={requestAll} disabled={!!requesting}>
              {requesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              Grant all permissions
            </Button>
          ) : canProceed ? (
            <Button
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen();
                } catch {
                  // Fullscreen requires user gesture - we have it here; if it fails, proceed anyway
                }
                handedOffRef.current = true;
                onReady(state);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {isRetry ? "Re-enable & Start" : "All set — Start"} {testName}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>
                {state.camera === "denied" || state.microphone === "denied"
                  ? "Camera and microphone are required. Please grant access and try again."
                  : "Please grant all permissions to proceed."}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProctoringSetupGate;
