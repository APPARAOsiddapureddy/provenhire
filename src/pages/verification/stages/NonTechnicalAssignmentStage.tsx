import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface NonTechnicalAssignmentStageProps {
  targetJobTitle?: string;
  onComplete: () => void;
}

const ASSIGNMENT_PROMPTS: Record<string, string> = {
  "Product Manager": "Describe a product you would build from scratch. Include: problem statement, target users, key features, and success metrics.",
  "Project Manager": "Walk through how you would plan and execute a 3-month project with a cross-functional team. What tools and methods would you use?",
  "Marketing Manager": "Outline a marketing campaign for launching a new product. Include channels, timeline, and how you would measure ROI.",
  "Content Writer": "Write a 200-word sample blog post introducing a fictional SaaS product to a B2B audience.",
  "HR Manager": "Describe your approach to hiring for a critical role. How would you source, assess, and select candidates?",
  "Business Analyst": "A stakeholder reports declining user engagement. Describe your analysis approach and the questions you would ask.",
  "Sales Manager": "How would you build a sales strategy for a new market? Include pipeline, targets, and team structure.",
  "UX Designer": "Describe your process for redesigning a complex user flow. How do you research, iterate, and validate?",
  "Customer Success Manager": "A key customer threatens to churn. Walk through your response plan step by step.",
  "Operations Manager": "Describe how you would optimize a repeatable operational process. Include metrics and improvement tactics.",
};

const DEFAULT_PROMPT = "Describe your relevant experience and approach for this role. Include 2-3 concrete examples of work you've done (or would do) that align with the job title.";

const NonTechnicalAssignmentStage = ({ targetJobTitle, onComplete }: NonTechnicalAssignmentStageProps) => {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const prompt =
    (targetJobTitle && ASSIGNMENT_PROMPTS[targetJobTitle]) ||
    (targetJobTitle ? DEFAULT_PROMPT : "Based on your target role, describe your relevant experience and approach. Include 2-3 concrete examples.");

  const handleSubmit = async () => {
    if (!response.trim()) {
      toast.error("Please write your response before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/verification/stages/update", {
        stageName: "non_tech_assignment",
        status: "completed",
      });
      toast.success("Assignment submitted. Proceeding to Expert Interview.");
      onComplete();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment: {targetJobTitle || "Your Target Role"}</CardTitle>
        <CardDescription>
          Complete this written assignment based on your target job title. Your response will be reviewed as part of verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground mb-2">Your task</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prompt}</p>
        </div>

        <div className="space-y-2">
          <Label>Your response</Label>
          <Textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response here..."
            rows={12}
            className="resize-y min-h-[200px]"
          />
        </div>

        <Button onClick={handleSubmit} disabled={submitting || !response.trim()}>
          {submitting ? "Submitting..." : "Submit assignment"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default NonTechnicalAssignmentStage;
