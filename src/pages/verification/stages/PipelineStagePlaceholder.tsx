import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PipelineStagePlaceholderProps {
  title: string;
  description: string;
  bulletPoints?: string[];
  onBackToDashboard?: () => void;
}

/**
 * Full AI Skills / System Design flows ship separately; shows PRD-aligned copy until those surfaces are wired.
 */
export default function PipelineStagePlaceholder({
  title,
  description,
  bulletPoints = [],
  onBackToDashboard,
}: PipelineStagePlaceholderProps) {
  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        {bulletPoints.length > 0 ? (
          <ul className="list-disc list-inside space-y-1">
            {bulletPoints.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        <p>
          This assessment is coming soon. You will be notified when it becomes available. In the meantime, continue with other available stages or return to your dashboard.
        </p>
        {onBackToDashboard ? (
          <Button variant="outline" onClick={onBackToDashboard}>
            Back to dashboard
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
