import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Twitter, Instagram, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const Footer = () => {
  const { userRole } = useAuth();
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const isInterviewer = userRole === "expert_interviewer";

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubscribing(true);
    try {
      await api.post("/api/notifications/newsletter", { email });
      toast.success("Successfully subscribed to our newsletter!");
      setEmail("");
    } catch (error: any) {
      toast.error("Failed to subscribe. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer className="bg-secondary border-t border-border">
      <div className={`container mx-auto px-4 ${isInterviewer ? "py-6" : "py-10"}`}>
        <div className={isInterviewer ? "flex flex-col items-center text-center gap-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6"}>
          {/* Column 1: Brand */}
          <div>
            <Link to="/" className="inline-flex items-center gap-2 mb-4 transition-transform hover:scale-105 duration-200">
              {/* <img src="/logo.png" alt="ProvenHire" className="h-9 w-9 object-contain shrink-0" width={36} height={36} /> */}
              <span className="font-bebas text-2xl tracking-[2px] text-foreground">Proven<span className="text-primary">Hire</span></span>
            </Link>
            <p className="text-muted-foreground text-sm font-medium">
              Skill-verified hiring. One platform for job seekers and employers.
            </p>
          </div>

          {/* Column 2: Links — hidden for interviewer */}
          {!isInterviewer && (
            <div>
              <h3 className="font-mono text-xs font-bold text-primary tracking-[2px] uppercase mb-4">Links</h3>
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
                <li><Link to="/careers/interviewer" className="text-muted-foreground hover:text-primary transition-colors">Careers</Link></li>
                <li><Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">About</Link></li>
              </ul>
            </div>
          )}

          {/* Column 3: Follow Us — hidden for interviewer */}
          {!isInterviewer && (
            <div>
              <h3 className="font-mono text-xs font-bold text-primary tracking-[2px] uppercase mb-4">Follow Us</h3>
              <div className="flex gap-4">
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Twitter">
                  <Twitter className="h-5 w-5" />
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors" aria-label="LinkedIn">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          )}

          {/* Column 4: Stay Updated — hidden for interviewer */}
          {!isInterviewer && (
            <div>
              <h3 className="font-bebas text-xl sm:text-2xl tracking-[2px] text-foreground mb-2">Stay Updated</h3>
              <p className="text-muted-foreground text-sm font-medium mb-3">Get weekly curated job alerts and career tips.</p>
              <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-card border-border h-10 rounded-md text-sm"
                  required
                />
                <Button
                  type="submit"
                  className="bg-primary text-primary-foreground font-semibold h-10 rounded-md hover:brightness-110 text-sm"
                  disabled={subscribing}
                >
                  {subscribing ? "..." : "Subscribe"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-6 mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ProvenHire. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
