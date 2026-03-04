import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AIInterviewReview = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Interview Review</CardTitle>
        <CardDescription>Review AI interview sessions and scores.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">No interviews available.</div>
      </CardContent>
    </Card>
  );
};

export default AIInterviewReview;
