import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, GraduationCap, Loader2, Lock, Play, Send } from "lucide-react";
import { supportedLanguages, type ProgrammingLanguage } from "@/data/dsaRoundConfig";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
}

type PracticeType = "aptitude" | "dsa" | "interview";

type ApiPracticeDsaQuestion = {
  id: string;
  title: string;
  description: string;
  examples?: unknown;
  constraints?: string[];
  starterCode: Partial<Record<ProgrammingLanguage, string>>;
};

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

const PRACTICE_STARTERS: Record<ProgrammingLanguage, string> = {
  javascript: `// Practice only - write your solution here
function solve(input) {
  const data = input.trim();
  // TODO: parse input and return the answer
  return "";
}

const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
console.log(solve(input));
`,
  python: `# Practice only - write your solution here
import sys

def solve(data: str):
    # TODO: parse input and return the answer
    return ""

if __name__ == "__main__":
    data = sys.stdin.read()
    print(solve(data))
`,
  java: `// Practice only - write your solution here
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder input = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) {
            input.append(line).append('\\n');
        }
        // TODO: parse input and print the answer
        System.out.println("");
    }
}
`,
  cpp: `// Practice only - write your solution here
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // TODO: parse input and print the answer
    return 0;
}
`,
  c: `// Practice only - write your solution here
#include <stdio.h>

int main(void) {
    // TODO: parse input and print the answer
    return 0;
}
`,
};

function starterFor(question: ApiPracticeDsaQuestion, language: ProgrammingLanguage) {
  return (
    question.starterCode?.[language] ??
    PRACTICE_STARTERS[language] ??
    supportedLanguages.find((item) => item.language === language)?.template ??
    ""
  );
}

function examplesToText(examples: unknown) {
  if (!Array.isArray(examples)) return "";
  return examples
    .map((example, index) => {
      const row = example as { input?: unknown; output?: unknown };
      return `Example ${index + 1}\nInput: ${String(row.input ?? "")}\nOutput: ${String(row.output ?? "")}`;
    })
    .join("\n\n");
}

