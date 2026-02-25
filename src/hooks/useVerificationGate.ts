import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { skipSupabaseRequests } from "@/lib/skipSupabase";

interface VerificationStatus {
  isVerified: boolean;
  isLoading: boolean;
  verificationProgress: number;
  currentStage: string | null;
  /** PRD v4.1: Tech track Stage 5 pass — can apply to premium tech jobs */
  isExpertVerified: boolean;
  /** PRD v4.1: Non-tech Stage 2 pass — can apply to non-technical jobs */
  isNonTechVerified: boolean;
}

export const useVerificationGate = () => {
  const { user, userRole } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>({
    isVerified: false,
    isLoading: true,
    verificationProgress: 0,
    currentStage: null,
    isExpertVerified: false,
    isNonTechVerified: false,
  });

  useEffect(() => {
    if (user && userRole === 'jobseeker') {
      checkVerificationStatus();
    } else {
      setStatus(prev => ({ ...prev, isLoading: false, isVerified: true, isExpertVerified: true, isNonTechVerified: true }));
    }
  }, [user, userRole]);

  const checkVerificationStatus = async () => {
    const FETCH_TIMEOUT_MS = 15000;
    try {
      if (skipSupabaseRequests()) {
        setStatus({
          isVerified: false,
          isLoading: false,
          verificationProgress: 0,
          currentStage: 'profile_setup',
          isExpertVerified: false,
          isNonTechVerified: false,
        });
        return;
      }

      const fetchPromise = Promise.allSettled([
        supabase.from('job_seeker_profiles').select('verification_status, nontech_verified_at').eq('user_id', user?.id).maybeSingle(),
        supabase.from('verification_stages').select('*').eq('user_id', user?.id).order('created_at', { ascending: true }),
        supabase.from('nontech_verification').select('status').eq('user_id', user?.id).maybeSingle(),
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Verification check timed out')), FETCH_TIMEOUT_MS)
      );
      const [profileRes, stagesRes, nontechRes] = (await Promise.race([fetchPromise, timeoutPromise])) as PromiseSettledResult<{ data: unknown }>[];

      const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
      const stages = stagesRes.status === 'fulfilled' ? stagesRes.value.data : null;
      const nontech = nontechRes.status === 'fulfilled' ? nontechRes.value.data : null;

      const isExpertVerified = profile?.verification_status === 'expert_verified' || profile?.verification_status === 'verified';
      const isNonTechVerified = nontech?.status === 'nontech_verified' || !!(profile as { nontech_verified_at?: string } | null)?.nontech_verified_at;
      const isVerified = isExpertVerified || isNonTechVerified;
      
      let progress = 0;
      let currentStage: string | null = null;
      
      if (stages && stages.length > 0) {
        const completed = stages.filter(s => s.status === 'completed').length;
        progress = (completed / 5) * 100;
        
        const inProgress = stages.find(s => s.status === 'in_progress');
        currentStage = inProgress?.stage_name || 
          (completed === 0 ? 'profile_setup' : 
           completed === 5 ? 'completed' : stages[completed]?.stage_name);
      }

      setStatus({
        isVerified,
        isLoading: false,
        verificationProgress: progress,
        currentStage,
        isExpertVerified,
        isNonTechVerified,
      });
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus(prev => ({ ...prev, isLoading: false, isExpertVerified: false, isNonTechVerified: false }));
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
