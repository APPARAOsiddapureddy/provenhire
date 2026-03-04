import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  GraduationCap,
  ArrowLeft,
  RotateCcw,
  Users,
  Code,
  Lightbulb,
  Shuffle
} from "lucide-react";

interface PracticeInterviewModeProps {
  onExit: () => void;
}

interface InterviewQuestion {
  type: 'behavioral' | 'technical' | 'situational';
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

type PracticeCategory = 'all' | 'behavioral' | 'technical' | 'situational';

// Expanded practice questions by category
const PRACTICE_QUESTIONS_BY_CATEGORY: Record<Exclude<PracticeCategory, 'all'>, InterviewQuestion[]> = {
  behavioral: [
    {
      type: 'behavioral',
      question: 'Tell me about a time when you had to learn something new quickly. How did you approach it?'
    },
    {
      type: 'behavioral',
      question: 'Describe a situation where you had to work with a difficult team member. How did you handle it?'
    },
    {
      type: 'behavioral',
      question: 'Give an example of a time you failed at something. What did you learn from it?'
    },
    {
      type: 'behavioral',
      question: 'Tell me about a time when you had to meet a tight deadline. How did you prioritize your tasks?'
    },
    {
      type: 'behavioral',
      question: 'Describe a situation where you took initiative beyond your normal responsibilities.'
    }
  ],
  technical: [
    {
      type: 'technical',
      question: 'Can you explain how you would approach debugging a difficult problem in your code?'
    },
    {
      type: 'technical',
      question: 'Describe your process for reviewing code written by others. What do you look for?'
    },
    {
      type: 'technical',
      question: 'Explain how you would design a system to handle high traffic loads.'
    },
    {
      type: 'technical',
      question: 'How do you approach learning a new programming language or framework?'
    },
    {
      type: 'technical',
      question: 'Describe your experience with version control and collaborative development workflows.'
    }
  ],
  situational: [
    {
      type: 'situational',
      question: 'Imagine you disagree with a team member about the best approach to solve a problem. How would you handle this situation?'
    },
    {
      type: 'situational',
      question: 'If you discovered a critical bug just before a product launch, what steps would you take?'
    },
    {
      type: 'situational',
      question: 'How would you handle a situation where you are asked to complete a task you have never done before?'
    },
    {
      type: 'situational',
      question: 'Imagine your manager gives you feedback you disagree with. How would you respond?'
    },
    {
      type: 'situational',
      question: 'If you had multiple urgent tasks from different stakeholders, how would you prioritize them?'
    }
  ]
};

const CATEGORY_INFO: Record<PracticeCategory, { label: string; description: string; icon: typeof Users; color: string }> = {
  all: {
    label: 'Mixed Practice',
    description: 'Random questions from all categories',
    icon: Shuffle,
    color: 'text-primary'
  },
  behavioral: {
    label: 'Behavioral',
    description: 'Questions about past experiences and actions',
    icon: Users,
    color: 'text-blue-500'
  },
  technical: {
    label: 'Technical',
    description: 'Questions about skills and technical knowledge',
    icon: Code,
    color: 'text-green-500'
  },
  situational: {
    label: 'Situational',
    description: 'Hypothetical scenarios and problem-solving',
    icon: Lightbulb,
    color: 'text-amber-500'
  }
};

const getQuestionsForCategory = (category: PracticeCategory, count: number = 3): InterviewQuestion[] => {
  if (category === 'all') {
    // Get one random question from each category
    const allQuestions: InterviewQuestion[] = [];
    const categories: (keyof typeof PRACTICE_QUESTIONS_BY_CATEGORY)[] = ['behavioral', 'technical', 'situational'];
    
    categories.forEach(cat => {
      const catQuestions = [...PRACTICE_QUESTIONS_BY_CATEGORY[cat]];
      const shuffled = catQuestions.sort(() => Math.random() - 0.5);
      allQuestions.push(shuffled[0]);
    });
    
    return allQuestions.sort(() => Math.random() - 0.5);
  }
  
  const categoryQuestions = [...PRACTICE_QUESTIONS_BY_CATEGORY[category]];
  const shuffled = categoryQuestions.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

const PracticeInterviewMode = ({ onExit }: PracticeInterviewModeProps) => {
  const { toast } = useToast();
  
  // Category selection state
  const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);
  
  // Interview state
  const [stage, setStage] = useState<'category-select' | 'intro' | 'recording' | 'analyzing' | 'feedback' | 'complete'>('category-select');
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [overallScore, setOverallScore] = useState(0);
  const [allScores, setAllScores] = useState<number[]>([]);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [currentEvaluation, setCurrentEvaluation] = useState<ResponseEvaluation | null>(null);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

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
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startPractice = async () => {
    setLoading(true);
    try {
      await initializeMedia();
      setStage('recording');
      
      toast({
        title: "Practice Mode Started",
        description: "Answer each question clearly. Your responses won't count toward verification.",
      });
    } catch (error: any) {
      console.error('Error starting practice:', error);
      toast({
        title: "Failed to start practice",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
      throw error;
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    setTranscript('');
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9'
    });
    
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
      
      // Analyze the response (but don't save it)
      await analyzeResponse();
    }
  }, [isRecording]);

