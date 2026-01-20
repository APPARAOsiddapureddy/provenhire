import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInterviewProctoring } from "@/hooks/useInterviewProctoring";
import PracticeInterviewMode from "@/components/PracticeInterviewMode";
import { 
  Video, 
  Mic, 
  MicOff, 
  Camera, 
  CameraOff, 
  Play, 
  Square, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  ChevronRight,
  Sparkles,
  RefreshCw,
  WifiOff,
  RotateCcw,
  Shield,
  Eye,
  GraduationCap
} from "lucide-react";

interface ExpertInterviewStageProps {
  onComplete: () => void;
  onReturnToDashboard: () => void;
}

interface InterviewQuestion {
  type: 'behavioral' | 'technical' | 'situational' | 'domain';
  question: string;
}

interface ResponseEvaluation {
  score: number;
  confidence_score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  keywords_detected: string[];
  is_flagged: boolean;
  flag_reason?: string;
}

const ExpertInterviewStage = ({ onComplete, onReturnToDashboard }: ExpertInterviewStageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Practice mode state
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  
  // Interview state
  const [stage, setStage] = useState<'intro' | 'recording' | 'analyzing' | 'feedback' | 'complete'>('intro');
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [overallScore, setOverallScore] = useState(0);
  const [isFlagged, setIsFlagged] = useState(false);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [currentEvaluation, setCurrentEvaluation] = useState<ResponseEvaluation | null>(null);
  
  // Retry state
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const MAX_RETRIES = 3;
  
  // Proctoring hook
  const proctoring = useInterviewProctoring({
    userId: user?.id,
    sessionId: sessionId || undefined,
    maxTabSwitches: 5,
    onViolation: (violation) => {
      console.log('Proctoring violation:', violation);
      if (violation.severity === 'high') {
        setIsFlagged(true);
      }
    },
    onMaxViolations: () => {
      toast({
        title: "Too Many Violations",
        description: "Your interview has been flagged for excessive tab switches.",
        variant: "destructive",
      });
      setIsFlagged(true);
    },
  });
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const savedRecordingRef = useRef<Blob | null>(null);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online');
      toast({
        title: "Connection Restored",
        description: "You're back online. You can continue the interview.",
      });
    };
    
    const handleOffline = () => {
      setNetworkStatus('offline');
      toast({
        title: "Connection Lost",
        description: "Please check your internet connection.",
        variant: "destructive",
      });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setNetworkStatus(navigator.onLine ? 'online' : 'offline');
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      let finalTranscript = '';
      
      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        setTranscript(finalTranscript + interimTranscript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'network') {
          setLastError('Speech recognition network error. Your response will still be recorded.');
        }
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Load questions when starting
  const startInterview = async () => {
    setLoading(true);
    try {
      // Get questions from API
      const { data, error } = await supabase.functions.invoke('analyze-interview-response', {
        body: { action: 'get_questions' }
      });
      
      if (error) throw error;
      
      setQuestions(data.questions);
      
      // Create interview session
      const { data: session, error: sessionError } = await supabase
        .from('ai_interview_sessions')
        .insert({
          user_id: user?.id,
          status: 'in_progress',
          total_questions: data.questions.length,
          started_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (sessionError) throw sessionError;
      
      setSessionId(session.id);
      setStage('recording');
      
      // Initialize camera
      await initializeMedia();
      
      // Start proctoring after session is created
      proctoring.startMonitoring();
      
      // Start face detection check interval
      startFaceDetectionCheck();
      
      toast({
        title: "Interview Started",
        description: "Answer each question clearly. You have up to 3 minutes per question.",
      });
    } catch (error: any) {
      console.error('Error starting interview:', error);
      toast({
        title: "Failed to start interview",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Face detection check using video stream
  const startFaceDetectionCheck = useCallback(() => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
    }
    
    faceCheckIntervalRef.current = setInterval(() => {
      checkFaceInFrame();
    }, 10000); // Check every 10 seconds
  }, []);
  
  const checkFaceInFrame = useCallback(async () => {
    if (!videoRef.current || !proctoring.isMonitoring) return;
    
    // Simple check: if video track is enabled but no face visible
    // This is a basic heuristic - in production you'd use face-api.js
    const video = videoRef.current;
    if (video.readyState < 2) return;
    
    // Create a canvas to analyze the frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Simple brightness check - if frame is mostly dark, might indicate no face/covered camera
      let totalBrightness = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        totalBrightness += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (imageData.data.length / 4);
      
      // If very dark (covered camera) or very bright (pointed at light)
      if (avgBrightness < 20 || avgBrightness > 240) {
        proctoring.reportFaceIssue('face_not_detected');
        toast({
          title: "Camera Issue Detected",
          description: "Please ensure your face is clearly visible to the camera.",
          variant: "destructive",
        });
      }
    }
  }, [proctoring, toast]);
  
  const stopFaceDetectionCheck = useCallback(() => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
      faceCheckIntervalRef.current = null;
    }
  }, []);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled,
        audio: true
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
      toast({
        title: "Camera/Microphone Error",
        description: "Please allow access to your camera and microphone",
        variant: "destructive",
      });
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];
    setTranscript('');
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000);
    setIsRecording(true);
    setRecordingTime(0);
    
    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 180) { // 3 minutes max
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    
    // Start speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log('Speech recognition already started');
      }
    }
  };

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      
      // Wait for data to be available
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Analyze the response
      await analyzeResponse();
    }
  }, [isRecording]);

  const analyzeResponse = async (isRetry = false) => {
    setStage('analyzing');
    setLastError(null);
    
    if (isRetry) {
      setIsRetrying(true);
    }
    
    try {
      // Check network status
      if (!navigator.onLine) {
        throw new Error('No internet connection. Please check your network and try again.');
      }
      
      const currentQuestion = questions[currentQuestionIndex];
      const finalTranscript = transcript.trim() || "No speech detected";
      
      // Upload recording to storage with retry logic
      const blob = savedRecordingRef.current || new Blob(chunksRef.current, { type: 'video/webm' });
      savedRecordingRef.current = blob; // Save for potential retry
      
      const fileName = `${user?.id}/${sessionId}/${currentQuestionIndex}_${Date.now()}.webm`;
      
      let uploadAttempts = 0;
      let uploadSuccess = false;
      
      while (uploadAttempts < 3 && !uploadSuccess) {
        const { error: uploadError } = await supabase.storage
          .from('interview-recordings')
          .upload(fileName, blob);
        
        if (!uploadError) {
          uploadSuccess = true;
          console.log('Upload successful on attempt', uploadAttempts + 1);
        } else {
          uploadAttempts++;
          console.error(`Upload attempt ${uploadAttempts} failed:`, uploadError);
          if (uploadAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts)); // Exponential backoff
          }
        }
      }
      
      if (!uploadSuccess) {
        console.warn('Recording upload failed after 3 attempts, continuing with analysis...');
      }
      
      // Analyze with AI - with retry logic
      let analysisAttempts = 0;
      let analysisData = null;
      
      while (analysisAttempts < 3 && !analysisData) {
        try {
          const { data, error } = await supabase.functions.invoke('analyze-interview-response', {
            body: {
              action: 'analyze_response',
              transcript: finalTranscript,
              questionType: currentQuestion.type,
              questionText: currentQuestion.question
            }
          });
          
          if (error) {
            throw error;
          }
          
          analysisData = data;
        } catch (apiError: any) {
          analysisAttempts++;
          console.error(`Analysis attempt ${analysisAttempts} failed:`, apiError);
          
          if (apiError.message?.includes('429') || apiError.message?.includes('Rate limit')) {
            throw new Error('AI service is busy. Please wait a moment and try again.');
          }
          
          if (apiError.message?.includes('402')) {
            throw new Error('AI service temporarily unavailable. Please try again later.');
          }
          
          if (analysisAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000 * analysisAttempts));
          }
        }
      }
      
      if (!analysisData) {
        throw new Error('Failed to analyze response after multiple attempts. Please try again.');
      }
      
      const evaluation: ResponseEvaluation = analysisData.evaluation;
      setCurrentEvaluation(evaluation);
      
      if (evaluation.is_flagged) {
        setIsFlagged(true);
      }
      
      // Save response to database with retry
      let dbAttempts = 0;
      let dbSuccess = false;
      
      while (dbAttempts < 3 && !dbSuccess) {
        const { error: dbError } = await supabase
          .from('ai_interview_responses')
          .insert({
            session_id: sessionId,
            user_id: user?.id,
            question_index: currentQuestionIndex,
            question_type: currentQuestion.type,
            question_text: currentQuestion.question,
            video_url: uploadSuccess ? fileName : null,
            transcript: finalTranscript,
            ai_score: evaluation.score,
            ai_feedback: evaluation.feedback,
            confidence_score: evaluation.confidence_score,
            keywords_detected: evaluation.keywords_detected,
            is_flagged: evaluation.is_flagged,
            flag_reason: evaluation.flag_reason,
            response_duration_seconds: recordingTime
          });
        
        if (!dbError) {
          dbSuccess = true;
        } else {
          dbAttempts++;
          if (dbAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * dbAttempts));
          }
        }
      }
      
      // Clear saved recording on success
      savedRecordingRef.current = null;
      setRetryCount(0);
      setStage('feedback');
      
    } catch (error: any) {
      console.error('Error analyzing response:', error);
      const errorMessage = error.message || 'An unexpected error occurred';
      setLastError(errorMessage);
      setRetryCount(prev => prev + 1);
      
      toast({
        title: "Analysis failed",
        description: retryCount < MAX_RETRIES - 1 
          ? `${errorMessage} You can retry (${retryCount + 1}/${MAX_RETRIES} attempts).`
          : errorMessage,
        variant: "destructive",
      });
      
      setStage('recording');
    } finally {
      setIsRetrying(false);
    }
  };
  
  const retryAnalysis = () => {
    if (retryCount < MAX_RETRIES && savedRecordingRef.current) {
      analyzeResponse(true);
    } else if (retryCount >= MAX_RETRIES) {
      toast({
        title: "Max retries reached",
        description: "Please re-record your response.",
        variant: "destructive",
      });
      setRetryCount(0);
      savedRecordingRef.current = null;
    }
  };
  
  const reRecordResponse = () => {
    setRetryCount(0);
    setLastError(null);
    savedRecordingRef.current = null;
    setTranscript('');
    setRecordingTime(0);
    setStage('recording');
  };

  const nextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setCurrentEvaluation(null);
      setTranscript('');
      setRecordingTime(0);
      setRetryCount(0);
      setLastError(null);
      savedRecordingRef.current = null;
      setStage('recording');
    } else {
      // Complete interview
      await completeInterview();
    }
  };

  const completeInterview = async () => {
    setStage('complete');
    
    try {
      // Fetch all responses and calculate overall score
      const { data: responses } = await supabase
        .from('ai_interview_responses')
        .select('ai_score, is_flagged, flag_reason')
        .eq('session_id', sessionId);
      
      if (responses && responses.length > 0) {
        const avgScore = responses.reduce((acc, r) => acc + (r.ai_score || 0), 0) / responses.length;
        const anyFlagged = responses.some(r => r.is_flagged) || isFlagged || proctoring.violations.length > 0;
        const flagReasons = [
          ...responses
            .filter(r => r.is_flagged && r.flag_reason)
            .map(r => r.flag_reason as string),
          ...proctoring.violations.map(v => v.message),
        ];
        
        setOverallScore(Math.round(avgScore));
        setIsFlagged(anyFlagged);
        
        // Update session
        await supabase
          .from('ai_interview_sessions')
          .update({
            status: 'completed',
            overall_score: avgScore,
            is_flagged: anyFlagged,
            questions_answered: questions.length,
            completed_at: new Date().toISOString()
          })
          .eq('id', sessionId);
        
        // Update verification stage if passed
        if (avgScore >= 60 && !anyFlagged) {
          await supabase
            .from('verification_stages')
            .update({
              status: 'completed',
              score: Math.round(avgScore),
              completed_at: new Date().toISOString()
            })
            .eq('user_id', user?.id)
            .eq('stage_name', 'expert_interview');
          
          // Update profile verification status
          await supabase
            .from('job_seeker_profiles')
            .update({ verification_status: 'verified' })
            .eq('user_id', user?.id);
        }
        
        // Get candidate profile for email notification
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', user?.id)
          .single();
        
        // Send email notification
        try {
          await supabase.functions.invoke('send-interview-notification', {
            body: {
              sessionId,
              userId: user?.id,
              candidateName: profile?.full_name || 'Candidate',
              candidateEmail: profile?.email || user?.email,
              overallScore: Math.round(avgScore),
              isFlagged: anyFlagged,
              flagReasons: flagReasons.length > 0 ? flagReasons : undefined,
              questionsAnswered: questions.length,
              totalQuestions: questions.length
            }
          });
          console.log('Interview notification sent successfully');
        } catch (notifError) {
          console.error('Failed to send interview notification:', notifError);
          // Don't block completion if notification fails
        }
      }
      
      // Stop proctoring
      proctoring.stopMonitoring();
      stopFaceDetectionCheck();
      
      // Cleanup media
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
    } catch (error: any) {
      console.error('Error completing interview:', error);
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Practice mode
  if (isPracticeMode) {
    return <PracticeInterviewMode onExit={() => setIsPracticeMode(false)} />;
  }

  // Intro stage
  if (stage === 'intro') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Powered Interview
          </CardTitle>
          <CardDescription>
            Complete your verification with our AI interview system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Video className="h-4 w-4" />
            <AlertDescription>
              You'll answer 5 questions covering behavioral, technical, and situational topics.
              Each response is recorded and analyzed by AI for scoring.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            <h3 className="font-semibold">What to expect:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                5 interview questions (behavioral, technical, situational)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Up to 3 minutes per question
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Real-time speech transcription
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                AI analysis and scoring after each response
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Instant feedback and improvement suggestions
              </li>
            </ul>
          </div>
          
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Requirements:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Working camera and microphone</li>
              <li>• Quiet environment with good lighting</li>
              <li>• Stable internet connection</li>
              <li>• Pass score: 60% or higher</li>
            </ul>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-amber-800 dark:text-amber-200">Proctoring Enabled</h4>
            </div>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <li className="flex items-center gap-2">
                <Eye className="h-3 w-3" />
                Tab switches and window focus are monitored
              </li>
              <li className="flex items-center gap-2">
                <Camera className="h-3 w-3" />
                Face visibility is checked periodically
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" />
                Violations may affect your interview result
              </li>
            </ul>
          </div>
          
          {/* Practice Mode Button */}
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">Not ready yet?</h4>
                <p className="text-xs text-muted-foreground">
                  Try practice mode to get familiar with the interview format
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsPracticeMode(true)}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                Practice First
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Role-based questions</Badge>
            <span>Includes technical and non-tech domain prompts based on your profile.</span>
          </div>
          
          <Button onClick={startInterview} className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing Interview...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Interview
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Recording stage
  if (stage === 'recording') {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex) / questions.length) * 100;
    const typeLabelMap: Record<InterviewQuestion['type'], string> = {
      behavioral: 'behavioral',
      technical: 'technical',
      situational: 'situational',
      domain: 'domain',
    };
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Question {currentQuestionIndex + 1} of {questions.length}
              </CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="mt-1">
                  {typeLabelMap[currentQuestion?.type || 'behavioral']}
                </Badge>
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold">
                {formatTime(recordingTime)}
              </div>
              <div className="text-xs text-muted-foreground">
                Max 3:00
              </div>
            </div>
          </div>
          <Progress value={progress} className="mt-4" />
          
          {/* Proctoring status bar */}
          <div className="flex items-center justify-between text-xs bg-muted/50 rounded px-3 py-1.5 mt-2">
            <div className="flex items-center gap-2">
              <Shield className={`h-3 w-3 ${proctoring.isMonitoring ? 'text-green-500' : 'text-muted-foreground'}`} />
              <span className="text-muted-foreground">Proctoring Active</span>
            </div>
            {proctoring.tabSwitchCount > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Tab Switches: {proctoring.tabSwitchCount}/5
              </Badge>
            )}
            {proctoring.violations.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {proctoring.violations.length} Violation{proctoring.violations.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Network status indicator */}
          {networkStatus === 'offline' && (
            <Alert variant="destructive">
              <WifiOff className="h-4 w-4" />
              <AlertDescription>
                You're offline. Please check your internet connection before recording.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Retry error message */}
          {lastError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{lastError}</span>
                <div className="flex gap-2 ml-4">
                  {retryCount < MAX_RETRIES && savedRecordingRef.current && (
                    <Button size="sm" variant="outline" onClick={retryAnalysis} disabled={isRetrying}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                      Retry ({retryCount}/{MAX_RETRIES})
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={reRecordResponse}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Re-record
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
            <p className="font-medium">{currentQuestion?.question}</p>
          </div>
          
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <CameraOff className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            {isRecording && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
                Recording
              </div>
            )}
            {/* Network indicator in video */}
            <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              networkStatus === 'online' ? 'bg-green-500/80' : 'bg-red-500/80'
            } text-white`}>
              {networkStatus === 'online' ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-white" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Offline
                </>
              )}
            </div>
          </div>
          
          {transcript && (
            <div className="bg-muted/50 p-3 rounded-lg max-h-24 overflow-y-auto">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Live transcript: </span>
                {transcript}
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleVideo}
              className={!videoEnabled ? 'bg-destructive/10' : ''}
            >
              {videoEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={toggleAudio}
              className={!audioEnabled ? 'bg-destructive/10' : ''}
            >
              {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            
            {!isRecording ? (
              <Button 
                onClick={startRecording} 
                size="lg" 
                className="px-8"
                disabled={networkStatus === 'offline'}
              >
                <Play className="mr-2 h-4 w-4" />
                {savedRecordingRef.current ? 'Record Again' : 'Start Recording'}
              </Button>
            ) : (
              <Button onClick={stopRecording} size="lg" variant="destructive" className="px-8">
                <Square className="mr-2 h-4 w-4" />
                Submit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Analyzing stage
  if (stage === 'analyzing') {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="text-xl font-semibold">
              {isRetrying ? 'Retrying Analysis...' : 'Analyzing Your Response'}
            </h3>
            <p className="text-muted-foreground">
              {isRetrying 
                ? `Attempt ${retryCount + 1} of ${MAX_RETRIES}. Please wait...`
                : 'Our AI is evaluating your answer for clarity, relevance, and depth...'}
            </p>
            {networkStatus === 'offline' && (
              <Alert variant="destructive" className="max-w-md">
                <WifiOff className="h-4 w-4" />
                <AlertDescription>
                  Connection lost. Analysis will continue when you're back online.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Feedback stage
  if (stage === 'feedback' && currentEvaluation) {
    const scoreColor = currentEvaluation.score >= 75 ? 'text-green-500' : 
                       currentEvaluation.score >= 60 ? 'text-yellow-500' : 'text-red-500';
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentEvaluation.is_flagged ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            Response Analyzed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <div className={`text-5xl font-bold ${scoreColor}`}>
                {currentEvaluation.score}
              </div>
              <div className="text-sm text-muted-foreground">out of 100</div>
            </div>
          </div>
          
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">AI Feedback</h4>
            <p className="text-sm text-muted-foreground">{currentEvaluation.feedback}</p>
          </div>
          
          {currentEvaluation.strengths.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 text-green-600">Strengths</h4>
              <ul className="space-y-1">
                {currentEvaluation.strengths.map((strength, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {currentEvaluation.improvements.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 text-yellow-600">Areas for Improvement</h4>
              <ul className="space-y-1">
                {currentEvaluation.improvements.map((improvement, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-yellow-500" />
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {currentEvaluation.keywords_detected.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Keywords Detected</h4>
              <div className="flex flex-wrap gap-2">
                {currentEvaluation.keywords_detected.map((keyword, i) => (
                  <Badge key={i} variant="secondary">{keyword}</Badge>
                ))}
              </div>
            </div>
          )}
          
          {currentEvaluation.is_flagged && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {currentEvaluation.flag_reason || "This response has been flagged for admin review."}
              </AlertDescription>
            </Alert>
          )}
          
          <Button onClick={nextQuestion} className="w-full">
            {currentQuestionIndex < questions.length - 1 ? (
              <>
                Next Question
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              'Complete Interview'
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Complete stage
  if (stage === 'complete') {
    const passed = overallScore >= 60 && !isFlagged;
    
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center space-y-6">
            {passed ? (
              <>
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-green-600">Interview Completed!</h3>
                <p className="text-muted-foreground">
                  Congratulations! You've successfully completed the verification process.
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center">
                  <AlertTriangle className="h-10 w-10 text-yellow-600" />
                </div>
                <h3 className="text-2xl font-bold text-yellow-600">Interview Under Review</h3>
                <p className="text-muted-foreground">
                  {isFlagged 
                    ? "Some of your responses have been flagged for admin review."
                    : "Your score didn't meet the passing threshold. An admin will review your responses."}
                </p>
              </>
            )}
            
            <div className="bg-muted/50 p-6 rounded-lg w-full max-w-sm">
              <div className="text-4xl font-bold mb-2">{overallScore}%</div>
              <div className="text-sm text-muted-foreground">Overall Score</div>
              <Progress value={overallScore} className="mt-4" />
            </div>
            
            <Button
              onClick={() => {
                onComplete();
                onReturnToDashboard();
              }}
              className="mt-4"
            >
              {passed ? 'Continue to Dashboard' : 'Return to Dashboard'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default ExpertInterviewStage;
