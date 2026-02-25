import { memo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoaderFullScreen } from '@/components/PageLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: 'recruiter' | 'jobseeker' | 'expert_interviewer';
}

const ProtectedRoute = memo(function ProtectedRoute({ children, allowedRole }: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return <PageLoaderFullScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRole && userRole === null) {
    return <PageLoaderFullScreen />;
  }

  if (allowedRole && userRole !== allowedRole) {
    if (userRole === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (userRole === 'recruiter') {
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
