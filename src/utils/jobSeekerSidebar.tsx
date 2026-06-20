import { Briefcase, ClipboardList, FileCheck, FileText, LayoutGrid, ListChecks, Settings } from "lucide-react";
import type { DashboardSidebarSection } from "@/components/DashboardShell";

export type JobSeekerSidebarActiveItem =
  | "verification"
  | "passport"
  | "resume"
  | "antigravity"
  | "jobs"
  | "applications"
  | "workspaces"
  | "settings";

export type JobSeekerDashboardSection = "candidate" | "passport" | "resume" | "applications";

type JobSeekerSidebarOptions = {
  activeItem?: JobSeekerSidebarActiveItem;
  isVerified?: boolean;
  onDashboardSection?: (section: JobSeekerDashboardSection) => void;
};

function dashboardTarget(
  section: JobSeekerDashboardSection,
  onDashboardSection?: (section: JobSeekerDashboardSection) => void,
) {
  if (onDashboardSection) {
    return { onClick: () => onDashboardSection(section) };
  }
  return { to: "/dashboard/jobseeker" };
}

export function buildJobSeekerSidebarSections({
  activeItem,
  isVerified = false,
  onDashboardSection,
}: JobSeekerSidebarOptions = {}): DashboardSidebarSection[] {
  return [
    {
      sectionLabel: "Candidate",
      items: [
        {
          label: "Verification Pipeline",
          ...dashboardTarget("candidate", onDashboardSection),
          active: activeItem === "verification",
          icon: <LayoutGrid className="w-[18px] h-[18px]" />,
        },
        {
          label: "Skill Passport",
          ...dashboardTarget("passport", onDashboardSection),
          active: activeItem === "passport",
          badge: isVerified ? "Active" : undefined,
          icon: <FileCheck className="w-[18px] h-[18px]" />,
        },
        {
          label: "My Resume",
          ...dashboardTarget("resume", onDashboardSection),
          active: activeItem === "resume",
          icon: <FileText className="w-[18px] h-[18px]" />,
        },
        {
          label: "Job Listings",
          to: "/jobs",
          active: activeItem === "jobs",
          icon: <Briefcase className="w-[18px] h-[18px]" />,
        },
        {
          label: "Applications",
          ...dashboardTarget("applications", onDashboardSection),
          active: activeItem === "applications",
          icon: <ListChecks className="w-[18px] h-[18px]" />,
        },
        {
          label: "Workspaces",
          to: "/dashboard/jobseeker/workspaces",
          active: activeItem === "workspaces",
          icon: <ClipboardList className="w-[18px] h-[18px]" />,
        },
        {
          label: "Settings",
          to: "/dashboard/settings",
          active: activeItem === "settings",
          icon: <Settings className="w-[18px] h-[18px]" />,
        },
      ],
    },
  ];
}
