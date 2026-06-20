import { Briefcase, CreditCard, LayoutGrid, Search, Settings, Users } from "lucide-react";
import type { DashboardSidebarSection } from "@/components/DashboardShell";

export type RecruiterSidebarItem = "talent" | "search" | "jobs" | "pipeline" | "plans" | "settings";
export type RecruiterDashboardTab = "discover" | "jobs" | "pipeline";

type RecruiterSidebarOptions = {
  activeItem: RecruiterSidebarItem;
  onDashboardTab?: (tab: RecruiterDashboardTab) => void;
};

function dashboardItem(
  label: string,
  tab: RecruiterDashboardTab,
  activeItem: RecruiterSidebarItem,
  onDashboardTab?: (tab: RecruiterDashboardTab) => void,
) {
  const activeMap: Record<RecruiterDashboardTab, RecruiterSidebarItem> = {
    discover: "talent",
    jobs: "jobs",
    pipeline: "pipeline",
  };
  return onDashboardTab
    ? { label, active: activeItem === activeMap[tab], onClick: () => onDashboardTab(tab) }
    : { label, to: "/dashboard/recruiter", active: activeItem === activeMap[tab] };
}

export function buildRecruiterSidebarSections({
  activeItem,
  onDashboardTab,
}: RecruiterSidebarOptions): DashboardSidebarSection[] {
  return [
    {
      sectionLabel: "Recruiter",
      items: [
        {
          ...dashboardItem("Talent Pool", "discover", activeItem, onDashboardTab),
          icon: <Users className="w-[18px] h-[18px]" />,
        },
        {
          label: "Search Candidates",
          to: "/candidate-search",
          active: activeItem === "search",
          icon: <Search className="w-[18px] h-[18px]" />,
        },
        {
          ...dashboardItem("My Jobs", "jobs", activeItem, onDashboardTab),
          icon: <Briefcase className="w-[18px] h-[18px]" />,
        },
        {
          ...dashboardItem("Pipeline & Tracking", "pipeline", activeItem, onDashboardTab),
          icon: <LayoutGrid className="w-[18px] h-[18px]" />,
        },
        {
          label: "Plans & Upgrade",
          to: "/dashboard/recruiter/plans",
          active: activeItem === "plans",
          icon: <CreditCard className="w-[18px] h-[18px]" />,
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
