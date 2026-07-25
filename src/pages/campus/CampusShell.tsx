import { type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "./useInstitution";

const NAV = [
  { to: "/campus/overview", label: "Overview" },
  { to: "/campus/drives", label: "Drives" },
  { to: "/campus/staff", label: "Placement cell" },
  { to: "/campus/settings", label: "Settings" },
] as const;

/// Shell for the campus portal. Deliberately its own nav rather than the admin
/// shell: an institution should never see platform-wide admin surfaces.
export default function CampusShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { institution, canPublishDrives } = useInstitution();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/campus/login", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        {institution && !canPublishDrives && institution.status === "pending" && (
          <div className="border-b border-primary/25 bg-primary/10">
            <div className="container mx-auto max-w-6xl px-6 py-2.5 flex items-start gap-2.5 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-foreground/90">
                We&rsquo;re verifying {institution.name}. You can build drives now — publishing to
                students unlocks once verification completes.
              </p>
            </div>
          </div>
        )}
        <div className="container mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <Link to="/campus/overview" className="text-base font-semibold tracking-tight shrink-0">
              ProvenHire
              <span className="ml-2 text-xs font-normal text-muted-foreground">Campus</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-white/[0.06] text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
        {/* Mobile nav: horizontal scroll rather than a hidden menu, so the
            primary sections stay one tap away. */}
        <nav className="md:hidden border-t border-border overflow-x-auto">
          <div className="flex items-center gap-1 px-4 py-2 min-w-max">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="container mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-2 text-muted-foreground leading-relaxed max-w-2xl">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
