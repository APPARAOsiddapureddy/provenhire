import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { loadFaceDetectionModels, getFaceDescriptor, verifyFace, FaceVerificationResult } from "@/utils/faceDetection";
import { api } from "@/lib/api";
import { sendHighRiskAlertNotification } from "@/utils/recordingUpload";
interface AudioDetectionResult {
  isVoiceDetected: boolean;
  averageVolume: number;
  peakVolume: number;
  timestamp: number;
}

interface AntiCheatState {
  isFullScreen: boolean;
  tabSwitchCount: number;
  isTestActive: boolean;
  violations: string[];
  webcamSnapshot: string | null;
  webcamEnabled: boolean;
  // Screen recording state
  isRecording: boolean;
  recordingBlob: Blob | null;
  // Face verification state
  faceVerificationEnabled: boolean;
  baselineFaceDescriptor: Float32Array | null;
  lastFaceVerification: FaceVerificationResult | null;
  faceViolations: number;
  // Audio monitoring state
  audioMonitoringEnabled: boolean;
  lastAudioDetection: AudioDetectionResult | null;
  audioViolations: number;
  voiceDetectedCount: number;
}

interface UseAntiCheatOptions {
  maxTabSwitches?: number;
  enableWebcam?: boolean;
  enableScreenRecording?: boolean;
  enableFaceVerification?: boolean;
  enableAudioMonitoring?: boolean;
  faceCheckInterval?: number; // in milliseconds
  audioCheckInterval?: number; // in milliseconds
  voiceThreshold?: number; // 0-1 scale
  userId?: string; // User ID for logging alerts
  testId?: string; // Test ID for logging alerts
  testType?: 'aptitude' | 'dsa'; // Test type for logging alerts
  onViolation?: (type: string, count: number) => void;
  onMaxViolations?: () => void;
  onFaceViolation?: (result: FaceVerificationResult) => void;
  onAudioViolation?: (result: AudioDetectionResult) => void;
}

