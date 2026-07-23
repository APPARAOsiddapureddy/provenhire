import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import BackendGate from "./components/BackendGate";
import { api, hasAuthToken } from "./lib/api";
import { PageLoaderFullScreen } from "./components/PageLoader";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Jobs from "./pages/Jobs";
import About from "./pages/About";
import EmailVerification from "./pages/EmailVerification";
import SeoMarketingPage from "./pages/seo/SeoMarketingPage";
import { FeaturesHubPage, ResourcesHubPage } from "./pages/seo/SeoHubPage";
import BlogIndexPage from "./pages/seo/BlogIndexPage";
import {
  ProgrammaticJobSlugRoute,
  ProgrammaticSkillSlugRoute,
} from "./pages/seo/ProgrammaticSeoPage";
import { SEO_LANDING_PAGES } from "./data/seoArchitecture";
import NotFound from "./pages/NotFound";
import FirebaseAuthHandler from "./pages/FirebaseAuthHandler";

// Eager-load dashboards so /dashboard/jobseeker, /dashboard/recruiter, /dashboard/expert render instantly
import JobSeekerDashboard from "./pages/dashboard/JobSeekerDashboard";
import JobSeekerApplicationsPage from "./pages/dashboard/JobSeekerApplicationsPage";
import JobSeekerSavedJobsPage from "./pages/dashboard/JobSeekerSavedJobsPage";
import RecruiterDashboard from "./pages/dashboard/RecruiterDashboard";
import ExpertDashboard from "./pages/dashboard/ExpertDashboard";
import ExpertProfileSetup from "./pages/dashboard/ExpertProfileSetup";
import SettingsPage from "./pages/dashboard/SettingsPage";

// Antigravity AI Interview module — native integration (no iframe, all calls through proxy)
const AntigravityLabPage = lazy(
  () => import("./pages/ai-interview/AntigravityLabPage"),
);
const AntigravityReturnPage = lazy(
  () => import("./pages/ai-interview/AntigravityReturnPage"),
);
// Legacy iframe routes (report, dashboard, recruiter views) — kept until native parity
const AntigravityPage = lazy(
  () => import("./pages/ai-interview/AntigravityPage"),
);

const RecruiterOnboarding = lazy(
  () => import("./pages/dashboard/RecruiterOnboarding"),
);
const RecruiterPlansPage = lazy(
  () => import("./pages/dashboard/RecruiterPlansPage"),
);
const PostJob = lazy(() => import("./pages/dashboard/PostJob"));
const CandidateSearch = lazy(() => import("./pages/dashboard/CandidateSearch"));
const CandidateProfilePage = lazy(
  () => import("./pages/dashboard/CandidateProfilePage"),
);
const ApplicantsPage = lazy(() => import("./pages/dashboard/ApplicantsPage"));
const AssignmentAIDocs = lazy(
  () => import("./pages/dashboard/AssignmentAIDocs"),
);
const VerificationFlow = lazy(
  () => import("./pages/verification/VerificationFlow"),
);
const DSARoundStage = lazy(
  () => import("./pages/verification/stages/DSARoundStage"),
);
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const InterviewerCareers = lazy(
  () => import("./pages/careers/InterviewerCareers"),
);
const InterviewRoom = lazy(() => import("./pages/interview/InterviewRoom"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminWorkspacesPage = lazy(
  () => import("./pages/admin/workspaces/AdminWorkspacesPage"),
);
const WorkspaceBuilderPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceBuilderPage"),
);
const WorkspaceDetailPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceDetailPage"),
);
const WorkspaceLocalPreviewPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceLocalPreviewPage"),
);
const WorkspaceCandidateReportsPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceCandidateReportsPage"),
);
const WorkspaceTechnicalDeskPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceTechnicalDeskPage"),
);
const WorkspaceAnalyticsPage = lazy(
  () => import("./pages/admin/workspaces/WorkspaceAnalyticsPage"),
);
const UserWorkspacesPage = lazy(
  () => import("./pages/dashboard/workspaces/UserWorkspacesPage"),
);
const UserWorkspaceDetailPage = lazy(
  () => import("./pages/dashboard/workspaces/UserWorkspaceDetailPage"),
);
const WorkspaceRoundAttemptPage = lazy(
  () => import("./pages/dashboard/workspaces/WorkspaceRoundAttemptPage"),
);
const HumanInterviewPaymentPage = lazy(
  () => import("./pages/human-interview/HumanInterviewPaymentPage"),
);
const HumanInterviewSlotsPage = lazy(
  () => import("./pages/human-interview/HumanInterviewSlotsPage"),
);
const VerifiedPublicPage = lazy(() => import("./pages/VerifiedPublicPage"));
const JobCandidateDiscovery = lazy(
  () => import("./pages/dashboard/JobCandidateDiscovery"),
);
const ProvenHireResumePage = lazy(
  () => import("./pages/dashboard/ProvenHireResumePage"),
);

