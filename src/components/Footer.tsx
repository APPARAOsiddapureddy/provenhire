import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { skipSupabaseRequests } from "@/lib/skipSupabase";
import { useAuth } from "@/contexts/AuthContext";

const Footer = () => {
  const { userRole } = useAuth();
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSubscribing(true);
    try {
      if (skipSupabaseRequests()) {
        toast.success("Newsletter signup will be available after authentication is enabled.");
        setEmail("");
        setSubscribing(false);
        return;
      }
      const { error } = await supabase
        .from("newsletter_subscribers")
        .insert({ email, source: "footer" });

      if (error) {
        if (error.code === "23505") {
          toast.info("You're already subscribed!");
        } else {
          throw error;
        }
      } else {
        toast.success("Successfully subscribed to our newsletter!");
        setEmail("");
      }
    } catch (error: any) {
      toast.error("Failed to subscribe. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer className="bg-secondary border-t border-border">
      {/* Newsletter Section - Brutalist strip */}
      <div className="border-b border-border py-10 bg-background/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h3 className="font-bebas text-3xl tracking-[2px] text-foreground mb-2">Stay Updated</h3>
              <p className="text-muted-foreground text-base font-medium font-mono">Get weekly curated job alerts and career tips.</p>
            </div>
            <form onSubmit={handleSubscribe} className="flex w-full md:w-auto gap-2">
              <Input 
                type="email" 
                placeholder="Enter your email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground min-w-[250px] rounded"
                required
              />
              <Button 
                type="submit" 
                className="bg-primary text-primary-foreground font-extrabold text-base rounded-md hover:brightness-110 transition-transform hover:scale-105"
                disabled={subscribing}
              >
                {subscribing ? "..." : "Subscribe"} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Brand + single column of useful links */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-6 transition-transform hover:scale-105 duration-200">
              <div className="w-9 h-9 border-2 border-primary flex items-center justify-center font-mono text-base font-bold text-primary">PH</div>
              <span className="font-bebas text-2xl tracking-[2px] text-foreground">Proven<span className="text-primary">Hire</span></span>
            </Link>
            <p className="text-muted-foreground text-base font-medium mb-6 max-w-sm">
              Skill-verified hiring. One platform for job seekers and employers.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-xs font-bold text-primary tracking-[2px] uppercase mb-6">Links</h3>
            <ul className="space-y-3 text-sm">
              {userRole !== "recruiter" && (
                <li><Link to="/jobs" className="text-muted-foreground hover:text-primary transition-colors">Find Jobs</Link></li>
              )}
              <li><Link to="/verification" className="text-muted-foreground hover:text-primary transition-colors">Get Verified</Link></li>
              <li><Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">Log In / Sign Up</Link></li>
              {userRole !== "jobseeker" && (
                <>
                  <li><Link to="/for-employers" className="text-muted-foreground hover:text-primary transition-colors">For Employers</Link></li>
                  <li><Link to="/post-job" className="text-muted-foreground hover:text-primary transition-colors">Post a Job</Link></li>
                </>
              )}
              <li><Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">About</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container mx-auto px-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} ProvenHire. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
