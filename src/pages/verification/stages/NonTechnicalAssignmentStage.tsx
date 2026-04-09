import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Clock, Upload } from "lucide-react";

interface NonTechnicalAssignmentStageProps {
  targetJobTitle?: string;
  stageStatus?: string;
  stageScore?: number;
  isRetry?: boolean;
  onComplete: () => void;
  onRetry?: () => void;
  onPaywallRequired?: (
    stage: string,
    pricing: { singleInr: number; bundleInr: number },
    cooldown: Date | null
  ) => void;
}

interface AssignmentEvaluation {
  score: number;
  qualified: boolean;
  threshold: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
}

interface PromptPayload {
  prompt: string;
  threshold: number;
  timeLimitMinutes?: number;
  subtrack?: string;
  experienceTier?: string;
  issuedAt?: string;
  deadline?: string;
  hoursRemaining?: number;
  acceptedFormats?: string[];
  maxFileSizeMB?: number;
  error?: string;
  message?: string;
}

function deadlineBannerTone(hoursRemaining: number): string {
  if (hoursRemaining <= 6) return "border-red-500/60 bg-red-500/10 text-red-900 dark:text-red-100";
  if (hoursRemaining <= 24) return "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  return "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
}

const NonTechnicalAssignmentStage = ({
  targetJobTitle,
  stageStatus = "in_progress",
  stageScore,
  isRetry = false,
  onComplete,
  onRetry,
  onPaywallRequired,
}: NonTechnicalAssignmentStageProps) => {
  const navigate = useNavigate();
  const submittingRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assignmentJustSubmitted, setAssignmentJustSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<AssignmentEvaluation | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [passThreshold, setPassThreshold] = useState(60);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [expiredDeadline, setExpiredDeadline] = useState<string | null>(null);
  const [subtrackLabel, setSubtrackLabel] = useState<string>("");
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);

  const isFailed = stageStatus === "failed" || (assignmentJustSubmitted && evaluation && !evaluation.qualified);
  const displayScore = evaluation?.score ?? stageScore ?? 0;

  const refreshHoursRemaining = useCallback(() => {
    if (!deadline) return;
    const remaining = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    setHoursRemaining(Math.max(0, Math.round(remaining * 10) / 10));
  }, [deadline]);

  useEffect(() => {
    if (!deadline) return;
    refreshHoursRemaining();
    const interval = globalThis.setInterval(refreshHoursRemaining, 60_000);
    return () => globalThis.clearInterval(interval);
  }, [deadline, refreshHoursRemaining]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<PromptPayload>("/api/verification/non-tech-assignment/prompt")
      .then((r) => {
        if (cancelled) return;
        setPromptError(null);
        setExpiredDeadline(null);
        setPrompt(r.prompt ?? "");
        setPassThreshold(r.threshold ?? 60);
        if (r.deadline) setDeadline(new Date(r.deadline));
        if (typeof r.hoursRemaining === "number") setHoursRemaining(r.hoursRemaining);
        if (r.subtrack) setSubtrackLabel(r.subtrack);
      })
      .catch((err: Error & { response?: { data?: Record<string, unknown> }; status?: number }) => {
        if (cancelled) return;
        const data = err.response?.data as Record<string, unknown> | undefined;
        const code = typeof data?.error === "string" ? data.error : "";
        if (code === "assignment_expired") {
          const d = typeof data?.deadline === "string" ? data.deadline : null;
          setExpiredDeadline(d);
          setPromptError(
            typeof data?.message === "string"
              ? data.message
              : "Your assignment window has closed."
          );
          return;
        }
        setPromptError("Could not load your assignment prompt. Refresh the page or try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [targetJobTitle, isRetry]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (!allowed.has(file.type)) {
      toast.error("Please upload a PDF or Word document (.pdf or .docx).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB.");
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("Your assignment prompt is still loading. Please wait.");
      return;
    }
    if (!selectedFile) {
      toast.error("Please select your assignment document first.");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("document", selectedFile);
      const evalResult = await api.post<AssignmentEvaluation & { feedback?: string }>(
        "/api/verification/non-tech-assignment/submit",
        formData
      );
      setEvaluation(evalResult);
      if (evalResult.qualified) {
        toast.success(`Assignment scored ${evalResult.score}/100. You can start the AI Expert Interview.`);
      } else {
        toast.error(
          `Assignment scored ${evalResult.score}/100. Minimum ${evalResult.threshold}/100 required to continue.`
        );
      }
      setAssignmentJustSubmitted(true);
    } catch (error: unknown) {
      const err = error as Error & { status?: number; response?: { data?: Record<string, unknown> } };
      const data = err.response?.data;
      const code = typeof data?.code === "string" ? data.code : "";
      const msg = (typeof data?.error === "string" ? data.error : err.message) || "Failed to submit assignment.";
      if (err.status === 402 && (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") && onPaywallRequired) {
        const pricing = data?.pricing as { singleInr?: number; bundleInr?: number } | undefined;
        const nextRaw = data?.nextAvailableAt;
        const nextAt =
          typeof nextRaw === "string" || nextRaw instanceof Date ? new Date(nextRaw as string) : null;
        onPaywallRequired(
          "non_tech_assignment",
          {
            singleInr: typeof pricing?.singleInr === "number" ? pricing.singleInr : 299,
            bundleInr: typeof pricing?.bundleInr === "number" ? pricing.bundleInr : 499,
          },
          nextAt && !Number.isNaN(nextAt.getTime()) ? nextAt : null
        );
        toast.error(
          code === "COOLDOWN"
            ? "Retake cooldown is still active — see payment window for the unlock time."
            : (err.message ?? "A paid retake credit is required for further attempts.")
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setUploading(false);
      submittingRef.current = false;
    }
  };

  if (stageStatus === "failed" && !assignmentJustSubmitted) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet qualified</p>
            <p className="text-sm text-muted-foreground">
              Your score: {displayScore}/100. Minimum {passThreshold} required to unlock the AI Expert Interview.
            </p>
            {onRetry ? (
              <Button onClick={onRetry} className="mt-2">
                Retry Assignment
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Return to the dashboard and come back when you&apos;re ready to retry.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (promptError && expiredDeadline) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment window closed</CardTitle>
          <CardDescription>
            The deadline was{" "}
            {new Date(expiredDeadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{promptError}</p>
          <p className="text-sm text-muted-foreground">
            Please contact support if you believe this is an error.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (promptError && !prompt) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive text-center">{promptError}</p>
        </CardContent>
      </Card>
    );
  }

  const fmtDeadline =
    deadline != null
      ? deadline.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : null;
  const hr = hoursRemaining ?? 0;
  const bannerClass = deadlineBannerTone(hr);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Assignment</CardTitle>
        <CardDescription>
          {subtrackLabel ? (
            <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize">
              {subtrackLabel.replace(/_/g, " ")}
            </span>
          ) : null}
          {subtrackLabel ? " · " : ""}
          Complete your written assignment and upload a PDF or Word document. Need {passThreshold}/100 to pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {deadline != null && fmtDeadline && !assignmentJustSubmitted && (
          <div className={`rounded-lg border p-4 flex flex-wrap items-start gap-3 ${bannerClass}`}>
            <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold">Submit before: {fmtDeadline}</p>
              <p className="text-sm opacity-90">
                Time remaining:{" "}
                {hr >= 24
                  ? `${Math.floor(hr / 24)}d ${Math.round(hr % 24)}h`
                  : `${Math.floor(hr)}h ${Math.round((hr % 1) * 60)}m`}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Your task</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{prompt}</p>
        </div>

        {!assignmentJustSubmitted && (
          <>
            <div className="rounded-lg border bg-background/50 p-4 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Instructions</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Prepare your response in a document (Word or PDF).</li>
                <li>You may use any tools, resources, or references.</li>
                <li>Save your document and upload it below when ready.</li>
                <li>Maximum file size: 10MB. Accepted: PDF, .docx, .doc.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignment-file">Upload document</Label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Input
                  id="assignment-file"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
              </div>
              {selectedFile ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Choose a file or drag-and-drop (browser dependent).
                </p>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={uploading || !selectedFile}>
              {uploading ? "Submitting…" : "Submit Assignment"}
            </Button>

            <p className="text-xs text-muted-foreground">
              Once submitted, you cannot re-upload. Ensure your document is complete before submitting.
            </p>
          </>
        )}

        {assignmentJustSubmitted && (
          <div className="mt-2 p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Assignment evaluated by AI</h3>
            <p className="text-sm text-muted-foreground">
              Score: <span className="font-semibold text-foreground">{evaluation?.score ?? 0}/100</span> (minimum{" "}
              {evaluation?.threshold ?? 60}/100)
            </p>
            <p className={`text-sm font-medium ${evaluation?.qualified ? "text-emerald-600" : "text-amber-600"}`}>
              {evaluation?.qualified
                ? "Qualified — continue to the AI Expert Interview."
                : "Not qualified yet. Improve your response and retry (your first retake is free after 24 hours)."}
            </p>
            {evaluation?.summary && (
              <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
            )}
            {!!evaluation?.strengths?.length && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Strengths:</span> {evaluation.strengths.join(", ")}
              </div>
            )}
            {!!evaluation?.gaps?.length && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Improvement areas:</span> {evaluation.gaps.join(", ")}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              {evaluation?.qualified ? (
                <Button onClick={() => onComplete()}>Continue to AI Expert Interview</Button>
              ) : (
                <Button variant="secondary" onClick={() => onRetry?.()}>
                  Retry Assignment
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NonTechnicalAssignmentStage;
