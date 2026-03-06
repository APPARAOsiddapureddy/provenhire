import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface VerificationStatus {
  isVerified: boolean;
  isLoading: boolean;
  verificationProgress: number;
  currentStage: string | null;
  /** PRD v4.1: Tech track Stage 5 pass — can apply to premium tech jobs */
  isExpertVerified: boolean;
  /** PRD v4.1: Non-tech Stage 2 pass — can apply to non-technical jobs */
  isNonTechVerified: boolean;
  /** Completed DSA (tech) or Assignment (non-tech) — can access jobs < 8 LPA */
  hasCompletedDsaOrEquivalent: boolean;
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
    hasCompletedDsaOrEquivalent: false,
  });

  useEffect(() => {
    if (user && userRole === 'jobseeker') {
      checkVerificationStatus();
    } else {
      setStatus(prev => ({ ...prev, isLoading: false, isVerified: true, isExpertVerified: true, isNonTechVerified: true, hasCompletedDsaOrEquivalent: true }));
    }
  }, [user, userRole]);

  const checkVerificationStatus = async () => {
    const FETCH_TIMEOUT_MS = 15000;
    try {
      const fetchPromise = Promise.allSettled([
        api.get<{ profile: any }>("/api/users/job-seeker-profile"),
        api.get<{ stages: any[] }>("/api/verification/stages"),
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Verification check timed out')), FETCH_TIMEOUT_MS)
      );
      const [profileRes, stagesRes] = (await Promise.race([fetchPromise, timeoutPromise])) as PromiseSettledResult<{ profile?: any; stages?: any[] }>[];

      const profile = profileRes.status === 'fulfilled' ? profileRes.value.profile : null;
      const stages = stagesRes.status === 'fulfilled' ? stagesRes.value.stages : null;

      const roleType = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
      const isExpertVerified = profile?.verificationStatus === 'expert_verified' || profile?.verificationStatus === 'verified';
      const isNonTechVerified = roleType === 'non_technical' && isExpertVerified;
      const isVerified = isExpertVerified || isNonTechVerified;

      const completedStages = stages?.filter((s: { status?: string }) => s.status === 'completed') ?? [];
      const hasCompletedDsaOrEquivalent = roleType === 'technical'
        ? completedStages.some((s: { stage_name?: string }) => s.stage_name === 'dsa_round')
        : completedStages.some((s: { stage_name?: string }) => s.stage_name === 'non_tech_assignment');
      
      const totalStages = roleType === 'non_technical' ? 3 : 5;
      let progress = 0;
      let currentStage: string | null = null;
      
      if (stages && stages.length > 0) {
        const completed = stages.filter(s => s.status === 'completed').length;
        progress = (completed / totalStages) * 100;
        
        const inProgress = stages.find(s => s.status === 'in_progress');
        currentStage = inProgress?.stage_name || 
          (completed === 0 ? 'profile_setup' : 
           completed >= totalStages ? 'completed' : stages[completed]?.stage_name);
      }

      setStatus({
        isVerified,
        isLoading: false,
        verificationProgress: progress,
        currentStage,
        isExpertVerified,
        isNonTechVerified,
        hasCompletedDsaOrEquivalent: Boolean(hasCompletedDsaOrEquivalent),
      });
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus(prev => ({ ...prev, isLoading: false, isExpertVerified: false, isNonTechVerified: false, hasCompletedDsaOrEquivalent: false }));
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
