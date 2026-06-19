/**
 * Full list of job applications for job seekers. Linked from dashboard "See All" in Applications section.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Eye } from "lucide-react";
import { api } from "@/lib/api";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection } from "@/utils/jobSeekerSidebar";
import { useJobSeekerShellIdentity } from "@/hooks/useJobSeekerShellIdentity";

function getStatusBadge(status: string) {
  const statusColors: Record<string, string> = {
    applied: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    reviewing: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    interview_scheduled: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    rejected: "bg-red-500/20 text-red-300 border-red-500/30",
    hired: "bg-emerald-500/25 text-emerald-300 border-emerald-500/40",
  };
  return statusColors[status] || "bg-white/10 text-gray-300 border-white/10";
}

export default function JobSeekerApplicationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { shellUser } = useJobSeekerShellIdentity();

  useEffect(() => {
    if (!user) return;
    api
      .get<{ applications: any[] }>("/api/jobs/me/applications")
      .then((res) => setApplications(Array.isArray(res?.applications) ? res.applications : []))
      .catch(() => setApplications([]))
      .finally(() => setLoading(false));
  }, [user]);

  const sidebarSections = buildJobSeekerSidebarSections({
    activeItem: "applications",
    onDashboardSection: (section: JobSeekerDashboardSection) => {
      navigate("/dashboard/jobseeker", { state: { section } });
    },
  });

  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={shellUser}
      >
        <div className="dashboard-section-content">
          <div className="dashboard-section-header flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1>Your Applications</h1>
              <p>All jobs you have applied to</p>
            </div>
            <Button asChild className="dashboard-btn-gold shrink-0">
              <Link to="/jobs">Browse Jobs</Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Applications</span>
                <span className="text-sm font-normal text-muted-foreground">{applications.length} total</span>
              </CardTitle>
              <CardDescription>Track your job applications</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                </div>
              ) : applications.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground mb-4">No applications yet. Start browsing jobs!</p>
                  <Button asChild className="dashboard-btn-gold">
                    <Link to="/jobs">Browse Jobs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => {
                    const job = app.job ?? app.jobs;
                    const jobId = app.jobId ?? app.job_id ?? job?.id;
                    const status = app.status ?? "applied";
                    return (
                      <div
                        key={app.id}
                        className="flex items-center justify-between gap-3 p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate text-white">{job?.title || "Unknown Position"}</h3>
                          <p className="text-sm text-[var(--dash-text-muted)]">{job?.company || "Unknown Company"}</p>
                          <p className="text-sm text-[var(--dash-text-muted)] mt-1">
                            Applied {new Date(app.appliedAt ?? app.applied_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`rounded-md border px-2 py-1 text-xs font-medium ${getStatusBadge(status)}`}>
                            {(status as string).replace(/_/g, " ")}
                          </span>
                          {jobId && (
                            <Button asChild className="dashboard-btn-ghost" size="sm">
                              <Link to={`/jobs?jobId=${jobId}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    </div>
  );
}
