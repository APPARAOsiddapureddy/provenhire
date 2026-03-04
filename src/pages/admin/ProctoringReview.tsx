import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FlaggedTest {
  id: string;
  testType: string;
  severity: string;
  message?: string;
}

const ProctoringReview = () => {
  const [flaggedTests, setFlaggedTests] = useState<FlaggedTest[]>([]);

  useEffect(() => {
    setFlaggedTests([]);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proctoring Review</CardTitle>
        <CardDescription>Review flagged verification sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        {flaggedTests.length === 0 ? (
          <div className="text-sm text-muted-foreground">No flagged sessions available.</div>
        ) : (
          <div className="space-y-2">
            {flaggedTests.map((test) => (
              <div key={test.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">{test.testType}</div>
                  <div className="text-sm text-muted-foreground">{test.message || "Flagged for review"}</div>
                </div>
                <Badge variant="secondary">{test.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProctoringReview;
