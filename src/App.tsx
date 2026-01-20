import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Jobs from "./pages/Jobs";
import About from "./pages/About";
import ForEmployers from "./pages/ForEmployers";
import RecruiterDashboard from "./pages/dashboard/RecruiterDashboard";
import RecruiterOnboarding from "./pages/dashboard/RecruiterOnboarding";
import JobSeekerDashboard from "./pages/dashboard/JobSeekerDashboard";
import PostJob from "./pages/dashboard/PostJob";
import CandidateSearch from "./pages/dashboard/CandidateSearch";
import VerificationFlow from "./pages/verification/VerificationFlow";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthHashRedirect />
        <ScrollToTop />
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/about" element={<About />} />
            <Route path="/for-employers" element={<ForEmployers />} />
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
              path="/candidates" 
              element={
                <ProtectedRoute allowedRole="recruiter">
                  <CandidateSearch />
                </ProtectedRoute>
              } 
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
