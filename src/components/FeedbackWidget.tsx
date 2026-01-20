import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { toast } from "sonner";

interface FeedbackWidgetProps {
  context?: string;
  className?: string;
}

const FeedbackWidget = ({ context = "page", className = "" }: FeedbackWidgetProps) => {
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<"helpful" | "confusing" | null>(null);

  const handleFeedback = (type: "helpful" | "confusing") => {
    setFeedback(type);
    setSubmitted(true);
    
    // In a real app, you would send this to analytics
    console.log(`Feedback for ${context}:`, type);
    
    toast.success("Thanks for your feedback!", {
      description: type === "helpful" 
        ? "We're glad this was useful!" 
        : "We'll work on improving this.",
    });
  };

  if (submitted) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Check className="h-4 w-4 text-green-500" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback("helpful")}
          className="gap-1.5 h-8"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Helpful
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback("confusing")}
          className="gap-1.5 h-8"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          Confusing
        </Button>
      </div>
    </div>
  );
};

export default FeedbackWidget;
