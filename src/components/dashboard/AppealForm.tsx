import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Scale, 
  Send, 
  AlertCircle,
  CheckCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface AppealFormProps {
  testId: string;
  testType: 'aptitude' | 'dsa';
  onSuccess?: () => void;
}

const AppealForm = ({ testId, testType, onSuccess }: AppealFormProps) => {
  const { user } = useAuth();
  const [appealReason, setAppealReason] = useState("");
  const [supportingEvidence, setSupportingEvidence] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('You must be logged in to submit an appeal');
      return;
    }

    if (!appealReason.trim()) {
      toast.error('Please provide a reason for your appeal');
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/appeals", {
        testId,
        testType,
        appealReason,
        supportingEvidence,
        evidenceUrl,
      });

      toast.success('Appeal submitted successfully');
      setSubmitted(true);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting appeal:', error);
      toast.error('Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Appeal Submitted</h3>
            <p className="text-muted-foreground">
              Your appeal has been submitted and is under review.
              You will be notified once a decision is made.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Submit an Appeal
        </CardTitle>
        <CardDescription>
          Contest your {testType === 'aptitude' ? 'Aptitude Test' : 'DSA Round'} invalidation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            If you believe your test was invalidated in error, you can submit an appeal.
            Please provide a clear explanation and any supporting evidence.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appealReason">
              Why should your test be reinstated? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="appealReason"
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Explain why you believe the invalidation was incorrect. Be specific about any technical issues, environmental factors, or other circumstances..."
              rows={5}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supportingEvidence">
              Additional Supporting Information (Optional)
            </Label>
            <Textarea
              id="supportingEvidence"
              value={supportingEvidence}
              onChange={(e) => setSupportingEvidence(e.target.value)}
              placeholder="Any additional details that might support your case..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidenceUrl">
              Link to Evidence (Optional)
            </Label>
            <Input
              id="evidenceUrl"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              Link to screenshots, screen recordings, or other evidence supporting your appeal
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Appeal
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AppealForm;