function PracticeActionButton({
  children,
  icon,
  tooltip,
  onClick,
  variant = "outline",
}: {
  children: ReactNode;
  icon: ReactNode;
  tooltip: string;
  onClick: () => void;
  variant?: "default" | "outline";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={variant} onClick={onClick}>
          {icon}
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" sideOffset={8} className="practice-dsa-tooltip">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

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
  const [practiceDsaQuestions, setPracticeDsaQuestions] = useState<ApiPracticeDsaQuestion[]>([]);
  const [dsaIndex, setDsaIndex] = useState(0);
  const [dsaCode, setDsaCode] = useState<Record<string, Partial<Record<ProgrammingLanguage, string>>>>({});
  const [dsaLanguage, setDsaLanguage] = useState<ProgrammingLanguage>("python");
  const [consoleMessage, setConsoleMessage] = useState("Practice only: tests are not executed here.");
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
    if (!open || type !== "dsa") return;
    if (practiceDsaQuestions.length > 0) return;

    setLoading(true);
    api
      .get<ApiPracticeDsaQuestion[]>("/api/verification/dsa/practice-questions")
      .then((res) => {
        const firstTwo = (res ?? []).slice(0, 2);
        setPracticeDsaQuestions(firstTwo);
        setDsaIndex(0);
      })
      .catch(() => {
        setPracticeDsaQuestions([]);
      })
      .finally(() => setLoading(false));
  }, [open, type, practiceDsaQuestions.length]);

  useEffect(() => {
    if (!open || type !== "dsa" || practiceDsaQuestions.length === 0) return;
    setDsaCode((prev) => {
      const next = { ...prev };
      practiceDsaQuestions.forEach((question) => {
        const existing = next[question.id] ?? {};
        const seeded: Partial<Record<ProgrammingLanguage, string>> = { ...existing };
        supportedLanguages.forEach((item) => {
          if (seeded[item.language] == null) seeded[item.language] = starterFor(question, item.language);
        });
        next[question.id] = seeded;
      });
      return next;
    });
  }, [open, type, practiceDsaQuestions]);

  const currentAptitude = aptitudeQuestions[aptitudeIndex];
  const currentDsa = practiceDsaQuestions[dsaIndex];
  const currentInterviewQ = SAMPLE_INTERVIEW_QUESTIONS[interviewIndex];
  const currentDsaCode = currentDsa ? dsaCode[currentDsa.id]?.[dsaLanguage] ?? starterFor(currentDsa, dsaLanguage) : "";
  const examplesText = useMemo(() => examplesToText(currentDsa?.examples), [currentDsa?.examples]);

  const setCurrentDsaCode = (code: string) => {
    if (!currentDsa) return;
    setDsaCode((prev) => ({
      ...prev,
      [currentDsa.id]: {
        ...(prev[currentDsa.id] ?? {}),
        [dsaLanguage]: code,
      },
    }));
  };

  const renderDsaPractice = () => {
    if (loading) {
      return (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    if (practiceDsaQuestions.length === 0 || !currentDsa) {
      return <p className="text-muted-foreground py-4">No practice questions available.</p>;
    }

    const fakeAction = (message: string) => {
      setConsoleMessage(message);
    };

    return (
      <div className="practice-dsa-shell">
        <section className="practice-dsa-question">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--dash-text-muted)]">
                Question {dsaIndex + 1} of {practiceDsaQuestions.length}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-primary)]">{currentDsa.title}</h3>
            </div>
            <span className="rounded-full border border-[var(--dash-navy-border)] bg-white/[0.04] px-3 py-1 text-xs text-[var(--dash-text-secondary)]">
              Practice only
            </span>
          </div>
          <div className="practice-dsa-description">
            {currentDsa.description}
          </div>
          {examplesText ? (
            <pre className="practice-dsa-pre">{examplesText}</pre>
          ) : null}
          {currentDsa.constraints?.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--dash-text-primary)]">Constraints</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dash-text-muted)]">
                {currentDsa.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="practice-dsa-workbench">
          <div className="practice-dsa-toolbar">
            <Select value={dsaLanguage} onValueChange={(v) => setDsaLanguage(v as ProgrammingLanguage)}>
              <SelectTrigger className="w-[160px] border-[var(--dash-navy-border)] bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="practice-dsa-select-content">
                {supportedLanguages.map((l) => (
                  <SelectItem key={l.language} value={l.language} className="practice-dsa-select-item">
                    {l.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PracticeActionButton
              icon={<Play className="mr-2 h-4 w-4" />}
              tooltip="In the real DSA round, this runs visible sample tests. Disabled here because this is UI practice."
              onClick={() => fakeAction("Practice only: Run Tests is disabled in this UI preview.")}
            >
              Run tests
            </PracticeActionButton>
            <PracticeActionButton
              icon={<Lock className="mr-2 h-4 w-4" />}
              tooltip="In the real DSA round, this locks your answer for the current question. Disabled here because this is UI practice."
              onClick={() => fakeAction("Practice only: Submit Question is disabled. Nothing is saved or scored.")}
            >
              Submit Question
            </PracticeActionButton>
            <PracticeActionButton
              icon={<Send className="mr-2 h-4 w-4" />}
              tooltip="In the real DSA round, this submits the full round after all questions. Disabled here because this is UI practice."
              onClick={() => fakeAction("Practice only: Submit Round is disabled. Nothing is saved or scored.")}
              variant="default"
            >
              Submit Round
            </PracticeActionButton>
          </div>

          <CodeEditor
            value={currentDsaCode}
            onChange={setCurrentDsaCode}
            language={dsaLanguage}
            height="420px"
          />

          <div className="practice-dsa-console">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--dash-text-primary)]">Console</span>
              <span className="text-xs text-[var(--dash-text-muted)]">Not scored</span>
            </div>
            <pre>{consoleMessage}</pre>
          </div>
        </section>
      </div>
    );
  };

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

    if (type === "dsa") return renderDsaPractice();

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
  const isDsa = type === "dsa";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isDsa ? "practice-dsa-dialog" : "max-w-2xl max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <DialogTitle>{isDsa ? "Get Familiar with the DSA UI" : `Practice ${testName}`}</DialogTitle>
          </div>
          <DialogDescription>
            {isDsa
              ? "Explore the coding interface. Your code is local to this modal and nothing is saved, run, submitted, or scored."
              : "Try a few sample questions to get familiar. Your answers are not saved or scored."}
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        <div className={isDsa ? "practice-dsa-footer" : "flex items-center justify-between pt-4 border-t"}>
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
            {total > 0 ? `${index + 1} / ${total}` : "0 / 0"}
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
