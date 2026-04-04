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
  certificationLevel: number;
  certificationLabel: string;
}

async function fetchVerificationGateState(): Promise<Omit<VerificationStatus, "isLoading">> {
  const FETCH_TIMEOUT_MS = 15000;
  const fetchPromise = Promise.allSettled([
    api.get<{ profile: any }>("/api/users/job-seeker-profile"),
    api.get<{ stages: any[]; certification_level?: number; certification_label?: string }>("/api/verification/stages"),
  ]);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Verification check timed out")), FETCH_TIMEOUT_MS)
  );
  const [profileRes, stagesRes] = (await Promise.race([fetchPromise, timeoutPromise])) as PromiseSettledResult<{
    profile?: any;
    stages?: any[];
  }>[];

  const profile = profileRes.status === "fulfilled" ? profileRes.value.profile : null;
  const stages = stagesRes.status === "fulfilled" ? stagesRes.value.stages : null;
  const certificationLevel = stagesRes.status === "fulfilled" ? (stagesRes.value.certification_level ?? 0) : 0;
  const certificationLabel =
    stagesRes.status === "fulfilled"
      ? (stagesRes.value.certification_label ?? "Level 0 - Not Yet Certified")
      : "Level 0 - Not Yet Certified";

  const roleType = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
  /** True L3 (tech) / L2 (non-tech) or DB expert_verified — not plain `verified`, which includes L1 after sync. */
  const isExpertVerified =
    certificationLevel >= (roleType === "technical" ? 3 : 2) ||
    profile?.verificationStatus === "expert_verified";
  const isNonTechVerified = roleType === "non_technical" && certificationLevel >= 1;
  const isVerified = certificationLevel >= 1 || isExpertVerified || isNonTechVerified;

  const completedStages = stages?.filter((s: { status?: string }) => s.status === "completed") ?? [];
  const hasCompletedDsaOrEquivalent =
    roleType === "technical"
      ? completedStages.some((s: { stage_name?: string }) => s.stage_name === "dsa_round")
      : completedStages.some((s: { stage_name?: string }) => s.stage_name === "non_tech_assignment");

  const totalStages = roleType === "non_technical" ? 3 : 5;
  let progress = 0;
  let currentStage: string | null = null;

  if (stages && stages.length > 0) {
    const completed = stages.filter((s) => s.status === "completed").length;
    progress = (completed / totalStages) * 100;

    const inProgress = stages.find((s) => s.status === "in_progress");
    currentStage =
      inProgress?.stage_name ||
      (completed === 0 ? "profile_setup" : completed >= totalStages ? "completed" : stages[completed]?.stage_name);
  }

  return {
    isVerified,
    verificationProgress: progress,
    currentStage,
    isExpertVerified,
    isNonTechVerified,
    hasCompletedDsaOrEquivalent: Boolean(hasCompletedDsaOrEquivalent),
    certificationLevel,
    certificationLabel,
  };
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
    certificationLevel: 0,
    certificationLabel: "Level 0 - Not Yet Certified",
  });

  useEffect(() => {
    let cancelled = false;
    if (user && userRole === "jobseeker") {
      void (async () => {
        try {
          const next = await fetchVerificationGateState();
          if (cancelled) return;
          setStatus({ ...next, isLoading: false });
        } catch (error) {
          if (cancelled) return;
          console.error("Error checking verification status:", error);
          setStatus((prev) => ({
            ...prev,
            isLoading: false,
            isExpertVerified: false,
            isNonTechVerified: false,
            hasCompletedDsaOrEquivalent: false,
            certificationLevel: 0,
            certificationLabel: "Level 0 - Not Yet Certified",
          }));
        }
      })();
    } else {
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        isVerified: true,
        isExpertVerified: true,
        isNonTechVerified: true,
        hasCompletedDsaOrEquivalent: true,
        certificationLevel: 3,
        certificationLabel: "Level 3 - Elite ProvenHire Candidate",
      }));
    }
    return () => {
      cancelled = true;
    };
  }, [user, userRole]);

  const checkVerificationStatus = useCallback(async () => {
    try {
      const next = await fetchVerificationGateState();
      setStatus({ ...next, isLoading: false });
    } catch (error) {
      console.error("Error checking verification status:", error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        isExpertVerified: false,
        isNonTechVerified: false,
        hasCompletedDsaOrEquivalent: false,
        certificationLevel: 0,
        certificationLabel: "Level 0 - Not Yet Certified",
      }));
    }
  }, []);

  const requiresVerification = useCallback(() => {
    return userRole === "jobseeker" && !status.isVerified;
  }, [userRole, status.isVerified]);

  return {
    ...status,
    requiresVerification,
    refetch: checkVerificationStatus,
  };
};
