/**
 * Role-based Settings page. Renders only the relevant sections for the logged-in role.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSeekerSettings } from "@/components/settings/JobSeekerSettings";
import { RecruiterSettings } from "@/components/settings/RecruiterSettings";
import { InterviewerSettings } from "@/components/settings/InterviewerSettings";
import DashboardShell from "@/components/DashboardShell";
import { api } from "@/lib/api";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";
import { useVerificationGate } from "@/hooks/useVerificationGate";

export default function SettingsPage() {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const { isVerified } = useVerificationGate();
  const [jobSeekerProfile, setJobSeekerProfile] = useState<{ fullName?: string; full_name?: string } | null>(null);
  const [jobSeekerProfileLoading, setJobSeekerProfileLoading] = useState(userRole === "jobseeker");

  useEffect(() => {
    if (userRole !== "jobseeker") {
      setJobSeekerProfile(null);
      setJobSeekerProfileLoading(false);
      return;
    }
    setJobSeekerProfileLoading(true);
    let cancelled = false;
    void api
      .get<{ profile: { fullName?: string; full_name?: string } | null }>("/api/users/job-seeker-profile")
      .then((r) => {
        if (!cancelled) setJobSeekerProfile(r.profile ?? null);
      })
      .catch(() => {
        if (!cancelled) setJobSeekerProfile(null);
      })
      .finally(() => {
        if (!cancelled) setJobSeekerProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  const dashboardPath =
    userRole === "recruiter"
      ? "/dashboard/recruiter"
      : userRole === "expert_interviewer"
        ? "/dashboard/expert"
        : "/dashboard/jobseeker";

  const sidebarSections = [
    {
      sectionLabel: "Settings",
      items: [
        { label: "Settings", to: "/dashboard/settings", active: true, icon: <Settings className="w-[18px] h-[18px]" /> },
        { label: "Back to Dashboard", to: dashboardPath, icon: <ArrowLeft className="w-[18px] h-[18px]" /> },
      ],
    },
  ];

  const shellUser = useMemo(() => {
    if (userRole === "jobseeker") {
      const authFallbackName = user?.name || user?.email?.split("@")[0] || "User";
      const authFallbackInitials = authFallbackName.slice(0, 2).toUpperCase();
      if (jobSeekerProfileLoading) {
        return {
          name: authFallbackName,
          role: isVerified ? "Expert Verified ✦" : "Verification in progress",
          initials: authFallbackInitials,
        };
      }
      const { name, initials } = jobSeekerShellUser(jobSeekerProfile, user);
      return {
        name,
        role: isVerified ? "Expert Verified ✦" : "Verification in progress",
        initials,
      };
    }
    const userName = user?.name || user?.email?.split("@")[0] || "User";
    const roleLabel =
      userRole === "recruiter"
        ? "Recruiter"
        : userRole === "expert_interviewer"
          ? "Interviewer"
          : "Job Seeker";
    return { name: userName, role: roleLabel, initials: userName.slice(0, 2).toUpperCase() };
  }, [userRole, jobSeekerProfile, jobSeekerProfileLoading, user, isVerified]);

  const renderContent = () => {
    if (userRole === "recruiter") return <RecruiterSettings />;
    if (userRole === "expert_interviewer") return <InterviewerSettings />;
    return <JobSeekerSettings />;
  };

  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={shellUser}
        onSignOut={userRole === "jobseeker" ? undefined : signOut}
      >
        <div className="p-6 max-w-3xl">
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate(dashboardPath)} className="text-white/80 hover:text-white mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Settings className="h-7 w-7" />
              Settings
            </h1>
            <p className="text-white/70 mt-1">
              {userRole === "recruiter" && "Manage company profile, hiring preferences, and notifications."}
              {userRole === "expert_interviewer" && "Manage your profile, expertise, and availability."}
              {userRole === "jobseeker" && "Manage profile, career preferences, and account security."}
            </p>
          </div>
          {renderContent()}
        </div>
      </DashboardShell>
    </div>
  );
}
