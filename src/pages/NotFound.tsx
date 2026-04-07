import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("[404]", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SEO
        title="Page not found"
        description="This page does not exist on ProvenHire."
        path={location.pathname.replace(/^\//, "")}
        noIndex
      />
      <div className="text-center max-w-md space-y-4">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Error 404</p>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The link may be broken or the page was removed. Try the homepage or use the navigation menu.
        </p>
        <Button asChild variant="default" className="mt-2">
          <a href="/">Return home</a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