export const useAntiCheat = (options: UseAntiCheatOptions = {}) => {
  const {
    maxTabSwitches = 3,
    enableWebcam = true,
    enableScreenRecording = true,
    enableFaceVerification = true,
    enableAudioMonitoring = true,
    faceCheckInterval = 15000, // Check every 15 seconds
    audioCheckInterval = 2000, // Check every 2 seconds
    voiceThreshold = 0.15, // Threshold for voice detection
    userId,
    testId,
    testType = 'aptitude',
    onViolation,
    onMaxViolations,
    onFaceViolation,
    onAudioViolation,
  } = options;

  // Function to log alert to database and send email for high-risk
  const logProctoringAlert = useCallback(async (
    alertType: string,
    message: string,
    severity: 'low' | 'medium' | 'high',
    violationDetails?: Record<string, unknown>
  ) => {
    if (!userId || !testId) return;

    try {
      await api.post("/api/proctoring/alerts", {
        userId,
        testId,
        testType,
        alertType,
        severity,
        message,
        violationDetails: violationDetails ? JSON.parse(JSON.stringify(violationDetails)) : null,
      });

      // Send email notification for high-risk alerts
      if (severity === 'high') {
        await sendHighRiskAlertNotification(
          alertType,
          testType,
          userId,
          message,
          violationDetails
        );
      }
    } catch (error) {
      console.error('Error logging proctoring alert:', error);
    }
  }, [userId, testId, testType]);

  const [state, setState] = useState<AntiCheatState>({
    isFullScreen: false,
    tabSwitchCount: 0,
    isTestActive: false,
    violations: [],
    webcamSnapshot: null,
    webcamEnabled: false,
    isRecording: false,
    recordingBlob: null,
    faceVerificationEnabled: false,
    baselineFaceDescriptor: null,
    lastFaceVerification: null,
    faceViolations: 0,
    audioMonitoringEnabled: false,
    lastAudioDetection: null,
    audioViolations: 0,
    voiceDetectedCount: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  // Audio monitoring refs
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request fullscreen
  const requestFullScreen = useCallback(async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      setState(prev => ({ ...prev, isFullScreen: true }));
      return true;
    } catch (error) {
      console.error("Fullscreen request failed:", error);
      toast.error("Please allow fullscreen mode for the test");
      return false;
    }
  }, []);

  // Exit fullscreen
  const exitFullScreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
    setState(prev => ({ ...prev, isFullScreen: false }));
  }, []);

  // Initialize webcam
  const initWebcam = useCallback(async () => {
    if (!enableWebcam) return false;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false 
      });
      streamRef.current = stream;
      
      // Create a video element for face detection
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      webcamVideoRef.current = video;
      
      setState(prev => ({ ...prev, webcamEnabled: true }));
      return true;
    } catch (error) {
      console.error("Webcam access failed:", error);
      toast.warning("Webcam access is recommended for test integrity");
      return false;
    }
  }, [enableWebcam]);

  // Start screen recording
  const startScreenRecording = useCallback(async () => {
    if (!enableScreenRecording) return false;
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 10, max: 15 },
        },
        audio: false,
      });
      
      screenStreamRef.current = stream;
      recordedChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 1000000, // 1 Mbps
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setState(prev => ({ ...prev, recordingBlob: blob, isRecording: false }));
      };
      
      // Handle when user stops sharing
      stream.getVideoTracks()[0].onended = () => {
        stopScreenRecording();
        toast.warning("Screen sharing stopped. This has been logged.");
        if (onViolation) {
          onViolation('screen_share_stopped', 1);
        }
      };
      
      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      
      setState(prev => ({ ...prev, isRecording: true }));
      return true;
    } catch (error) {
      console.error("Screen recording failed:", error);
      toast.warning("Screen recording could not be started");
      return false;
    }
  }, [enableScreenRecording, onViolation]);

  // Stop screen recording
  const stopScreenRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
  }, []);

  // Initialize face verification
  const initFaceVerification = useCallback(async () => {
    if (!enableFaceVerification) return false;
    
    try {
      const loaded = await loadFaceDetectionModels();
      if (!loaded) {
        console.warn("Face detection models could not be loaded");
        return false;
      }
      
      setState(prev => ({ ...prev, faceVerificationEnabled: true }));
      return true;
    } catch (error) {
      console.error("Face verification init failed:", error);
      return false;
    }
  }, [enableFaceVerification]);

  // Capture baseline face
  const captureBaselineFace = useCallback(async () => {
    if (!webcamVideoRef.current) {
      console.warn("Webcam video not available for baseline capture");
      return null;
    }
    
    try {
      const descriptor = await getFaceDescriptor(webcamVideoRef.current);
      if (descriptor) {
        setState(prev => ({ ...prev, baselineFaceDescriptor: descriptor }));
        toast.success("Face baseline captured successfully");
        return descriptor;
      } else {
        toast.warning("No face detected for baseline. Please ensure your face is visible.");
        return null;
      }
    } catch (error) {
      console.error("Baseline face capture failed:", error);
      return null;
    }
  }, []);

  // Verify current face against baseline
  const verifyCurrentFace = useCallback(async () => {
    if (!webcamVideoRef.current || !state.baselineFaceDescriptor) {
      return null;
    }
    
    try {
      const result = await verifyFace(webcamVideoRef.current, state.baselineFaceDescriptor);
      setState(prev => ({ ...prev, lastFaceVerification: result }));
      
      // Check for violations
      if (result.multipleFaces) {
        setState(prev => ({
          ...prev,
          faceViolations: prev.faceViolations + 1,
          violations: [...prev.violations, `Multiple faces detected at ${new Date().toLocaleTimeString()}`],
        }));
        toast.warning("Multiple faces detected! This has been flagged.");
        // Log high-risk alert
        await logProctoringAlert(
          'face_violation',
          'Multiple faces detected during test',
          'high',
          { type: 'multiple_faces', faceCount: result.multipleFaces }
        );
        if (onFaceViolation) onFaceViolation(result);
      } else if (!result.faceDetected) {
        setState(prev => ({
          ...prev,
          faceViolations: prev.faceViolations + 1,
          violations: [...prev.violations, `No face detected at ${new Date().toLocaleTimeString()}`],
        }));
        toast.warning("No face detected! Please stay in front of the camera.");
        // Log medium-risk alert
        await logProctoringAlert(
          'face_violation',
          'No face detected during test',
          'medium',
          { type: 'no_face' }
        );
        if (onFaceViolation) onFaceViolation(result);
      } else if (result.matchesBaseline === false) {
        setState(prev => ({
          ...prev,
          faceViolations: prev.faceViolations + 1,
          violations: [...prev.violations, `Different person detected at ${new Date().toLocaleTimeString()}`],
        }));
        toast.error("Face does not match! This is a serious violation.");
        // Log high-risk alert - different person
        await logProctoringAlert(
          'face_violation',
          'Different person detected - possible identity fraud',
          'high',
          { type: 'face_mismatch', confidence: result.confidence }
        );
        if (onFaceViolation) onFaceViolation(result);
      }
      
      return result;
    } catch (error) {
      console.error("Face verification failed:", error);
      return null;
    }
  }, [state.baselineFaceDescriptor, onFaceViolation]);

  // Start periodic face checking
  const startFaceChecking = useCallback(() => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
    }
    
    faceCheckIntervalRef.current = setInterval(() => {
      verifyCurrentFace();
    }, faceCheckInterval);
  }, [faceCheckInterval, verifyCurrentFace]);

  // Stop face checking
  const stopFaceChecking = useCallback(() => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
      faceCheckIntervalRef.current = null;
    }
  }, []);

  // Initialize audio monitoring
  const initAudioMonitoring = useCallback(async () => {
    if (!enableAudioMonitoring) return false;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setState(prev => ({ ...prev, audioMonitoringEnabled: true }));
      return true;
    } catch (error) {
      console.error("Audio monitoring init failed:", error);
      return false;
    }
  }, [enableAudioMonitoring]);

  // Analyze audio for voice detection
  const analyzeAudio = useCallback((): AudioDetectionResult | null => {
    if (!analyserRef.current) return null;
    
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    const sum = dataArray.reduce((acc, val) => acc + val, 0);
    const averageVolume = sum / dataArray.length / 255;
    
    // Find peak volume
    const peakVolume = Math.max(...dataArray) / 255;
    
    // Voice detection - check mid frequencies (human voice range ~85Hz-255Hz)
    // With 256 fftSize at 44.1kHz, each bin is ~172Hz
    const voiceRangeStart = 0;
    const voiceRangeEnd = Math.min(20, dataArray.length);
    let voiceSum = 0;
    for (let i = voiceRangeStart; i < voiceRangeEnd; i++) {
      voiceSum += dataArray[i];
    }
    const voiceAverage = voiceSum / (voiceRangeEnd - voiceRangeStart) / 255;
    
    const isVoiceDetected = voiceAverage > voiceThreshold && peakVolume > 0.3;
    
    return {
      isVoiceDetected,
      averageVolume,
      peakVolume,
      timestamp: Date.now(),
    };
  }, [voiceThreshold]);

  // Check for audio violations
  const checkAudioViolation = useCallback(() => {
    const result = analyzeAudio();
    if (!result) return;
    
    setState(prev => {
      const newState = { ...prev, lastAudioDetection: result };
      
      if (result.isVoiceDetected) {
        const newVoiceCount = prev.voiceDetectedCount + 1;
        newState.voiceDetectedCount = newVoiceCount;
        
        // Only flag as violation after multiple consecutive detections
        if (newVoiceCount >= 3) {
          newState.audioViolations = prev.audioViolations + 1;
          newState.violations = [
            ...prev.violations,
            `Voice/speech detected at ${new Date().toLocaleTimeString()}`
          ];
          newState.voiceDetectedCount = 0;
          
          toast.warning("Voice detected! This has been flagged.");
          // Log audio violation alert
          logProctoringAlert(
            'audio_violation',
            'Voice/speech detected during test - possible communication with external party',
            newState.audioViolations >= 3 ? 'high' : 'medium',
            { voiceCount: newState.audioViolations, peakVolume: result.peakVolume }
          );
          if (onAudioViolation) onAudioViolation(result);
          if (onViolation) onViolation('voice_detected', newState.audioViolations);
        }
      } else {
        newState.voiceDetectedCount = 0;
      }
      
      return newState;
    });
  }, [analyzeAudio, onAudioViolation, onViolation, logProctoringAlert]);

  // Start audio monitoring
  const startAudioMonitoring = useCallback(() => {
    if (audioCheckIntervalRef.current) {
      clearInterval(audioCheckIntervalRef.current);
    }
    
    audioCheckIntervalRef.current = setInterval(() => {
      checkAudioViolation();
    }, audioCheckInterval);
  }, [audioCheckInterval, checkAudioViolation]);

  // Stop audio monitoring
  const stopAudioMonitoring = useCallback(() => {
    if (audioCheckIntervalRef.current) {
      clearInterval(audioCheckIntervalRef.current);
      audioCheckIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    analyserRef.current = null;
    setState(prev => ({ ...prev, audioMonitoringEnabled: false }));
  }, []);

  // Capture webcam snapshot
  const captureSnapshot = useCallback(async (): Promise<string | null> => {
    if (!streamRef.current) return null;

    try {
      const video = document.createElement('video');
      video.srcObject = streamRef.current;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const snapshot = canvas.toDataURL('image/jpeg', 0.7);
        video.pause();
        video.srcObject = null;
        
        setState(prev => ({ ...prev, webcamSnapshot: snapshot }));
        return snapshot;
      }
      return null;
    } catch (error) {
      console.error("Failed to capture snapshot:", error);
      return null;
    }
  }, []);

  // Stop webcam
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
      webcamVideoRef.current = null;
    }
    setState(prev => ({ ...prev, webcamEnabled: false }));
  }, []);

  // Get recording blob
  const getRecordingBlob = useCallback(() => {
    return state.recordingBlob;
  }, [state.recordingBlob]);

  // Start test monitoring
  const startMonitoring = useCallback(async () => {
    const fullscreenSuccess = await requestFullScreen();
    const webcamSuccess = await initWebcam();
    const faceVerificationSuccess = enableFaceVerification ? await initFaceVerification() : false;
    
    // Start screen recording
    let screenRecordingSuccess = false;
    if (enableScreenRecording) {
      screenRecordingSuccess = await startScreenRecording();
    }
    
    // Start audio monitoring
    let audioMonitoringSuccess = false;
    if (enableAudioMonitoring) {
      audioMonitoringSuccess = await initAudioMonitoring();
      if (audioMonitoringSuccess) {
        startAudioMonitoring();
      }
    }
    
    // Capture baseline face
    if (webcamSuccess && faceVerificationSuccess) {
      // Wait a bit for the camera to stabilize
      setTimeout(async () => {
        await captureBaselineFace();
        // Start periodic face checking after baseline is captured
        startFaceChecking();
      }, 2000);
    }
    
    // Capture initial snapshot
    if (webcamSuccess) {
      setTimeout(() => captureSnapshot(), 1000);
    }

    setState(prev => ({ 
      ...prev, 
      isTestActive: true,
      tabSwitchCount: 0,
      violations: [],
      faceViolations: 0,
      audioViolations: 0,
      voiceDetectedCount: 0,
    }));

    return { 
      fullscreenSuccess, 
      webcamSuccess, 
      screenRecordingSuccess,
      faceVerificationSuccess,
      audioMonitoringSuccess,
    };
  }, [
    requestFullScreen, 
    initWebcam, 
    captureSnapshot, 
    enableScreenRecording, 
    startScreenRecording,
    enableFaceVerification,
    initFaceVerification,
    captureBaselineFace,
    startFaceChecking,
    enableAudioMonitoring,
    initAudioMonitoring,
    startAudioMonitoring,
  ]);

  // Stop test monitoring
  const stopMonitoring = useCallback(() => {
    exitFullScreen();
    stopWebcam();
    stopScreenRecording();
    stopFaceChecking();
    stopAudioMonitoring();
    setState(prev => ({ ...prev, isTestActive: false }));
  }, [exitFullScreen, stopWebcam, stopScreenRecording, stopFaceChecking, stopAudioMonitoring]);

  // Handle visibility change (tab switch)
  useEffect(() => {
    if (!state.isTestActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setState(prev => {
          const newCount = prev.tabSwitchCount + 1;
          const violation = `Tab switch detected at ${new Date().toLocaleTimeString()}`;
          
          if (onViolation) {
            onViolation('tab_switch', newCount);
          }

          // Log tab switch alert - high risk if approaching max
          logProctoringAlert(
            'tab_switch',
            `Tab switch detected (${newCount}/${maxTabSwitches})`,
            newCount >= maxTabSwitches - 1 ? 'high' : 'medium',
            { switchCount: newCount, maxAllowed: maxTabSwitches }
          );

          if (newCount >= maxTabSwitches && onMaxViolations) {
            onMaxViolations();
          }

          toast.warning(`Warning: Tab switch detected (${newCount}/${maxTabSwitches})`);
          
          return {
            ...prev,
            tabSwitchCount: newCount,
            violations: [...prev.violations, violation],
          };
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isTestActive, maxTabSwitches, onViolation, onMaxViolations, logProctoringAlert]);

  // Handle fullscreen change
  useEffect(() => {
    if (!state.isTestActive) return;

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement || 
                               !!(document as any).webkitFullscreenElement ||
                               !!(document as any).msFullscreenElement;
      
      if (!isNowFullscreen && state.isTestActive) {
        toast.warning("Please stay in fullscreen mode during the test");
        
        setState(prev => ({
          ...prev,
          isFullScreen: false,
          violations: [...prev.violations, `Exited fullscreen at ${new Date().toLocaleTimeString()}`],
        }));

        if (onViolation) {
          onViolation('exit_fullscreen', 1);
        }
      } else {
        setState(prev => ({ ...prev, isFullScreen: isNowFullscreen }));
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [state.isTestActive, onViolation]);

  // Prevent right-click during test
  useEffect(() => {
    if (!state.isTestActive) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.warning("Right-click is disabled during the test");
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [state.isTestActive]);

  // Prevent keyboard shortcuts during test
  useEffect(() => {
    if (!state.isTestActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent common shortcuts
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'p')) ||
        (e.altKey && e.key === 'Tab') ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I')
      ) {
        e.preventDefault();
        toast.warning("This keyboard shortcut is disabled during the test");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isTestActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFaceChecking();
      stopAudioMonitoring();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [stopFaceChecking, stopAudioMonitoring]);

  return {
    ...state,
    requestFullScreen,
    exitFullScreen,
    initWebcam,
    captureSnapshot,
    stopWebcam,
    startMonitoring,
    stopMonitoring,
    // Screen recording
    startScreenRecording,
    stopScreenRecording,
    getRecordingBlob,
    // Face verification
    initFaceVerification,
    captureBaselineFace,
    verifyCurrentFace,
    startFaceChecking,
    stopFaceChecking,
    // Audio monitoring
    initAudioMonitoring,
    startAudioMonitoring,
    stopAudioMonitoring,
    analyzeAudio,
  };
};

export default useAntiCheat;
