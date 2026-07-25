import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Institution = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  status: "pending" | "approved" | "suspended";
  website: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  affiliation: string | null;
  aicteCode: string | null;
  naacGrade: string | null;
  studentCount: number | null;
  placementCellHead: string | null;
  phone: string | null;
  logoUrl: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type InstitutionMe = {
  institution: Institution;
  membership: { role: "owner" | "manager" | "reviewer" };
  canPublishDrives: boolean;
};

/// Loads the caller's own institution. The endpoint is tenant-scoped server
/// side, so there is no institution id to pass or to get wrong here.
export function useInstitution() {
  const [data, setData] = useState<InstitutionMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<InstitutionMe>("/api/institutions/me"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your institution.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    institution: data?.institution ?? null,
    membership: data?.membership ?? null,
    canPublishDrives: data?.canPublishDrives ?? false,
    loading,
    error,
    refetch,
  };
}
