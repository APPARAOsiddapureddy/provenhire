import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import { PageLoaderFullScreen } from "./components/PageLoader";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Jobs from "./pages/Jobs";
import About from "./pages/About";
import ForEmployers from "./pages/ForEmployers";
import NotFound from "./pages/NotFound";

// Eager-load dashboards so /dashboard/jobseeker, /dashboard/recruiter, /dashboard/expert render instantly
import JobSeekerDashboard from "./pages/dashboard/JobSeekerDashboard";
import RecruiterDashboard from "./pages/dashboard/RecruiterDashboard";
import ExpertDashboard from "./pages/dashboard/ExpertDashboard";
import SettingsPage from "./pages/dashboard/SettingsPage";

const RecruiterOnboarding = lazy(() => import("./pages/dashboard/RecruiterOnboarding"));
const PostJob = lazy(() => import("./pages/dashboard/PostJob"));
const CandidateSearch = lazy(() => import("./pages/dashboard/CandidateSearch"));
const CandidateProfilePage = lazy(() => import("./pages/dashboard/CandidateProfilePage"));
const ApplicantsPage = lazy(() => import("./pages/dashboard/ApplicantsPage"));
const AssignmentAIDocs = lazy(() => import("./pages/dashboard/AssignmentAIDocs"));
const VerificationFlow = lazy(() => import("./pages/verification/VerificationFlow"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const InterviewerCareers = lazy(() => import("./pages/careers/InterviewerCareers"));
const InterviewRoom = lazy(() => import("./pages/interview/InterviewRoom"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));

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
    const hasRecoveryHash = location.hash.includes("access_token") && location.hash.includes("type=recovery");
    if (location.pathname === "/" && hasRecoveryHash) {
      navigate(
        { pathname: "/auth", search: "?mode=reset", hash: location.hash },
        { replace: true }
      );
    }
  }, [location, navigate]);

  return null;
};

const ApiWarmup = () => {
  useEffect(() => {
    fetch("/health", { cache: "no-store" }).catch(() => {});
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthHashRedirect />
        <ApiWarmup />
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={<PageLoaderFullScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/about" element={<About />} />
              <Route path="/for-employers" element={<ForEmployers />} />
              <Route path="/careers/interviewer" element={<InterviewerCareers />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
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
                path="/dashboard/expert" 
                element={
                  <ProtectedRoute allowedRole="expert_interviewer">
                    <ExpertDashboard />
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
                path="/dashboard/settings" 
                element={
                  <ProtectedRoute allowedRoles={["jobseeker", "recruiter", "expert_interviewer"]}>
                    <SettingsPage />
                  </ProtectedRoute>
                } 
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
