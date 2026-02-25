import { Link, useLocation } from "react-router-dom";
import { ReactNode } from "react";

export interface DashboardSidebarItem {
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: string;
  active?: boolean;
  icon?: ReactNode;
}

export interface DashboardSidebarSection {
  sectionLabel: string;
  items: DashboardSidebarItem[];
}

export interface DashboardShellProps {
  children: ReactNode;
  sidebarSections: DashboardSidebarSection[];
  user: { name: string; role: string; initials: string };
}

export default function DashboardShell({
  children,
  sidebarSections,
  user,
}: DashboardShellProps) {
  const location = useLocation();

  const isActive = (item: DashboardSidebarItem) => {
    if (item.active !== undefined) return item.active;
    if (item.to) return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
    return false;
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        {sidebarSections.map((section, idx) => (
          <div key={idx} style={{ padding: "0 0 16px" }}>
            <div className="dashboard-sidebar-section-label">{section.sectionLabel}</div>
            {section.items.map((item, i) => {
              const active = isActive(item);
              const content = (
                <>
                  {item.icon && <span className={`[&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 ${active ? '[&>svg]:opacity-100 [&>svg]:text-[var(--dash-navy)]' : '[&>svg]:opacity-70'}`}>{item.icon}</span>}
                  {item.label}
                  {item.badge && (
                    <span
                      className="ml-auto text-[11px] font-semibold px-[7px] py-0.5 rounded-[10px]"
                      style={{
                        background: "var(--dash-emerald-light)",
                        color: "var(--dash-emerald)",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              );
              if (item.to) {
                return (
                  <Link
                    key={i}
                    to={item.to}
                    className={`dashboard-sidebar-item ${active ? "active" : ""}`}
                  >
                    {content}
                  </Link>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={item.onClick}
                  className={`dashboard-sidebar-item ${active ? "active" : ""}`}
                >
                  {content}
                </button>
              );
            })}
          </div>
        ))}
        <div className="dashboard-sidebar-divider" />
        <div
          className="flex items-center gap-[10px] pt-4 px-6 border-t border-[var(--dash-navy-border)] mt-4"
          style={{ padding: "16px 24px" }}
        >
          <div
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 border-2 flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--dash-navy-light), var(--dash-slate))",
              color: "var(--dash-gold)",
              borderColor: "var(--dash-gold-dim)",
            }}
          >
            {user.initials}
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold truncate" style={{ color: "var(--dash-text-primary)" }}>
              {user.name}
            </div>
            <div className="text-[11.5px] truncate" style={{ color: "var(--dash-text-muted)" }}>
              {user.role}
            </div>
          </div>
        </div>
      </aside>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
