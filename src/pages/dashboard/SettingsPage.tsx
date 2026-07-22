/**
 * Role-based Settings page. Renders only the relevant sections for the logged-in role.
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSeekerSettings } from "@/components/settings/JobSeekerSettings";
import { RecruiterSettings } from "@/components/settings/RecruiterSettings";
import { InterviewerSettings } from "@/components/settings/InterviewerSettings";
import DashboardShell from "@/components/DashboardShell";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection } from "@/utils/jobSeekerSidebar";
import { buildRecruiterSidebarSections } from "@/utils/recruiterSidebar";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import { useJobSeekerShellIdentity } from "@/hooks/useJobSeekerShellIdentity";
import { useJobSeekerWorkspaceMembership } from "@/hooks/useJobSeekerWorkspaceMembership";

export default function SettingsPage() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { isVerified } = useVerificationGate();
  const { shellUser: candidateShellUser } = useJobSeekerShellIdentity({
    enabled: userRole === "jobseeker",
    isVerified,
  });
  const { hasWorkspace, workspaceName } = useJobSeekerWorkspaceMembership();

  const dashboardPath =
    userRole === "recruiter"
      ? "/dashboard/recruiter"
      : userRole === "expert_interviewer"
        ? "/dashboard/expert"
        : "/dashboard/jobseeker";

  const sidebarSections =
    userRole === "jobseeker"
      ? buildJobSeekerSidebarSections({
          activeItem: "settings",
          isVerified,
          hasWorkspace,
          workspaceName,
          onDashboardSection: (section: JobSeekerDashboardSection) => {
            navigate("/dashboard/jobseeker", { state: { section } });
          },
        })
      : userRole === "recruiter"
        ? buildRecruiterSidebarSections({ activeItem: "settings" })
        : [
           {
             sectionLabel: "Settings",
             items: [
               { label: "Settings", to: "/dashboard/settings", active: true, icon: <Settings className="w-[18px] h-[18px]" /> },
               { label: "Back to Dashboard", to: dashboardPath, icon: <ArrowLeft className="w-[18px] h-[18px]" /> },
             ],
           },
          ];

  const shellUser = useMemo(() => {
    if (userRole === "jobseeker") return candidateShellUser;
    const userName = user?.name || user?.email?.split("@")[0] || "User";
    const roleLabel =
      userRole === "recruiter"
        ? "Recruiter"
        : userRole === "expert_interviewer"
          ? "Interviewer"
          : "Job Seeker";
    return { name: userName, role: roleLabel, initials: userName.slice(0, 2).toUpperCase() };
  }, [userRole, candidateShellUser, user]);

  const renderContent = () => {
    if (userRole === "recruiter") return <RecruiterSettings />;
    if (userRole === "expert_interviewer") return <InterviewerSettings />;
    return <JobSeekerSettings />;
  };

  return (
    <div className="min-h-screen">
      <DashboardShell sidebarSections={sidebarSections} user={shellUser} onSignOut={undefined}>
        <div className="settings-page">
          <div className="settings-page-header">
            {userRole === "expert_interviewer" && (
              <Button variant="ghost" size="sm" onClick={() => navigate(dashboardPath)} className="text-white/80 hover:text-white mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Settings className="h-7 w-7 text-[var(--dash-gold)]" />
                Settings
              </h1>
              <p className="text-white/70 mt-1">
                {userRole === "recruiter" && "Manage company profile, hiring preferences, and notifications."}
                {userRole === "expert_interviewer" && "Manage your profile, expertise, and availability."}
                {userRole === "jobseeker" && "Manage profile, career preferences, and account security."}
              </p>
            </div>
          </div>
          {renderContent()}
        </div>
      </DashboardShell>
    </div>
  );
}
