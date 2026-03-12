/**
 * Skill Verification Panel - shows validity status and expiry for Aptitude, Live Coding, AI Interview.
 * Used in Job Seeker Dashboard.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

type SkillStatus = {
  status: string;
  completed_at: string | null;
  expires_at: string | null;
  score?: number;
  days_until_expiry?: number;
};

type SkillsResponse = {
  aptitude?: SkillStatus;
  live_coding?: SkillStatus;
  interview?: SkillStatus;
};

const SKILL_LABELS: Record<string, string> = {
  aptitude: "Aptitude Verification",
  live_coding: "Live Coding Verification",
  interview: "AI Interview Verification",
};

export const SkillVerificationPanel = () => {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SkillsResponse>("/api/verification/skills")
      .then((r) => setSkills(r))
      .catch(() => setSkills(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !skills) return null;

  const entries = [
    { key: "aptitude", data: skills.aptitude },
    { key: "live_coding", data: skills.live_coding },
    { key: "interview", data: skills.interview },
  ].filter((e) => e.data);

  if (entries.length === 0) return null;

  return (
    <Card className="border-[var(--dash-navy-border)] bg-white/5">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Skill Verification Status</CardTitle>
        <p className="text-sm text-[var(--dash-text-muted)]">
          Your verifications remain valid for a fixed period. Reattempt after expiry to maintain your status.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.map(({ key, data }) => {
          const isActive = data?.status === "ACTIVE";
          const isExpired = data?.status === "EXPIRED";
          const isPending = data?.status === "PENDING" || !data;
          const label = SKILL_LABELS[key] ?? key;

          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-[var(--dash-navy-border)] p-4 bg-black/20"
            >
              <div className="flex items-center gap-4">
                {isActive && <CheckCircle className="h-6 w-6 text-emerald-500" />}
                {isExpired && <XCircle className="h-6 w-6 text-red-500" />}
                {isPending && <Clock className="h-6 w-6 text-amber-500" />}
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  {isActive && data?.days_until_expiry != null && (
                    <p className="text-sm text-[var(--dash-text-muted)]">
                      Status: Active · Expires in {data.days_until_expiry} days
                    </p>
                  )}
                  {isActive && data?.days_until_expiry == null && data?.expires_at && (
                    <p className="text-sm text-[var(--dash-text-muted)]">
                      Status: Active · Expires {new Date(data.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  {isExpired && (
                    <p className="text-sm text-red-400">Status: Expired</p>
                  )}
                  {isPending && (
                    <p className="text-sm text-[var(--dash-text-muted)]">Not yet completed</p>
                  )}
                </div>
              </div>
              {isExpired && (
                <Button
                  className="dashboard-btn-gold"
                  size="sm"
                  onClick={() => navigate("/verification")}
                >
                  Reattempt Verification
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
