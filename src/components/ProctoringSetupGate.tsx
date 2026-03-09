import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Monitor, Video, Mic, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export type PermissionStatus = "pending" | "granted" | "denied" | "unsupported";

export interface ProctoringState {
  screenShare: PermissionStatus;
  camera: PermissionStatus;
  microphone: PermissionStatus;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  /** Microphone stream (may be same as camera when requested together) — pass to useSoundDetection to avoid duplicate prompts */
  microphoneStream: MediaStream | null;
}

interface ProctoringSetupGateProps {
  /** Test name for display (e.g. "Aptitude Test", "DSA Round") */
  testName: string;
  onReady: (state: ProctoringState) => void;
  /** When false, skip screen-share/screen-capture permission completely */
  enableScreenShare?: boolean;
  /** Optional: allow proceeding if screen share fails (e.g. unsupported browser) */
  screenShareOptional?: boolean;
  /** When true, show retry-friendly copy and try to re-use permissions (avoids repeated prompts) */
  isRetry?: boolean;
}

const ProctoringSetupGate = ({
  testName,
  onReady,
  enableScreenShare = true,
  screenShareOptional = false,
  isRetry = false,
}: ProctoringSetupGateProps) => {
  const [state, setState] = useState<ProctoringState>({
    screenShare: "pending",
    camera: "pending",
    microphone: "pending",
    screenStream: null,
    cameraStream: null,
    microphoneStream: null,
  });
  const [requesting, setRequesting] = useState<string | null>(null);
  const [skippedScreenShare, setSkippedScreenShare] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const supportsScreenShare =
    enableScreenShare &&
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

  /** Request camera + microphone in one call to avoid duplicate permission prompts */
  const requestCameraAndMic = async () => {
    setRequesting("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setState((s) => ({ ...s, camera: "granted", microphone: "granted", cameraStream: stream, microphoneStream: stream }));
    } catch (e) {
      setState((s) => ({ ...s, camera: "denied", microphone: "denied" }));
      toast.error("Camera and microphone access are required for proctoring.");
    } finally {
      setRequesting(null);
    }
  };

  const requestCamera = async () => {
    await requestCameraAndMic();
  };

  const requestMicrophone = async () => {
    await requestCameraAndMic();
  };

  const requestAll = async () => {
    if (supportsScreenShare) {
      await requestScreenShare();
    } else {
      setState((s) => ({ ...s, screenShare: "unsupported", screenStream: null }));
    }
    await requestCameraAndMic();
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
    (!enableScreenShare ||
      state.screenShare === "granted" ||
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
          {enableScreenShare && (
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
          )}

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

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Before starting, confirm the checklist</p>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>✓ Camera access required</p>
            <p>✓ Microphone access required</p>
            <p>✓ Fullscreen required</p>
            <p>✓ No tab switching allowed</p>
            {enableScreenShare && <p>✓ Screen sharing required</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Your camera and microphone activity will be monitored during this assessment to ensure fairness.
          </p>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="proctoring-consent"
              checked={consentAccepted}
              onCheckedChange={(checked) => setConsentAccepted(!!checked)}
            />
            <label htmlFor="proctoring-consent" className="text-sm leading-relaxed cursor-pointer">
              I agree and consent to proctoring for this assessment.
            </label>
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

        {/* Single "Enable & Start" button — one click triggers all prompts (screen, camera/mic, fullscreen) to avoid feeling like two separate flows */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {enableScreenShare && state.screenShare === "denied" && !screenShareOptional ? (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Screen share is required. Please try again or use a supported browser.</span>
            </div>
          ) : state.camera === "denied" || state.microphone === "denied" ? (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Camera and microphone are required. Please grant access and try again.</span>
            </div>
          ) : (
            <Button
              onClick={async () => {
                if (!consentAccepted) {
                  toast.error("Please accept the proctoring consent to continue.");
                  return;
                }
                setRequesting("all");
                try {
                  if (!canProceed) {
                    if (enableScreenShare && supportsScreenShare && state.screenShare !== "granted" && state.screenShare !== "unsupported") {
                      await requestScreenShare();
                    }
                    if (state.camera !== "granted" || state.microphone !== "granted") {
                      await requestCameraAndMic();
                    }
                  }
                  try {
                    await document.documentElement.requestFullscreen();
                  } catch {
                    // Fullscreen requires user gesture; if it fails, proceed anyway
                  }
                  handedOffRef.current = true;
                  onReady(state);
                } catch (e) {
                  // requestAll/requestScreenShare/requestCameraAndMic already show toasts
                } finally {
                  setRequesting(null);
                }
              }}
              disabled={!!requesting || !consentAccepted}
              className="bg-green-600 hover:bg-green-700"
            >
              {requesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Setting up…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {canProceed
                    ? (isRetry ? "Re-enable & Start" : "Enter fullscreen & Start") + ` ${testName}`
                    : (isRetry ? "Re-enable & Start" : "Enable proctoring & Start") + ` ${testName}`}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProctoringSetupGate;
