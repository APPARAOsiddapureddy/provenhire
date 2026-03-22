import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const AIInterviewReview = () => {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>AI Interview Review</CardTitle>
          <CardDescription>Review AI interview sessions and scores.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 w-fit" disabled title="Export will be available when interview rows are listed here.">
          <Download className="h-4 w-4 sm:mr-2" />
          Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">No interviews available.</div>
      </CardContent>
    </Card>
  );
};

export default AIInterviewReview;
