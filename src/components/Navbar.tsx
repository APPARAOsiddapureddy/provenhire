import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import NotificationInbox from "@/components/NotificationInbox";
import { useAuth } from "@/contexts/AuthContext";

const Navbar = () => {
  const { user, userRole, signOut } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between h-16 px-6 md:px-14 border-b border-border bg-background/92 backdrop-blur-xl transition-all duration-300">
      <Link to="/" className="flex items-center gap-3 group">
        <div className="w-9 h-9 border-2 border-primary flex items-center justify-center font-mono text-base font-bold text-primary transition-transform duration-200 group-hover:scale-105">
          PH
        </div>
        <span className="font-bebas text-[26px] md:text-[28px] tracking-[2px] text-foreground leading-none">
          Proven<span className="text-primary">Hire</span>
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-8 font-mono text-[13px] font-semibold text-muted-foreground tracking-wider uppercase">
        {/* Find Jobs: for job seekers and guests; hidden for recruiters */}
        {(userRole !== "recruiter") && (
          <Link to="/jobs" className="hover:text-foreground transition-colors duration-200 hover:scale-105 origin-center">
            Find Jobs
          </Link>
        )}
        {/* For Employers: for recruiters and guests; hidden for job seekers */}
        {(userRole !== "jobseeker") && (
          <Link to="/for-employers" className="hover:text-foreground transition-colors duration-200 hover:scale-105 origin-center">
            For Employers
          </Link>
        )}
        <Link to="/about" className="hover:text-foreground transition-colors duration-200 hover:scale-105 origin-center">
          About
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        {user ? (
          <>
            <NotificationInbox />
            <Button variant="ghost" asChild className="font-bold text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 transition-all duration-200 hover:scale-[1.02]">
              <Link to={
                userRole === "admin" ? "/admin/dashboard" :
                userRole === "recruiter" ? "/dashboard/recruiter" :
                userRole === "expert_interviewer" ? "/dashboard/expert" : "/dashboard/jobseeker"
              }>
                Dashboard
              </Link>
            </Button>
            <Button variant="outline" onClick={signOut} className="rounded-md border-2 border-border/80 text-muted-foreground font-semibold text-base hover:text-foreground hover:border-white/25 transition-all duration-200">
              Sign Out
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" asChild className="font-bold text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 transition-all duration-200 hover:scale-[1.02]">
              <Link to="/auth">Log In</Link>
            </Button>
            <Button asChild className="bg-primary text-primary-foreground font-extrabold text-base px-5 py-2.5 rounded-md border-0 hover:brightness-110 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/25">
              <Link to="/auth">Get Verified →</Link>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
