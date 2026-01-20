import { AlertTriangle, Camera, Eye, Monitor, Shield, Video, User, Users, Mic, MicOff, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FaceVerificationResult } from "@/utils/faceDetection";

interface AudioDetectionResult {
  isVoiceDetected: boolean;
  averageVolume: number;
  peakVolume: number;
  timestamp: number;
}

interface AntiCheatOverlayProps {
  isFullScreen: boolean;
  webcamEnabled: boolean;
  tabSwitchCount: number;
  maxTabSwitches: number;
  isMonitoring: boolean;
  isRecording?: boolean;
  faceVerificationEnabled?: boolean;
  lastFaceVerification?: FaceVerificationResult | null;
  faceViolations?: number;
  audioMonitoringEnabled?: boolean;
  lastAudioDetection?: AudioDetectionResult | null;
  audioViolations?: number;
}

const AntiCheatOverlay = ({
  isFullScreen,
  webcamEnabled,
  tabSwitchCount,
  maxTabSwitches,
  isMonitoring,
  isRecording = false,
  faceVerificationEnabled = false,
  lastFaceVerification = null,
  faceViolations = 0,
  audioMonitoringEnabled = false,
  lastAudioDetection = null,
  audioViolations = 0,
}: AntiCheatOverlayProps) => {
  if (!isMonitoring) return null;

  const getFaceStatusColor = () => {
    if (!lastFaceVerification) return "secondary";
    if (lastFaceVerification.multipleFaces) return "destructive";
    if (!lastFaceVerification.faceDetected) return "destructive";
    if (lastFaceVerification.matchesBaseline === false) return "destructive";
    return "default";
  };

  const getFaceStatusText = () => {
    if (!lastFaceVerification) return "Checking...";
    if (lastFaceVerification.multipleFaces) return `${lastFaceVerification.faceCount} Faces!`;
    if (!lastFaceVerification.faceDetected) return "No Face";
    if (lastFaceVerification.matchesBaseline === false) return "Mismatch";
    if (lastFaceVerification.confidence) return `${Math.round(lastFaceVerification.confidence)}%`;
    return "Verified";
  };

  const getAudioStatusColor = () => {
    if (!audioMonitoringEnabled) return "secondary";
    if (lastAudioDetection?.isVoiceDetected) return "destructive";
    return "default";
  };

  const getAudioStatusText = () => {
    if (!audioMonitoringEnabled) return "Off";
    if (!lastAudioDetection) return "Listening...";
    if (lastAudioDetection.isVoiceDetected) return "Voice!";
    return "Silent";
  };

  // Calculate volume bar width (0-100%)
  const volumeLevel = lastAudioDetection ? Math.min(lastAudioDetection.peakVolume * 100, 100) : 0;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {/* Monitoring status badge */}
      <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-lg min-w-[220px]">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Proctoring Active</span>
        </div>

        <div className="space-y-2">
          {/* Fullscreen status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Fullscreen</span>
            </div>
            <Badge
              variant={isFullScreen ? "default" : "destructive"}
              className="text-xs"
            >
              {isFullScreen ? "On" : "Off"}
            </Badge>
          </div>

          {/* Webcam status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Webcam</span>
            </div>
            <Badge
              variant={webcamEnabled ? "default" : "secondary"}
              className="text-xs"
            >
              {webcamEnabled ? "Active" : "Off"}
            </Badge>
          </div>

          {/* Screen recording status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Screen Recording</span>
            </div>
            <Badge
              variant={isRecording ? "default" : "secondary"}
              className={cn("text-xs", isRecording && "animate-pulse bg-red-500")}
            >
              {isRecording ? "REC" : "Off"}
            </Badge>
          </div>

          {/* Audio monitoring status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {audioMonitoringEnabled ? (
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span>Audio Monitor</span>
            </div>
            <Badge
              variant={getAudioStatusColor()}
              className={cn("text-xs", lastAudioDetection?.isVoiceDetected && "animate-pulse")}
            >
              {getAudioStatusText()}
            </Badge>
          </div>

          {/* Audio level bar */}
          {audioMonitoringEnabled && (
            <div className="flex items-center gap-2">
              <Volume2 className="h-3 w-3 text-muted-foreground" />
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-100 rounded-full",
                    volumeLevel > 50 ? "bg-yellow-500" : "bg-green-500",
                    volumeLevel > 70 && "bg-red-500"
                  )}
                  style={{ width: `${volumeLevel}%` }}
                />
              </div>
            </div>
          )}

          {/* Face verification status */}
          {faceVerificationEnabled && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {lastFaceVerification?.multipleFaces ? (
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span>Face ID</span>
              </div>
              <Badge
                variant={getFaceStatusColor()}
                className="text-xs"
              >
                {getFaceStatusText()}
              </Badge>
            </div>
          )}

          {/* Tab switch counter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Tab Switches</span>
            </div>
            <Badge
              variant={tabSwitchCount > 0 ? "destructive" : "secondary"}
              className={cn("text-xs", tabSwitchCount >= maxTabSwitches && "animate-pulse")}
            >
              {tabSwitchCount}/{maxTabSwitches}
            </Badge>
          </div>
        </div>

        {/* Warning if violations occurred */}
        {(tabSwitchCount > 0 || faceViolations > 0 || audioViolations > 0) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {tabSwitchCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  {tabSwitchCount >= maxTabSwitches
                    ? "Max tab violations!"
                    : `${maxTabSwitches - tabSwitchCount} tab warnings left`}
                </span>
              </div>
            )}
            {faceViolations > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{faceViolations} face violation(s) logged</span>
              </div>
            )}
            {audioViolations > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{audioViolations} audio violation(s) logged</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Webcam preview (if enabled) */}
      {webcamEnabled && (
        <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg p-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground">Recording</span>
          </div>
          <div className="w-24 h-18 bg-muted rounded overflow-hidden relative">
            <video
              id="anti-cheat-webcam"
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Face verification indicator */}
            {faceVerificationEnabled && lastFaceVerification && (
              <div className={cn(
                "absolute bottom-1 left-1 right-1 text-center py-0.5 rounded text-[10px] font-medium",
                lastFaceVerification.matchesBaseline 
                  ? "bg-green-500/80 text-white" 
                  : lastFaceVerification.faceDetected 
                    ? "bg-yellow-500/80 text-white"
                    : "bg-red-500/80 text-white"
              )}>
                {lastFaceVerification.matchesBaseline 
                  ? "✓ Verified" 
                  : lastFaceVerification.faceDetected 
                    ? "⚠ Check"
                    : "✗ No Face"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screen recording indicator */}
      {isRecording && (
        <div className="bg-red-500/90 backdrop-blur-md text-white rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-medium">Screen Recording Active</span>
          </div>
        </div>
      )}

      {/* Audio monitoring indicator */}
      {audioMonitoringEnabled && (
        <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2">
            <Mic className={cn("h-4 w-4", lastAudioDetection?.isVoiceDetected ? "text-red-500 animate-pulse" : "text-green-500")} />
            <span className="text-xs font-medium">
              {lastAudioDetection?.isVoiceDetected ? "Voice Detected!" : "Audio Monitoring"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AntiCheatOverlay;