  const analyzeResponse = async () => {
    setStage('analyzing');
    
    try {
      const currentQuestion = questions[currentQuestionIndex];
      const finalTranscript = transcript.trim() || "No speech detected";
      
      // Analyze with AI - same as real interview but we don't save the results
      const { result } = await api.post<{ result: string }>("/api/ai/evaluate-interview", {
        transcript: `Question: ${currentQuestion.question}\nAnswer: ${finalTranscript}`,
      });
      let evaluation: ResponseEvaluation = {
        score: 0,
        strengths: [],
        improvements: [],
        feedback: result,
      } as ResponseEvaluation;
      setCurrentEvaluation(evaluation);
      setAllScores(prev => [...prev, evaluation.score]);
      setStage('feedback');
      
    } catch (error: any) {
      console.error('Error analyzing response:', error);
      toast({
        title: "Analysis failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setStage('recording');
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setCurrentEvaluation(null);
      setTranscript('');
      setRecordingTime(0);
      setStage('recording');
    } else {
      // Complete practice
      completePractice();
    }
  };

  const completePractice = () => {
    const avgScore = allScores.reduce((acc, s) => acc + s, 0) / allScores.length;
    setOverallScore(Math.round(avgScore));
    setStage('complete');
    
    // Cleanup media
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const restartPractice = () => {
    setStage('category-select');
    setSelectedCategory(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setAllScores([]);
    setOverallScore(0);
    setCurrentEvaluation(null);
    setTranscript('');
    setRecordingTime(0);
  };

  const selectCategory = (category: PracticeCategory) => {
    setSelectedCategory(category);
    const practiceQuestions = getQuestionsForCategory(category, category === 'all' ? 3 : 3);
    setQuestions(practiceQuestions);
    setStage('intro');
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

  // Category Selection Stage
  if (stage === 'category-select') {
    return (
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                Choose Practice Category
              </CardTitle>
              <CardDescription>
                Select a question type to focus your practice session
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Practice Mode
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3">
            {(Object.keys(CATEGORY_INFO) as PracticeCategory[]).map((category) => {
              const info = CATEGORY_INFO[category];
              const Icon = info.icon;
              const questionCount = category === 'all' 
                ? 3 
                : PRACTICE_QUESTIONS_BY_CATEGORY[category].length;
              
              return (
                <button
                  key={category}
                  onClick={() => selectCategory(category)}
                  className="flex items-center gap-4 p-4 rounded-lg border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors`}>
                    <Icon className={`h-6 w-6 ${info.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {info.label}
                      {category === 'all' && (
                        <Badge variant="outline" className="text-xs">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{category === 'all' ? 3 : questionCount}</div>
                    <div className="text-xs text-muted-foreground">questions</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </div>
          
          <Alert className="border-primary/20 bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription>
              Practice as many times as you want! Your answers won't affect your verification score.
            </AlertDescription>
          </Alert>
          
          <Button variant="outline" onClick={onExit} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Interview
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Practice Intro (after category selection)
  if (stage === 'intro' && selectedCategory) {
    const categoryInfo = CATEGORY_INFO[selectedCategory];
    const CategoryIcon = categoryInfo.icon;
    
    return (
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CategoryIcon className={`h-5 w-5 ${categoryInfo.color}`} />
                {categoryInfo.label} Practice
              </CardTitle>
              <CardDescription>
                {categoryInfo.description}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {questions.length} Questions
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-primary/20 bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription>
              This is a safe space to practice! Your answers will be analyzed by AI 
              but <strong>won't be saved or counted</strong> toward your verification score.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            <h3 className="font-semibold">Practice includes:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {questions.length} {selectedCategory === 'all' ? 'mixed' : selectedCategory} questions
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Same recording experience as the real interview
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                AI analysis and feedback on each response
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                No impact on your verification status
              </li>
            </ul>
          </div>
          
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Tips for {selectedCategory} questions:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {selectedCategory === 'behavioral' && (
                <>
                  <li>• Use the STAR method: Situation, Task, Action, Result</li>
                  <li>• Share specific examples from your experience</li>
                  <li>• Focus on what YOU did, not the team</li>
                  <li>• Quantify results when possible</li>
                </>
              )}
              {selectedCategory === 'technical' && (
                <>
                  <li>• Explain your thought process clearly</li>
                  <li>• Discuss trade-offs and alternatives</li>
                  <li>• Use technical terms accurately</li>
                  <li>• Share real project examples when relevant</li>
                </>
              )}
              {selectedCategory === 'situational' && (
                <>
                  <li>• Think through the scenario logically</li>
                  <li>• Consider multiple perspectives</li>
                  <li>• Explain your reasoning step by step</li>
                  <li>• Show problem-solving skills</li>
                </>
              )}
              {selectedCategory === 'all' && (
                <>
                  <li>• Speak clearly and at a natural pace</li>
                  <li>• Use specific examples from your experience</li>
                  <li>• Structure your answers logically</li>
                  <li>• Take a moment to think before answering</li>
                </>
              )}
            </ul>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStage('category-select')} className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Change Category
            </Button>
            <Button onClick={startPractice} className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Practice
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Recording stage
  if (stage === 'recording') {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex) / questions.length) * 100;
    
    return (
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                  Practice Mode
                </Badge>
              </div>
              <CardTitle className="text-lg">
                Question {currentQuestionIndex + 1} of {questions.length}
              </CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="mt-1">
                  {currentQuestion?.type}
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
        </CardHeader>
        <CardContent className="space-y-4">
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
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
                Recording (Practice)
              </div>
            )}
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
              <Button onClick={startRecording} size="lg" className="px-8">
                <Play className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
            ) : (
              <Button onClick={stopRecording} size="lg" variant="secondary" className="px-8">
                <Square className="mr-2 h-4 w-4" />
                Stop & Get Feedback
              </Button>
            )}
          </div>
          
          <Button variant="ghost" onClick={onExit} className="w-full text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit Practice Mode
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Analyzing stage
  if (stage === 'analyzing') {
    return (
      <Card className="border-2 border-dashed border-primary/30">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="text-xl font-semibold">Analyzing Your Practice Response</h3>
            <p className="text-muted-foreground">
              Our AI is evaluating your answer...
            </p>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Practice Mode - No data saved
            </Badge>
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
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Practice Feedback
            </CardTitle>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Practice Mode
            </Badge>
          </div>
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
          
          <Button onClick={nextQuestion} className="w-full">
            {currentQuestionIndex < questions.length - 1 ? (
              <>
                Next Practice Question
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              'See Practice Summary'
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Complete stage
  if (stage === 'complete' && selectedCategory) {
    const wouldPass = overallScore >= 60;
    const categoryInfo = CATEGORY_INFO[selectedCategory];
    const CategoryIcon = categoryInfo.icon;
    
    return (
      <Card className="border-2 border-dashed border-primary/30">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center space-y-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                Practice Complete
              </Badge>
              <Badge variant="outline" className={categoryInfo.color}>
                <CategoryIcon className="h-3 w-3 mr-1" />
                {categoryInfo.label}
              </Badge>
            </div>
            
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <GraduationCap className="h-10 w-10 text-primary" />
            </div>
            
            <h3 className="text-2xl font-bold">Practice Session Complete!</h3>
            
            <div className="bg-muted/50 p-6 rounded-lg w-full max-w-sm">
              <div className="text-4xl font-bold mb-2">{overallScore}%</div>
              <div className="text-sm text-muted-foreground">Average Practice Score</div>
              <Progress value={overallScore} className="mt-4" />
              
              <div className="mt-4 pt-4 border-t">
                {wouldPass ? (
                  <p className="text-sm text-green-600 flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    This would pass the real interview!
                  </p>
                ) : (
                  <p className="text-sm text-yellow-600 flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Keep practicing - you need 60% to pass
                  </p>
                )}
              </div>
            </div>
            
            <Alert className="max-w-sm border-primary/20 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                Remember: This was just practice! When you're ready, start the real interview 
                from the main screen.
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-3 w-full max-w-sm">
              <Button variant="outline" onClick={restartPractice} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" />
                Practice Again
              </Button>
              <Button onClick={onExit} className="flex-1">
                Ready for Real Interview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default PracticeInterviewMode;
