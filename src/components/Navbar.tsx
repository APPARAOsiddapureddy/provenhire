import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import logo from "@/assets/provenhire-logo.png";
import NotificationInbox from "@/components/NotificationInbox";
import { useAuth } from "@/contexts/AuthContext";

const Navbar = () => {
  const { user, userRole, signOut } = useAuth();

  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md z-50 border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl ml-6">
          <img src={logo} alt="ProvenHire" className="h-16 w-auto" />
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link to="/jobs" className="text-foreground hover:text-primary transition-colors">
            Find Jobs
          </Link>
          <Link to="/for-employers" className="text-foreground hover:text-primary transition-colors">
            For Employers
          </Link>
          <Link to="/about" className="text-foreground hover:text-primary transition-colors">
            About
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <NotificationInbox />
              <Button variant="ghost" asChild>
                <Link to={userRole === "recruiter" ? "/dashboard/recruiter" : "/dashboard/jobseeker"}>
                  Dashboard
                </Link>
              </Button>
              <Button variant="outline" onClick={signOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild className="bg-gradient-hero hover:opacity-90 transition-opacity">
                <Link to="/auth">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
