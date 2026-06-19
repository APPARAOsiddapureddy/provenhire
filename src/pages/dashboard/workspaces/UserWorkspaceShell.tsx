import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/DashboardShell";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection } from "@/utils/jobSeekerSidebar";
import { useJobSeekerShellIdentity } from "@/hooks/useJobSeekerShellIdentity";

export default function UserWorkspaceShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { shellUser } = useJobSeekerShellIdentity();
  const sidebarSections = buildJobSeekerSidebarSections({
    activeItem: "workspaces",
    onDashboardSection: (section: JobSeekerDashboardSection) => {
      navigate("/dashboard/jobseeker", { state: { section } });
    },
  });

  return (
    <DashboardShell
      sidebarSections={sidebarSections}
      user={shellUser}
    >
      {children}
    </DashboardShell>
  );
}