// Create QueryClient instance outside component to ensure stability
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const AuthHashRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hasRecoveryHash =
      location.hash.includes("access_token") &&
      location.hash.includes("type=recovery");
    if (location.pathname === "/" && hasRecoveryHash) {
      navigate(
        { pathname: "/auth", search: "?mode=reset", hash: location.hash },
        { replace: true },
      );
    }
  }, [location, navigate]);

  return null;
};

// Only in production: wake backend from cold start. Skip in dev to avoid 503 console errors when backend isn't running.
const ApiWarmup = () => {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    api.get<{ ok?: boolean }>("/api/health").catch(() => {});
  }, []);
  return null;
};

// Prefetch frequently visited private routes after login to reduce route-change latency.
const RouteChunkPrefetch = () => {
  useEffect(() => {
    if (!hasAuthToken()) return;
    const prefetch = () => {
      void import("./pages/verification/VerificationFlow");
      void import("./pages/dashboard/PostJob");
      void import("./pages/dashboard/CandidateSearch");
      void import("./pages/dashboard/ApplicantsPage");
      void import("./pages/admin/AdminDashboard");
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (
        window as Window & { requestIdleCallback: (cb: () => void) => number }
      ).requestIdleCallback(prefetch);
      return () => {
        if ("cancelIdleCallback" in window) {
          (
            window as Window & { cancelIdleCallback: (id: number) => void }
          ).cancelIdleCallback(idleId);
        }
      };
    }
    const timer = globalThis.setTimeout(prefetch, 400);
    return () => globalThis.clearTimeout(timer);
  }, []);
  return null;
};
// This is a temporary route for development purposes only
const DsaRoundDevRoute = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-subtle p-3 sm:p-6">
      <DSARoundStage
        stageStatus="in_progress"
        onComplete={() => navigate("/verification")}
        onRetry={() => window.location.reload()}
        targetJobTitle="Software Engineer"
        experienceYears={2}
        nextStageLabel="AI Skills Interview"
      />
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthHashRedirect />
        <ApiWarmup />
        <RouteChunkPrefetch />
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={<PageLoaderFullScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route
                path="/login"
                element={<Navigate to="/auth?mode=login" replace />}
              />
              <Route
                path="/signup"
                element={<Navigate to="/auth?mode=signup" replace />}
              />
              <Route path="/auth" element={<Auth />} />
              <Route path="/verify-email" element={<EmailVerification />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route
                path="/jobs/:seoSlug"
                element={<ProgrammaticJobSlugRoute />}
              />
              <Route
                path="/skills/:skillSlug"
                element={<ProgrammaticSkillSlugRoute />}
              />
              <Route path="/about" element={<About />} />
              <Route
                path="/for-employers"
                element={<Navigate to="/for-recruiters" replace />}
              />
              {SEO_LANDING_PAGES.map((p) => (
                <Route
                  key={p.path}
                  path={p.path}
                  element={<SeoMarketingPage page={p} />}
                />
              ))}
              <Route path="/features" element={<FeaturesHubPage />} />
              <Route path="/resources" element={<ResourcesHubPage />} />
              <Route path="/blog" element={<BlogIndexPage />} />
              <Route
                path="/verified/:handle"
                element={<VerifiedPublicPage />}
              />
              <Route
                path="/careers/interviewer"
                element={<InterviewerCareers />}
              />
              <Route path="/admin" element={<AdminLogin />} />
              <Route
                path="/local-preview/workspace"
                element={
                  import.meta.env.DEV ? (
                    <WorkspaceLocalPreviewPage />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/local-preview/workspace/candidates/:userId/reports"
                element={
                  import.meta.env.DEV ? (
                    <WorkspaceCandidateReportsPage />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/local-preview/workspace/technical-desk"
                element={
                  import.meta.env.DEV ? (
                    <WorkspaceTechnicalDeskPage />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <AdminWorkspacesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces/new"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <WorkspaceBuilderPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces/:id"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <WorkspaceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces/:id/candidates/:userId/reports"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <WorkspaceCandidateReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces/:id/technical-desk"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <WorkspaceTechnicalDeskPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/workspaces/:id/analytics"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <WorkspaceAnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/recruiter"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <RecruiterDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/recruiter/assignmentai"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <AssignmentAIDocs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/recruiter/onboarding"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <RecruiterOnboarding />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <JobSeekerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/applications"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <JobSeekerApplicationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/saved"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <JobSeekerSavedJobsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/workspaces"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <UserWorkspacesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/workspaces/:code/reports"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <WorkspaceCandidateReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/workspaces/:code/rounds/:roundId"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <WorkspaceRoundAttemptPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/workspaces/:code"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <UserWorkspaceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/resume"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <ProvenHireResumePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/antigravity"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <AntigravityLabPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/jobseeker/antigravity/return"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <AntigravityReturnPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/expert/profile-setup"
                element={
                  <ProtectedRoute allowedRole="expert_interviewer">
                    <ExpertProfileSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/expert"
                element={
                  <ProtectedRoute allowedRole="expert_interviewer">
                    <BackendGate>
                      <ExpertDashboard />
                    </BackendGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/interview/room/:sessionId"
                element={
                  <ProtectedRoute allowedRole="expert_interviewer">
                    <InterviewRoom />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/verification"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <VerificationFlow />
                  </ProtectedRoute>
                }
              />
              {import.meta.env.DEV && (
                <Route
                  path="/dsa-round"
                  element={
                    <ProtectedRoute allowedRole="jobseeker">
                      <DsaRoundDevRoute />
                    </ProtectedRoute>
                  }
                />
              )}
              <Route
                path="/human-interview/payment"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <HumanInterviewPaymentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/human-interview/slots"
                element={
                  <ProtectedRoute allowedRole="jobseeker">
                    <HumanInterviewSlotsPage />
                  </ProtectedRoute>
                }
              />
              {/* ── Antigravity iframe routes — DEPRECATED for jobseekers ────────────────
                   Canonical jobseeker path is /dashboard/jobseeker/antigravity (AntigravityLabPage).
                   These routes remain for recruiter dashboard and direct report/session links only.
                   Do not add new features here. Remove once recruiter views are ported natively. ── */}
              {/* Setup — recruiter-only; jobseekers use /dashboard/jobseeker/antigravity */}
              <Route
                path="/ai-interview"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <AntigravityPage view="home" />
                  </ProtectedRoute>
                }
              />
              {/* Live room — recruiter-only for same reason */}
              <Route
                path="/ai-interview/interview/:sessionId"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <AntigravityPage view="interview" />
                  </ProtectedRoute>
                }
              />
              {/* Report — both roles: jobseekers may receive direct report links */}
              <Route
                path="/ai-interview/report/:sessionId"
                element={
                  <ProtectedRoute allowedRoles={["jobseeker", "recruiter"]}>
                    <AntigravityPage view="report" />
                  </ProtectedRoute>
                }
              />
              {/* Recruiter dashboard — all completed sessions */}
              <Route
                path="/ai-interview/dashboard"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <AntigravityPage view="dashboard" />
                  </ProtectedRoute>
                }
              />
              {/* ── End Antigravity routes ── */}

              <Route
                path="/post-job"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <PostJob />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/candidate-search"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <CandidateSearch />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/candidate-search/:profileId"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <CandidateProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs/:jobId/applicants"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <ApplicantsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/recruiter/jobs/:jobId/matches"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <JobCandidateDiscovery />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/recruiter/plans"
                element={
                  <ProtectedRoute allowedRole="recruiter">
                    <RecruiterPlansPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute
                    allowedRoles={[
                      "jobseeker",
                      "recruiter",
                      "expert_interviewer",
                    ]}
                  >
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/__/auth/handler"
                element={<FirebaseAuthHandler />}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
