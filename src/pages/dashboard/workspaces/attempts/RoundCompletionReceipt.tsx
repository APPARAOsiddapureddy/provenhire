import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function RoundCompletionReceipt({
  workspaceCode,
  score,
  reportModule,
}: {
  workspaceCode: string;
  score: number;
  reportModule: "aptitude" | "coding" | "sql";
}) {
  const assessmentPath = `/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`;

  return (
    <Card className="border-emerald-400/30 bg-emerald-400/10">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-emerald-50">Round submitted</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-100/80">
              Your answers are saved. Your score is {Math.round(score)}%. You can return to the assessment or review the feedback available so far.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={assessmentPath}>Back to assessment</Link>
          </Button>
          <Button asChild>
            <Link to={`${assessmentPath}/reports?module=${reportModule}`}>View feedback</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
