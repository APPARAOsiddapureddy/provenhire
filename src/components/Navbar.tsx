import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import NotificationInbox from "@/components/NotificationInbox";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Menu } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const linkTone =
  "font-mono text-[13px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground transition-colors";

const navDropdownContentClass =
  "min-w-[12rem] z-[200] border border-border/80 bg-card/98 text-card-foreground shadow-2xl backdrop-blur-xl";

const dropdownItemClass =
  "font-mono text-xs font-semibold uppercase tracking-wider cursor-pointer text-foreground/90 focus:bg-primary/12 focus:text-foreground data-[highlighted]:bg-primary/12 data-[highlighted]:text-foreground";

const Navbar = () => {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnAuthPage = location.pathname === "/auth";
  const authMode = isOnAuthPage ? new URLSearchParams(location.search).get("mode") : null;
  const isOnSignupView = authMode === "signup";
  const signOutOnlyInSettings = userRole === "recruiter" || userRole === "expert_interviewer";

  const showPublicNav = userRole !== "expert_interviewer";
  const showFindJobs = userRole !== "recruiter";
  const showHireMenu = userRole !== "jobseeker";
  const showCareersLink = userRole !== "jobseeker";

  const authButtons = user ? (
    <>
      <NotificationInbox />
      <Button variant="ghost" asChild className="font-bold text-sm sm:text-base text-muted-foreground border-2 border-border/80 rounded-md hover:text-foreground hover:border-white/25 transition-all duration-200 hover:scale-[1.02] shrink-0">
        <Link
          to={
            userRole === "admin"
              ? "/admin/dashboard"
              : userRole === "recruiter"
                ? "/dashboard/recruiter"
                : userRole === "expert_interviewer"
                  ? "/dashboard/expert"
                  : "/dashboard/jobseeker"
          }
        >
          <span className="hidden sm:inline">Dashboard</span>
          <span className="sm:hidden">Dashboard</span>
        </Link>
      </Button>
      {signOutOnlyInSettings ? (
        <Button variant="outline" asChild className="rounded-md border-2 border-border/80 text-muted-foreground font-semibold text-sm sm:text-base hover:text-foreground hover:border-white/25 transition-all duration-200 shrink-0 px-3 sm:px-4">
          <Link to="/dashboard/settings">Settings</Link>
        </Button>
      ) : (
        <Button variant="outline" onClick={signOut} className="rounded-md border-2 border-border/80 text-muted-foreground font-semibold text-sm sm:text-base hover:text-foreground hover:border-white/25 transition-all duration-200 shrink-0 px-3 sm:px-4">
          Sign Out
        </Button>
      )}
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

  const desktopPublicNav = showPublicNav && (
    <div className="hidden min-w-0 shrink md:flex md:items-center md:gap-3 lg:gap-4">
      {showFindJobs && (
        <Link to="/jobs" className={linkTone}>
          Find Jobs
        </Link>
      )}
      <Link to="/for-job-seekers" className={linkTone}>
        Job Seekers
      </Link>
      {showHireMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`${linkTone} inline-flex items-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background`}
          >
            Hire talent
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[14rem]">
            <DropdownMenuItem asChild className={dropdownItemClass}>
              <Link to="/for-recruiters">Employers &amp; recruiters</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`${linkTone} inline-flex items-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background`}
        >
          Company
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className={navDropdownContentClass}>
          <DropdownMenuItem asChild className={dropdownItemClass}>
            <Link to="/resources">Resources</Link>
          </DropdownMenuItem>
          {showCareersLink && (
            <DropdownMenuItem asChild className={dropdownItemClass}>
              <Link to="/careers/interviewer">Careers</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className={dropdownItemClass}>
            <Link to="/about">About</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const mobilePublicNav = showPublicNav && (
    <nav className="flex flex-col gap-6 font-mono text-sm font-semibold text-muted-foreground uppercase tracking-wider">
      <div className="flex flex-col gap-3">
        {showFindJobs && (
          <Link to="/jobs" onClick={() => setMenuOpen(false)} className="hover:text-foreground">
            Find Jobs
          </Link>
        )}
        <Link to="/for-job-seekers" onClick={() => setMenuOpen(false)} className="hover:text-foreground">
          Job Seekers
        </Link>
      </div>
      {showHireMenu && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Hire talent</p>
          <Link to="/for-recruiters" onClick={() => setMenuOpen(false)} className="hover:text-foreground pl-1">
            Employers &amp; recruiters
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Company</p>
        <Link to="/resources" onClick={() => setMenuOpen(false)} className="hover:text-foreground pl-1">
          Resources
        </Link>
        {showCareersLink && (
          <Link to="/careers/interviewer" onClick={() => setMenuOpen(false)} className="hover:text-foreground pl-1">
            Careers
          </Link>
        )}
        <Link to="/about" onClick={() => setMenuOpen(false)} className="hover:text-foreground pl-1">
          About
        </Link>
      </div>
    </nav>
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
        {mobilePublicNav}
        <div className="mt-6 border-t border-border pt-6 flex flex-col gap-3 font-mono text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {user ? (
            <>
              <Link
                to={
                  userRole === "admin"
                    ? "/admin/dashboard"
                    : userRole === "recruiter"
                      ? "/dashboard/recruiter"
                      : userRole === "expert_interviewer"
                        ? "/dashboard/expert"
                        : "/dashboard/jobseeker"
                }
                onClick={() => setMenuOpen(false)}
                className="hover:text-foreground"
              >
                Dashboard
              </Link>
              {signOutOnlyInSettings ? (
                <Link to="/dashboard/settings" onClick={() => setMenuOpen(false)} className="hover:text-foreground">
                  Settings
                </Link>
              ) : (
                <button type="button" onClick={() => { signOut(); setMenuOpen(false); }} className="text-left hover:text-foreground">
                  Sign Out
                </button>
              )}
            </>
          ) : (
            <>
              <Link to="/auth?mode=login" onClick={() => setMenuOpen(false)} className="hover:text-foreground">
                Log In
              </Link>
              <Link to="/auth?mode=signup" onClick={() => setMenuOpen(false)} className="hover:text-primary">
                Get Verified →
              </Link>
            </>
          )}
        </div>
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
        <BrandMark to={userRole === "expert_interviewer" ? "/dashboard/expert" : "/"} />

        {desktopPublicNav}

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
                <Link
                  to={
                    userRole === "admin"
                      ? "/admin/dashboard"
                      : userRole === "recruiter"
                        ? "/dashboard/recruiter"
                        : userRole === "expert_interviewer"
                          ? "/dashboard/expert"
                          : "/dashboard/jobseeker"
                  }
                >
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
