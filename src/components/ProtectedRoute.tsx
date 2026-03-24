import { memo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoaderFullScreen } from '@/components/PageLoader';
import { hasAuthToken } from '@/lib/api';

type AllowedRole = 'recruiter' | 'jobseeker' | 'expert_interviewer' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: AllowedRole;
  /** Allow multiple roles (e.g. for Settings page) */
  allowedRoles?: AllowedRole[];
}

const ProtectedRoute = memo(function ProtectedRoute({ children, allowedRole, allowedRoles }: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();
  const roles = allowedRoles ?? (allowedRole ? [allowedRole] : undefined);

  if (loading) {
    return <PageLoaderFullScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Guard against stale in-memory user when token has already been cleared/expired.
  // Prevents protected pages from mounting and firing a 401 cascade.
  if (!hasAuthToken()) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && userRole === null) {
    return <PageLoaderFullScreen />;
  }

  if (roles && userRole && !roles.includes(userRole)) {
    if (userRole === "admin") return <Navigate to="/admin/dashboard" replace />;
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
