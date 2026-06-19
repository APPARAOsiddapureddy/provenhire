import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Monitor, Video, Mic, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import ProctoringNotice from "@/components/ProctoringNotice";

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
  /** Test name for display (e.g. "Cognitive Assessment", "DSA Round") */
  testName: string;
  onReady: (state: ProctoringState) => void;
  /** When false, skip screen-share/screen-capture permission completely */
  enableScreenShare?: boolean;
  /** Optional: allow proceeding if screen share fails (e.g. unsupported browser) */
  screenShareOptional?: boolean;
  /** When true, show retry-friendly copy and try to re-use permissions (avoids repeated prompts) */
  isRetry?: boolean;
  /** When true, skip proctoring setup entirely (e.g. all proctoring flags OFF for testing). Shows "Start Test" only. */
  skipSetup?: boolean;
  /** Require successful browser fullscreen before the assessment can begin. */
  requireFullscreen?: boolean;
}

const ProctoringSetupGate = ({
  testName,
  onReady,
  enableScreenShare = true,
  screenShareOptional = false,
  isRetry = false,
  skipSetup = false,
  requireFullscreen = true,
}: ProctoringSetupGateProps) => {
  const [state, setState] = useState<ProctoringState>({
    screenShare: "pending",
    camera: "pending",
    microphone: "pending",
    screenStream: null,
    cameraStream: null,
    microphoneStream: null,
  });
  const latestStateRef = useRef(state);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [skippedScreenShare, setSkippedScreenShare] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [cameraHealthy, setCameraHealthy] = useState(true);
  const [micHealthy, setMicHealthy] = useState(true);
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

  // Block "Start" if the camera stream is granted but not actually producing frames.
  useEffect(() => {
    if (state.camera !== "granted" || !state.cameraStream) {
      setCameraHealthy(true);
      return;
    }
    const stream = state.cameraStream;
    const track = stream.getVideoTracks?.()[0] ?? null;
    const trackLive = !!track && track.readyState === "live" && track.enabled !== false;
    let t: number | null = null;
    const check = () => {
      const v = videoRef.current;
      const metaOk = !!v && v.readyState >= 1 && (v.videoWidth ?? 0) > 0;
      setCameraHealthy(trackLive && metaOk);
    };
    t = window.setInterval(check, 600);
    check();
    return () => {
      if (t != null) window.clearInterval(t);
    };
  }, [state.camera, state.cameraStream]);

  useEffect(() => {
    if (state.microphone !== "granted" || !state.microphoneStream) {
      setMicHealthy(true);
      return;
    }
    const track = state.microphoneStream.getAudioTracks?.()[0] ?? null;
    setMicHealthy(!!track && track.readyState === "live" && track.enabled !== false);
  }, [state.microphone, state.microphoneStream]);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  latestStateRef.current = state;
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
    // Hard guard: some stages pass `enableScreenShare={false}`.
    // Even if retry/other effects call `requestAll()`, we must never trigger
    // the browser display-capture prompt when screen sharing is disabled.
    if (!enableScreenShare) {
      const next = { ...latestStateRef.current, screenShare: "unsupported" as const, screenStream: null };
      latestStateRef.current = next;
      setState(next);
      return;
    }
    if (!supportsScreenShare) {
      const next = { ...latestStateRef.current, screenShare: "unsupported" as const };
      latestStateRef.current = next;
      setState(next);
      return;
    }
    setRequesting("screen");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setState((s) => {
          s.screenStream?.getTracks().forEach((t) => t.stop());
          const next = { ...s, screenShare: "pending" as const, screenStream: null };
          latestStateRef.current = next;
          return next;
        });
      });
      const next = { ...latestStateRef.current, screenShare: "granted" as const, screenStream: stream };
      latestStateRef.current = next;
      setState(next);
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
      const next = {
        ...latestStateRef.current,
        camera: "granted" as const,
        microphone: "granted" as const,
        cameraStream: stream,
        microphoneStream: stream,
      };
      latestStateRef.current = next;
      setState(next);
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
    cameraHealthy &&
    micHealthy &&
    (!enableScreenShare ||
      state.screenShare === "granted" ||
      state.screenShare === "unsupported" ||
      (screenShareOptional && (state.screenShare === "denied" || skippedScreenShare)));

  const handleSkipScreenShare = () => {
    if (screenShareOptional) {
      setSkippedScreenShare(true);
    }
  };

  const enterFullscreenOrBlock = async () => {
    if (!requireFullscreen || typeof document === "undefined" || document.fullscreenElement) return true;
    try {
      await document.documentElement.requestFullscreen();
      return !!document.fullscreenElement;
    } catch {
      toast.error("Fullscreen is required before starting this assessment. Please allow fullscreen and try again.");
      return false;
    }
  };

  const StatusIcon = ({ status }: { status: PermissionStatus }) => {
    if (status === "granted") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === "denied" || status === "unsupported") return <XCircle className="h-5 w-5 text-red-500" />;
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  };

  if (skipSetup) {
    const bypassState: ProctoringState = {
      screenShare: "unsupported",
      camera: "unsupported",
      microphone: "unsupported",
      screenStream: null,
      cameraStream: null,
      microphoneStream: null,
    };
    return (
      <Card className="workspace-proctor-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--dash-gold-dim)] p-3">
              <Shield className="h-6 w-6 text-[var(--dash-gold)]" />
            </div>
            <div>
              <CardTitle className="text-[var(--dash-text-primary)]">Start {testName}</CardTitle>
              <CardDescription className="text-[var(--dash-text-secondary)]">
                Proctoring is disabled for testing. Click below to begin the assessment.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProctoringNotice />
          <Button
            onClick={async () => {
              const fullscreenReady = await enterFullscreenOrBlock();
              if (!fullscreenReady) return;
              onReady(bypassState);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Start {testName}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="workspace-proctor-card">
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-[var(--dash-gold-dim)] p-3">
            <Shield className="h-6 w-6 text-[var(--dash-gold)]" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-[var(--dash-text-primary)]">{isRetry ? "Re-enable proctoring" : "Proctoring setup required"}</CardTitle>
            <CardDescription className="text-[var(--dash-text-secondary)]">
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
            <div className="workspace-proctor-row">
              <div className="workspace-proctor-copy">
                <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dash-gold)]" />
                <div className="min-w-0">
                  <p className="font-medium text-[var(--dash-text-primary)]">Screen sharing</p>
                  <p className="text-sm text-[var(--dash-text-muted)]">
                    Share your screen so we can monitor your activity during the test
                  </p>
                </div>
              </div>
              <div className="workspace-proctor-actions">
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
          <div className="workspace-proctor-row">
            <div className="workspace-proctor-copy">
              <Video className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dash-gold)]" />
              <div className="min-w-0">
                <p className="font-medium text-[var(--dash-text-primary)]">Camera</p>
                <p className="text-sm text-[var(--dash-text-muted)]">
                  Enable your webcam for face verification and proctoring
                </p>
                {state.camera === "granted" && !cameraHealthy && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Camera is not streaming correctly. Please retry.
                  </p>
                )}
              </div>
            </div>
            <div className="workspace-proctor-actions">
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
              {state.camera === "granted" && !cameraHealthy && (
                <Button size="sm" variant="outline" onClick={requestCameraAndMic} disabled={!!requesting}>
                  Retry
                </Button>
              )}
            </div>
          </div>

          {/* Microphone */}
          <div className="workspace-proctor-row">
            <div className="workspace-proctor-copy">
              <Mic className="mt-0.5 h-5 w-5 shrink-0 text-[var(--dash-gold)]" />
              <div className="min-w-0">
                <p className="font-medium text-[var(--dash-text-primary)]">Microphone</p>
                <p className="text-sm text-[var(--dash-text-muted)]">
                  Enable your microphone for audio monitoring during the test
                </p>
                {state.microphone === "granted" && !micHealthy && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Microphone looks inactive. Please retry.
                  </p>
                )}
              </div>
            </div>
            <div className="workspace-proctor-actions">
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
              {state.microphone === "granted" && !micHealthy && (
                <Button size="sm" variant="outline" onClick={requestCameraAndMic} disabled={!!requesting}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>

        <ProctoringNotice />

        <div className="workspace-proctor-checklist space-y-3">
          <p className="text-sm font-semibold text-[var(--dash-text-primary)]">Before starting, confirm the checklist</p>
          <div className="grid gap-2 text-sm text-[var(--dash-text-muted)]">
            <p>✓ Camera access required</p>
            <p>✓ Microphone access required</p>
            <p>✓ Fullscreen required</p>
            <p>✓ No tab switching allowed</p>
            {enableScreenShare && <p>✓ Screen sharing required</p>}
          </div>
          <p className="text-xs text-[var(--dash-text-muted)]">
            Your camera and microphone activity will be monitored during this assessment to ensure fairness.
          </p>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="proctoring-consent"
              checked={consentAccepted}
              onCheckedChange={(checked) => setConsentAccepted(!!checked)}
            />
            <label htmlFor="proctoring-consent" className="cursor-pointer text-sm leading-relaxed text-[var(--dash-text-secondary)]">
              I agree and consent to proctoring for this assessment.
            </label>
          </div>
        </div>

        {/* Camera preview when granted */}
        {state.camera === "granted" && (
          <div className="overflow-hidden rounded-lg border border-[var(--dash-navy-border)] bg-black/30">
            <p className="bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--dash-text-secondary)]">Camera preview (you are being monitored)</p>
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
                  const fullscreenReady = await enterFullscreenOrBlock();
                  if (!fullscreenReady) return;
                  handedOffRef.current = true;
                  onReady(latestStateRef.current);
                } catch (e) {
                  // requestAll/requestScreenShare/requestCameraAndMic already show toasts
                } finally {
                  setRequesting(null);
                }
              }}
              disabled={!!requesting || !consentAccepted}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
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
