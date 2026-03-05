import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import CodeEditor from "@/components/CodeEditor";
import { ChevronLeft, ChevronRight, GraduationCap, Loader2 } from "lucide-react";
import { allDSAQuestions, type DSAQuestion, type ProgrammingLanguage, supportedLanguages } from "@/data/dsaQuestions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
}

type PracticeType = "aptitude" | "dsa" | "interview";

interface PracticeStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PracticeType;
  testName: string;
}

const SAMPLE_INTERVIEW_QUESTIONS = [
  "Tell me about a project you're proud of and the challenges you faced.",
  "How do you prioritize when you have multiple urgent tasks?",
];

const FALLBACK_APTITUDE_QUESTIONS: AptitudeQuestion[] = [
  {
    id: "practice-1",
    question: "If 5 machines can make 5 widgets in 5 minutes, how long would it take 100 machines to make 100 widgets?",
    options: ["5 minutes", "100 minutes", "20 minutes", "1 minute"],
  },
  {
    id: "practice-2",
    question: "Which number should replace the question mark? 2, 6, 12, 20, 30, ?",
    options: ["40", "42", "44", "46"],
  },
  {
    id: "practice-3",
    question: "Complete the analogy: Writer is to book as architect is to ___",
    options: ["blueprint", "building", "design", "structure"],
  },
];

export default function PracticeStageDialog({
  open,
  onOpenChange,
  type,
  testName,
}: PracticeStageDialogProps) {
  const [aptitudeQuestions, setAptitudeQuestions] = useState<AptitudeQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [aptitudeAnswers, setAptitudeAnswers] = useState<Record<string, string>>({});
  const [aptitudeIndex, setAptitudeIndex] = useState(0);
  const [practiceDsaQuestions] = useState<DSAQuestion[]>(() =>
    [...allDSAQuestions].sort(() => Math.random() - 0.5).slice(0, 2)
  );
  const [dsaIndex, setDsaIndex] = useState(0);
  const [dsaCode, setDsaCode] = useState<Record<string, string>>({});
  const [dsaLanguage, setDsaLanguage] = useState<ProgrammingLanguage>("python");
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open && type === "aptitude") {
      setLoading(true);
      api
        .get<{ questions: AptitudeQuestion[] }>("/api/verification/aptitude/practice")
        .then((res) => setAptitudeQuestions(res.questions ?? FALLBACK_APTITUDE_QUESTIONS))
        .catch(() => setAptitudeQuestions(FALLBACK_APTITUDE_QUESTIONS))
        .finally(() => setLoading(false));
    }
  }, [open, type]);

  useEffect(() => {
    if (open && type === "dsa" && practiceDsaQuestions.length > 0) {
      const initial: Record<string, string> = {};
      practiceDsaQuestions.forEach((q) => {
        initial[q.id] = q.templates[dsaLanguage] ?? q.templates.python;
      });
      setDsaCode(initial);
    }
  }, [open, type, practiceDsaQuestions, dsaLanguage]);

  const currentAptitude = aptitudeQuestions[aptitudeIndex];
  const currentDsa = practiceDsaQuestions[dsaIndex];
  const currentInterviewQ = SAMPLE_INTERVIEW_QUESTIONS[interviewIndex];

  const renderContent = () => {
    if (type === "aptitude") {
      if (loading)
        return (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        );
      if (aptitudeQuestions.length === 0)
        return <p className="text-muted-foreground py-4">No practice questions available.</p>;
      return (
        <div className="space-y-4">
          <p className="font-medium">Q{aptitudeIndex + 1}: {currentAptitude.question}</p>
          <div className="flex flex-wrap gap-2">
            {currentAptitude.options.map((opt, i) => (
              <Button
                key={i}
                variant={aptitudeAnswers[currentAptitude.id] === opt ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setAptitudeAnswers((p) => ({ ...p, [currentAptitude.id]: opt }))
                }
              >
                {opt}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    if (type === "dsa") {
      if (practiceDsaQuestions.length === 0) return null;
      const q = currentDsa;
      return (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-semibold flex gap-2">{q.title}</h4>
            <p className="text-sm mt-2 whitespace-pre-wrap">{q.description}</p>
          </div>
          <div className="flex gap-2">
            <span className="text-sm">Language:</span>
            <Select value={dsaLanguage} onValueChange={(v) => setDsaLanguage(v as ProgrammingLanguage)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((l) => (
                  <SelectItem key={l.language} value={l.language}>{l.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CodeEditor
            value={dsaCode[q.id] ?? q.templates.python}
            onChange={(v) => setDsaCode((p) => ({ ...p, [q.id]: v }))}
            language={dsaLanguage}
            height="280px"
          />
        </div>
      );
    }

    if (type === "interview") {
      return (
        <div className="space-y-4">
          <p className="font-medium">Q{interviewIndex + 1}: {currentInterviewQ}</p>
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Type your answer (practice only)..."
            value={interviewAnswers[interviewIndex] ?? ""}
            onChange={(e) =>
              setInterviewAnswers((p) => ({ ...p, [interviewIndex]: e.target.value }))
            }
          />
        </div>
      );
    }
    return null;
  };

  const totalAptitude = aptitudeQuestions.length;
  const totalDsa = practiceDsaQuestions.length;
  const totalInterview = SAMPLE_INTERVIEW_QUESTIONS.length;

  const getTotal = () => {
    if (type === "aptitude") return totalAptitude;
    if (type === "dsa") return totalDsa;
    return totalInterview;
  };
  const getIndex = () => {
    if (type === "aptitude") return aptitudeIndex;
    if (type === "dsa") return dsaIndex;
    return interviewIndex;
  };
  const setIndex = (i: number) => {
    if (type === "aptitude") setAptitudeIndex(i);
    if (type === "dsa") setDsaIndex(i);
    if (type === "interview") setInterviewIndex(i);
  };
  const total = getTotal();
  const index = getIndex();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <DialogTitle>Practice {testName}</DialogTitle>
          </div>
          <DialogDescription>
            Try a few sample questions to get familiar. Your answers are not saved or scored.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {index + 1} / {total}
          </span>
          {index < total - 1 ? (
            <Button size="sm" onClick={() => setIndex(Math.min(total - 1, index + 1))}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done practicing</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
