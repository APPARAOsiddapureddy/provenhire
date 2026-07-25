import { memo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoaderFullScreen } from '@/components/PageLoader';
import { hasAuthToken } from '@/lib/api';

type AllowedRole = 'recruiter' | 'jobseeker' | 'expert_interviewer' | 'admin' | 'institution';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: AllowedRole;
  /** Allow multiple roles (e.g. for Settings page) */
  allowedRoles?: AllowedRole[];
}

const ProtectedRoute = memo(function ProtectedRoute({ children, allowedRole, allowedRoles }: ProtectedRouteProps) {
  const { user, userRole, isInitializing } = useAuth();
  const location = useLocation();
  const roles = allowedRoles ?? (allowedRole ? [allowedRole] : undefined);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const authPath = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

  if (isInitializing) {
    return <PageLoaderFullScreen />;
  }

  if (!user) {
    return <Navigate to={authPath} replace />;
  }

  // Guard against stale in-memory user when token has already been cleared/expired.
  // Prevents protected pages from mounting and firing a 401 cascade.
  if (!hasAuthToken()) {
    return <Navigate to={authPath} replace />;
  }

  if (roles && userRole === null) {
    return <PageLoaderFullScreen />;
  }

  if (roles && userRole && !roles.includes(userRole)) {
    if (userRole === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (userRole === "institution") return <Navigate to="/campus/overview" replace />;
    if (userRole === "recruiter") {
      return <Navigate to="/dashboard/recruiter" replace />;
    }
    if (userRole === 'expert_interviewer') {
      return <Navigate to="/dashboard/expert" replace />;
    }
    return <Navigate to="/dashboard/jobseeker" replace />;
  }

  return <>{children}</>;
});

export default ProtectedRoute;
