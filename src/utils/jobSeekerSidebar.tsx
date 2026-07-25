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
  /// True once this candidate has joined at least one workspace. Their whole
  /// ProvenHire experience is usually that employer's assessment, so the
  /// workspace nav leads instead of being buried inside the general list.
  hasWorkspace?: boolean;
  /// Only when there's exactly one active workspace - used to label the
  /// workspace nav item with its name instead of a generic "Workspace".
  workspaceName?: string | null;
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
  hasWorkspace = false,
  workspaceName,
}: JobSeekerSidebarOptions = {}): DashboardSidebarSection[] {
  const workspaceItem = {
    label: workspaceName ? workspaceName : "My Workspace",
    to: "/dashboard/jobseeker/workspaces",
    active: activeItem === "workspaces",
    icon: <ClipboardList className="w-[18px] h-[18px]" />,
  };

  const generalItems = [
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
      label: "Settings",
      to: "/dashboard/settings",
      active: activeItem === "settings",
      icon: <Settings className="w-[18px] h-[18px]" />,
    },
  ];

  if (!hasWorkspace) {
    // Organic ProvenHire job seekers (never joined a workspace) keep the
    // original flat list, with Assessments included in its usual spot.
    return [
      {
        sectionLabel: "Candidate",
        items: [
          ...generalItems.slice(0, 3),
          workspaceItem,
          ...generalItems.slice(3),
        ],
      },
    ];
  }

  return [
    {
      sectionLabel: "Workspace",
      items: [workspaceItem],
    },
    {
      sectionLabel: "ProvenHire",
      items: generalItems,
    },
  ];
}
