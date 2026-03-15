import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import NotificationInbox from "@/components/NotificationInbox";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const Navbar = () => {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnAuthPage = location.pathname === "/auth";
  const authMode = isOnAuthPage ? new URLSearchParams(location.search).get("mode") : null;
  const isOnSignupView = authMode === "signup";

  const navLinks = userRole !== "expert_interviewer" && (
    <>
      {userRole !== "recruiter" && <Link to="/jobs" onClick={() => setMenuOpen(false)} className="hover:text-foreground transition-colors">Find Jobs</Link>}
      {userRole !== "jobseeker" && <Link to="/for-employers" onClick={() => setMenuOpen(false)} className="hover:text-foreground transition-colors">For Employers</Link>}
      {userRole !== "jobseeker" && <Link to="/careers/interviewer" onClick={() => setMenuOpen(false)} className="hover:text-foreground transition-colors">Careers</Link>}
      <Link to="/about" onClick={() => setMenuOpen(false)} className="hover:text-foreground transition-colors">About</Link>
    </>
  );


  const authButtons = user ? (
    <>
      <NotificationInbox />
      <Button variant="ghost" asChild className="font-bold text-sm sm:text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 transition-all duration-200 hover:scale-[1.02] shrink-0">
        <Link to={
          userRole === "admin" ? "/admin/dashboard" :
          userRole === "recruiter" ? "/dashboard/recruiter" :
          userRole === "expert_interviewer" ? "/dashboard/expert" : "/dashboard/jobseeker"
        }>
          <span className="hidden sm:inline">Dashboard</span>
          <span className="sm:hidden">Dashboard</span>
        </Link>
      </Button>
      <Button variant="outline" onClick={signOut} className="rounded-md border-2 border-border/80 text-muted-foreground font-semibold text-sm sm:text-base hover:text-foreground hover:border-white/25 transition-all duration-200 shrink-0 px-3 sm:px-4">
        Sign Out
      </Button>
    </>
  ) : isOnAuthPage ? (
    <>
      <Button variant="ghost" asChild className="font-bold text-sm sm:text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 shrink-0 px-3 sm:px-4">
        <Link to={isOnSignupView ? "/auth?mode=login" : "/auth?mode=signup"}>
          {isOnSignupView ? "Log In" : "Sign Up"}
        </Link>
      </Button>
      <Button asChild className="bg-primary text-primary-foreground font-extrabold text-sm sm:text-base px-4 sm:px-5 py-2 sm:py-2.5 rounded-md shrink-0">
        <Link to={isOnSignupView ? "/auth?mode=login" : "/auth?mode=signup"}>
          Get Verified →
        </Link>
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" asChild className="font-bold text-sm sm:text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 shrink-0 px-3 sm:px-4">
        <Link to="/auth?mode=login">Log In</Link>
      </Button>
      <Button asChild className="bg-primary text-primary-foreground font-extrabold text-sm sm:text-base px-4 sm:px-5 py-2 sm:py-2.5 rounded-md shrink-0">
        <Link to="/auth?mode=signup">Get Verified →</Link>
      </Button>
    </>
  );

  const mobileMenu = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden shrink-0">
          <Menu className="h-5 w-5" aria-label="Open menu" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] sm:w-[320px] pt-12">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">Site navigation and account links</SheetDescription>
        <nav className="flex flex-col gap-6 font-mono text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {navLinks && (
            <div className="flex flex-col gap-4">
              {navLinks}
            </div>
          )}
          <div className="border-t border-border pt-6 flex flex-col gap-3">
            {user ? (
              <>
                <Link to={
                  userRole === "admin" ? "/admin/dashboard" :
                  userRole === "recruiter" ? "/dashboard/recruiter" :
                  userRole === "expert_interviewer" ? "/dashboard/expert" : "/dashboard/jobseeker"
                } onClick={() => setMenuOpen(false)} className="hover:text-foreground">
                  Dashboard
                </Link>
                <button onClick={() => { signOut(); setMenuOpen(false); }} className="text-left hover:text-foreground">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/auth?mode=login" onClick={() => setMenuOpen(false)} className="hover:text-foreground">Log In</Link>
                <Link to="/auth?mode=signup" onClick={() => setMenuOpen(false)} className="hover:text-primary">Get Verified →</Link>
              </>
            )}
          </div>
        </nav>
        {user && (
          <div className="mt-6 pt-6 border-t border-border">
            <NotificationInbox />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] w-full overflow-x-hidden border-b border-border bg-background/92 backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-14 sm:h-16 w-full max-w-[100vw] items-center justify-between gap-3 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12">
        <Link to={userRole === "expert_interviewer" ? "/dashboard/expert" : "/"} className="flex shrink-0 items-center gap-2 sm:gap-3 group">
          <img src="/logo.png" alt="ProvenHire" className="h-8 w-8 sm:h-9 sm:w-9 object-contain transition-transform duration-200 group-hover:scale-105 shrink-0" width={36} height={36} />
          <span className="font-bebas text-[22px] sm:text-[26px] md:text-[28px] tracking-[2px] text-foreground leading-none truncate">
            Proven<span className="text-primary">Hire</span>
          </span>
        </Link>

        {navLinks && (
          <div className="hidden min-w-0 shrink md:flex md:items-center md:gap-4 lg:gap-5 font-mono text-[13px] font-semibold text-muted-foreground tracking-wider uppercase">
            {navLinks}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {user && <div className="md:hidden shrink-0"><NotificationInbox /></div>}
          <div className="hidden md:flex items-center gap-2.5">
            {authButtons}
          </div>
          <div className="md:hidden flex items-center gap-1.5">
            {!user && (
              <>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground text-sm px-2">
                  <Link to="/auth?mode=login">Log In</Link>
                </Button>
                <Button size="sm" asChild className="bg-primary text-primary-foreground text-sm px-3">
                  <Link to="/auth?mode=signup">Get Verified</Link>
                </Button>
              </>
            )}
            {user && (
              <Button variant="ghost" size="sm" asChild className="font-semibold text-muted-foreground text-sm px-2">
                <Link to={
                  userRole === "admin" ? "/admin/dashboard" :
                  userRole === "recruiter" ? "/dashboard/recruiter" :
                  userRole === "expert_interviewer" ? "/dashboard/expert" : "/dashboard/jobseeker"
                }>
                  Dashboard
                </Link>
              </Button>
            )}
            {mobileMenu}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
