import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { toast } from "sonner";

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

  const downloadProctoringCsv = async () => {
    const token = getAuthToken();
    try {
      const r = await fetch("/api/admin/export-proctoring-events", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("failed");
      const csv = await r.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "provenhire-proctoring-events.csv";
      a.click();
      URL.revokeObjectURL(u);
      toast.success("Proctoring events export downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Proctoring Review</CardTitle>
          <CardDescription>Review flagged verification sessions.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 w-fit" onClick={downloadProctoringCsv}>
          <Download className="h-4 w-4 sm:mr-2" />
          Download CSV
        </Button>
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
