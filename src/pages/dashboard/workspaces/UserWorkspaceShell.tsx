import { ReactNode } from "react";
import { Briefcase, BrainCircuit, ClipboardList, FileCheck, FileText, LayoutGrid, ListChecks, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardShell, { type DashboardSidebarSection } from "@/components/DashboardShell";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";

export default function UserWorkspaceShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { name, initials } = jobSeekerShellUser(null, user);
  const sidebarSections: DashboardSidebarSection[] = [
    {
      sectionLabel: "Candidate",
      items: [
        { label: "Verification Pipeline", to: "/dashboard/jobseeker", icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
        { label: "Skill Passport", to: "/dashboard/jobseeker", icon: <FileCheck className="w-[18px] h-[18px]" /> },
        { label: "My Resume", to: "/dashboard/jobseeker/resume", icon: <FileText className="w-[18px] h-[18px]" /> },
        { label: "Antigravity Lab", to: "/dashboard/jobseeker/antigravity", icon: <BrainCircuit className="w-[18px] h-[18px]" /> },
        { label: "Job Listings", to: "/jobs", icon: <Briefcase className="w-[18px] h-[18px]" /> },
        { label: "Applications", to: "/dashboard/jobseeker/applications", icon: <ListChecks className="w-[18px] h-[18px]" /> },
        { label: "Workspaces", to: "/dashboard/jobseeker/workspaces", icon: <ClipboardList className="w-[18px] h-[18px]" /> },
        { label: "Settings", to: "/dashboard/settings", icon: <Settings className="w-[18px] h-[18px]" /> },
      ],
    },
  ];

  return (
    <DashboardShell
      sidebarSections={sidebarSections}
      user={{
        name,
        role: "Workspace assessments",
        initials,
      }}
    >
      {children}
    </DashboardShell>
  );
}
