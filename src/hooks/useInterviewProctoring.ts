import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ProctoringState {
  tabSwitchCount: number;
  faceDetectionErrors: number;
  isPageVisible: boolean;
  violations: ProctoringViolation[];
  isMonitoring: boolean;
}

export interface ProctoringViolation {
  type: 'tab_switch' | 'face_not_detected' | 'multiple_faces' | 'page_hidden' | 'fullscreen_exit';
  timestamp: Date;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

interface UseInterviewProctoringOptions {
  userId?: string;
  sessionId?: string;
  maxTabSwitches?: number;
  onViolation?: (violation: ProctoringViolation) => void;
  onMaxViolations?: () => void;
}

export const useInterviewProctoring = (options: UseInterviewProctoringOptions = {}) => {
  const {
    userId,
    sessionId,
    maxTabSwitches = 5,
    onViolation,
    onMaxViolations,
  } = options;

  const [state, setState] = useState<ProctoringState>({
    tabSwitchCount: 0,
    faceDetectionErrors: 0,
    isPageVisible: true,
    violations: [],
    isMonitoring: false,
  });

  const subscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Broadcast alert to realtime channel for admins
  const broadcastAlert = useCallback(async (
    alertType: string,
    message: string,
    severity: 'low' | 'medium' | 'high',
    details?: Record<string, unknown>
  ) => {
    if (!userId || !sessionId) return;

    try {
      await api.post("/api/proctoring/alerts", {
        userId,
        testId: sessionId,
        testType: "ai_interview",
        alertType,
        severity,
        message,
        violationDetails: details ? JSON.parse(JSON.stringify(details)) : null,
      });
    } catch (error) {
      console.error('Error broadcasting alert:', error);
    }
  }, [userId, sessionId]);

  // Handle visibility change (tab switch)
  const handleVisibilityChange = useCallback(() => {
    const isVisible = document.visibilityState === 'visible';
    
    setState(prev => {
      if (!isVisible && prev.isMonitoring) {
        const newTabSwitchCount = prev.tabSwitchCount + 1;
        const violation: ProctoringViolation = {
          type: 'tab_switch',
          timestamp: new Date(),
          message: `Tab switch detected (${newTabSwitchCount}/${maxTabSwitches})`,
          severity: newTabSwitchCount >= maxTabSwitches ? 'high' : newTabSwitchCount >= 3 ? 'medium' : 'low',
        };

        // Broadcast alert
        broadcastAlert(
          'tab_switch',
          `Candidate switched tabs during AI interview (${newTabSwitchCount} times)`,
          violation.severity,
          { tabSwitchCount: newTabSwitchCount, maxAllowed: maxTabSwitches }
        );

        toast.warning(`Tab switch detected! (${newTabSwitchCount}/${maxTabSwitches})`);
        
        if (onViolation) onViolation(violation);
        
        if (newTabSwitchCount >= maxTabSwitches && onMaxViolations) {
          onMaxViolations();
        }

        return {
          ...prev,
          isPageVisible: isVisible,
          tabSwitchCount: newTabSwitchCount,
          violations: [...prev.violations, violation],
        };
      }
      
      return { ...prev, isPageVisible: isVisible };
    });
  }, [maxTabSwitches, broadcastAlert, onViolation, onMaxViolations]);

  // Handle fullscreen exit
  const handleFullscreenChange = useCallback(() => {
    const isFullscreen = !!document.fullscreenElement;
    
    if (!isFullscreen && state.isMonitoring) {
      const violation: ProctoringViolation = {
        type: 'fullscreen_exit',
        timestamp: new Date(),
        message: 'Exited fullscreen mode',
        severity: 'low',
      };

      broadcastAlert(
        'fullscreen_exit',
        'Candidate exited fullscreen mode during AI interview',
        'low',
        {}
      );

      toast.warning('Please stay in fullscreen mode during the interview');
      
      if (onViolation) onViolation(violation);

      setState(prev => ({
        ...prev,
        violations: [...prev.violations, violation],
      }));
    }
  }, [state.isMonitoring, broadcastAlert, onViolation]);

  // Report face detection issue
  const reportFaceIssue = useCallback((type: 'face_not_detected' | 'multiple_faces') => {
    setState(prev => {
      const newFaceErrors = prev.faceDetectionErrors + 1;
      const violation: ProctoringViolation = {
        type,
        timestamp: new Date(),
        message: type === 'face_not_detected' ? 'No face detected in camera' : 'Multiple faces detected',
        severity: newFaceErrors >= 5 ? 'high' : newFaceErrors >= 3 ? 'medium' : 'low',
      };

      broadcastAlert(
        'face_violation',
        type === 'face_not_detected' 
          ? 'No face detected during AI interview' 
          : 'Multiple faces detected during AI interview',
        violation.severity,
        { faceErrorCount: newFaceErrors, type }
      );

      if (onViolation) onViolation(violation);

      return {
        ...prev,
        faceDetectionErrors: newFaceErrors,
        violations: [...prev.violations, violation],
      };
    });
  }, [broadcastAlert, onViolation]);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    // Clear any pending subscribe from a previous start
    if (subscribeTimerRef.current) {
      clearTimeout(subscribeTimerRef.current);
      subscribeTimerRef.current = null;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    setState(prev => ({ ...prev, isMonitoring: true }));
  }, [sessionId, handleVisibilityChange, handleFullscreenChange]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);

    if (subscribeTimerRef.current) {
      clearTimeout(subscribeTimerRef.current);
      subscribeTimerRef.current = null;
    }

    setState(prev => ({ ...prev, isMonitoring: false }));
  }, [handleVisibilityChange, handleFullscreenChange]);

  // Reset state
  const reset = useCallback(() => {
    setState({
      tabSwitchCount: 0,
      faceDetectionErrors: 0,
      isPageVisible: true,
      violations: [],
      isMonitoring: false,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (subscribeTimerRef.current) {
        clearTimeout(subscribeTimerRef.current);
        subscribeTimerRef.current = null;
      }
    };
  }, [handleVisibilityChange, handleFullscreenChange]);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    reportFaceIssue,
    reset,
    broadcastAlert,
  };
};
