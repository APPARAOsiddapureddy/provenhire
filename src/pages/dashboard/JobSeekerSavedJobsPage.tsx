/**
 * Full list of saved jobs for job seekers. Linked from dashboard "See All" in Saved Jobs section.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, ExternalLink, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection } from "@/utils/jobSeekerSidebar";
import { useJobSeekerShellIdentity } from "@/hooks/useJobSeekerShellIdentity";
import { Skeleton } from "@/components/ui/skeleton";

function SavedJobRowsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-navy-border)] p-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-3 h-5 w-2/3 max-w-sm" />
            <Skeleton className="h-4 w-1/2 max-w-xs" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JobSeekerSavedJobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { shellUser } = useJobSeekerShellIdentity();

  const loadSaved = () => {
    if (!user) return;
    api
      .get<{ saved: any[] }>("/api/jobs/me/saved")
      .then((res) => setSavedJobs(Array.isArray(res?.saved) ? res.saved : []))
      .catch(() => setSavedJobs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSaved();
  }, [user]);

  const handleRemove = async (savedJobId: string, jobId: string) => {
    try {
      await api.del(`/api/jobs/${jobId}/save`);
      setSavedJobs((prev) => prev.filter((j) => j.id !== savedJobId));
      toast.success("Job removed from saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove saved job");
    }
  };

  const sidebarSections = buildJobSeekerSidebarSections({
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
              <h1>Saved Jobs</h1>
              <p>Jobs you've bookmarked for later</p>
            </div>
            <Button asChild className="dashboard-btn-gold shrink-0">
              <Link to="/jobs">Browse Jobs</Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Saved Jobs</span>
                <span className="text-sm font-normal text-muted-foreground">{savedJobs.length} saved</span>
              </CardTitle>
              <CardDescription>View and manage your saved jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <SavedJobRowsSkeleton />
              ) : savedJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground mb-4">No saved jobs yet.</p>
                  <Button asChild className="dashboard-btn-gold">
                    <Link to="/jobs">Browse Jobs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedJobs.map((saved) => {
                    const job = saved.job ?? saved.jobs;
                    const jobId = saved.jobId ?? saved.job_id ?? job?.id;
                    return (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between gap-3 p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate text-white">{job?.title || "Unknown Position"}</h3>
                          <p className="text-sm text-[var(--dash-text-muted)]">{job?.company || "Unknown Company"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {jobId ? (
                            <Button asChild className="dashboard-btn-ghost" size="sm">
                              <Link to={`/jobs?jobId=${jobId}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild className="dashboard-btn-ghost" size="sm">
                              <Link to="/jobs">
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleRemove(saved.id, saved.jobId ?? saved.job_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
