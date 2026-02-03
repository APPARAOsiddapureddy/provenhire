import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: 'recruiter' | 'jobseeker';
}

const ProtectedRoute = ({ children, allowedRole }: ProtectedRouteProps) => {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRole && userRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (allowedRole && userRole !== allowedRole) {
    // Redirect to appropriate dashboard if user has wrong role
    if (userRole === 'recruiter') {
      return <Navigate to="/dashboard/recruiter" replace />;
    } else {
      return <Navigate to="/dashboard/jobseeker" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
