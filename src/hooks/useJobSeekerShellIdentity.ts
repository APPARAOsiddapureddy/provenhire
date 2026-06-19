import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { jobSeekerShellUser, type JobSeekerProfileLike } from "@/utils/jobSeekerIdentity";

type UseJobSeekerShellIdentityOptions = {
  enabled?: boolean;
  role?: string;
  verifiedRole?: string;
  isVerified?: boolean;
};

export function useJobSeekerShellIdentity({
  enabled = true,
  role = "Building verified proof",
  verifiedRole = "Expert Verified",
  isVerified = false,
}: UseJobSeekerShellIdentityOptions = {}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<JobSeekerProfileLike>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .get<{ profile: JobSeekerProfileLike }>("/api/users/job-seeker-profile")
      .then((res) => {
        if (!cancelled) setProfile(res.profile ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, user]);

  const shellUser = useMemo(() => {
    const { name, initials } = jobSeekerShellUser(profile, user);
    return {
      name,
      initials,
      role: isVerified ? verifiedRole : role,
    };
  }, [profile, user, isVerified, role, verifiedRole]);

  return { shellUser, profile, loading };
}
