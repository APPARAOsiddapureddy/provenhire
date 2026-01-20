import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { getSignedResumeUrl } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';

interface ResumeViewButtonProps {
  resumeUrl: string | null | undefined;
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showIcon?: boolean;
  label?: string;
  className?: string;
}

/**
 * A secure button component that generates signed URLs for viewing resumes.
 * This prevents direct access to resume files and ensures proper authorization.
 */
const ResumeViewButton = ({
  resumeUrl,
  variant = 'outline',
  size = 'sm',
  showIcon = true,
  label = 'View Resume',
  className = ''
}: ResumeViewButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!resumeUrl) {
      toast.error('Resume not available');
      return;
    }

    setLoading(true);
    try {
      const signedUrl = await getSignedResumeUrl(resumeUrl, 3600); // 1 hour expiry
      
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not access resume');
      }
    } catch (error) {
      console.error('Error accessing resume:', error);
      toast.error('Failed to access resume');
    } finally {
      setLoading(false);
    }
  };

  if (!resumeUrl) return null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : showIcon ? (
        <FileText className="h-4 w-4 mr-2" />
      ) : null}
      {label}
    </Button>
  );
};

export default ResumeViewButton;
