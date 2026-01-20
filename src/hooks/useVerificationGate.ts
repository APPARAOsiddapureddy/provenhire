import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface VerificationStatus {
  isVerified: boolean;
  isLoading: boolean;
  verificationProgress: number;
  currentStage: string | null;
}

export const useVerificationGate = () => {
  const { user, userRole } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>({
    isVerified: false,
    isLoading: true,
    verificationProgress: 0,
    currentStage: null,
  });

  useEffect(() => {
    if (user && userRole === 'jobseeker') {
      checkVerificationStatus();
    } else {
      setStatus(prev => ({ ...prev, isLoading: false, isVerified: true }));
    }
  }, [user, userRole]);

  const checkVerificationStatus = async () => {
    try {
      const { data: profile } = await supabase
        .from('job_seeker_profiles')
        .select('verification_status')
        .eq('user_id', user?.id)
        .maybeSingle();

      const { data: stages } = await supabase
        .from('verification_stages')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true });

      const isVerified = profile?.verification_status === 'verified';
      
      let progress = 0;
      let currentStage = null;
      
      if (stages && stages.length > 0) {
        const completed = stages.filter(s => s.status === 'completed').length;
        progress = (completed / 4) * 100;
        
        const inProgress = stages.find(s => s.status === 'in_progress');
        currentStage = inProgress?.stage_name || 
          (completed === 0 ? 'profile_setup' : 
           completed === 4 ? 'completed' : stages[completed]?.stage_name);
      }

      setStatus({
        isVerified,
        isLoading: false,
        verificationProgress: progress,
        currentStage,
      });
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  const requiresVerification = useCallback(() => {
    return userRole === 'jobseeker' && !status.isVerified;
  }, [userRole, status.isVerified]);

  return {
    ...status,
    requiresVerification,
    refetch: checkVerificationStatus,
  };
};
