/**
 * Role-based Settings page. Renders only the relevant sections for the logged-in role.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSeekerSettings } from "@/components/settings/JobSeekerSettings";
import { RecruiterSettings } from "@/components/settings/RecruiterSettings";
import { InterviewerSettings } from "@/components/settings/InterviewerSettings";
import DashboardShell from "@/components/DashboardShell";

export default function SettingsPage() {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();

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

  const userName = user?.name || user?.email?.split("@")[0] || "User";
  const roleLabel =
    userRole === "recruiter"
      ? "Recruiter"
      : userRole === "expert_interviewer"
        ? "Interviewer"
        : "Job Seeker";
  const initials = userName.slice(0, 2).toUpperCase();

  const renderContent = () => {
    if (userRole === "recruiter") return <RecruiterSettings />;
    if (userRole === "expert_interviewer") return <InterviewerSettings />;
    return <JobSeekerSettings />;
  };

  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: userName, role: roleLabel, initials }}
        onSignOut={signOut}
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
