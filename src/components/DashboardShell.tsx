import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

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

function SidebarContent({
  sidebarSections,
  user,
  isActive,
  onItemClick,
}: {
  sidebarSections: DashboardSidebarSection[];
  user: { name: string; role: string; initials: string };
  isActive: (item: DashboardSidebarItem) => boolean;
  onItemClick?: () => void;
}) {
  return (
    <>
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
                  onClick={onItemClick}
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  onItemClick?.();
                }}
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
    </>
  );
}

export default function DashboardShell({
  children,
  sidebarSections,
  user,
}: DashboardShellProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (item: DashboardSidebarItem) => {
    if (item.active !== undefined) return item.active;
    if (item.to) return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
    return false;
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar hidden lg:block">
        <SidebarContent sidebarSections={sidebarSections} user={user} isActive={isActive} />
      </aside>
      <div className="dashboard-main-wrapper flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-[var(--dash-navy-border)] bg-[var(--dash-navy)] shrink-0">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)]">
                <Menu className="h-5 w-5" aria-label="Open menu" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-[var(--dash-navy)] border-[var(--dash-navy-border)]">
              <div className="pt-8 pb-4 overflow-y-auto h-full">
                <SidebarContent sidebarSections={sidebarSections} user={user} isActive={isActive} onItemClick={() => setMobileMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--dash-text-primary)" }}>{user.name}</div>
            <div className="text-xs truncate" style={{ color: "var(--dash-text-muted)" }}>{user.role}</div>
          </div>
        </div>
        <main className="dashboard-main flex-1">{children}</main>
      </div>
    </div>
  );
}
