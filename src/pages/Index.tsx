import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Shield, Sparkles, Users, Lightbulb, Award, Target, Brain, Video, Clock, TrendingUp, Eye, Lock, RefreshCw } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import VerificationFlowPreview from "@/components/VerificationFlowPreview";
import SampleReportDialog from "@/components/SampleReportDialog";
import { Badge } from "@/components/ui/badge";
import {
  TargetVerified,
  PersonVerified,
  ShieldCheck,
  BuildingTrust,
  IconLayers,
  IconClock,
  IconRupee,
} from "@/components/graphics";
import VerificationStagesCard from "@/components/VerificationStagesCard";

const Index = () => {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user || userRole === null) return;
    if (userRole === "admin") navigate("/admin/dashboard", { replace: true });
    else if (userRole === "recruiter") navigate("/dashboard/recruiter", { replace: true });
    else if (userRole === "expert_interviewer") navigate("/dashboard/expert", { replace: true });
    else if (userRole === "jobseeker") navigate("/dashboard/jobseeker", { replace: true });
  }, [user, userRole, loading, navigate]);

  if (loading || (user && userRole !== null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen index-page">
      <SEO
        title="ProvenHire – Hire Verified Talent with Skill Validation"
        description="ProvenHire helps companies hire verified talent through skill validation, coding verification, and structured interviews. Build reliable teams with proven skills."
        path="/"
      />
      <Navbar />
      
      {/* Hero Section — Deep Navy + Gold with premium badge graphic */}
      <section className="hero-section" aria-labelledby="hero-heading">
        <div className="hero-overlay" />
        <div className="container mx-auto relative z-10 px-4 sm:px-6">
          <div className="hero-content hero-content-with-graphic">
            <div className="min-w-0">
              <div className="hero-badge-wrap-mobile mb-6 lg:mb-7 opacity-0 animate-fade-in-up animate-fill-forwards lg:hidden" style={{ animationDelay: "0.1s" }}>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] sm:text-[13px] font-extrabold text-primary tracking-wider uppercase px-3 py-1.5 rounded-md bg-primary/15 border border-primary/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1FA971] animate-pulse" aria-hidden />
                  India&apos;s First Skill Passport Platform
                </span>
              </div>
              <div className="hidden lg:flex items-center justify-start gap-1.5 sm:gap-2.5 mb-7 opacity-0 animate-fade-in-up animate-fill-forwards shrink-0" style={{ animationDelay: "0.1s" }}>
                <span className="font-mono text-[11px] sm:text-[13px] font-semibold text-muted-foreground tracking-wider shrink-0">[</span>
                <div className="w-2 h-2 rounded-full bg-[#1FA971] animate-pulse shrink-0" aria-hidden />
                <span className="font-mono text-[11px] sm:text-[15px] font-extrabold text-primary tracking-[1px] sm:tracking-[2px] uppercase px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-primary/15 border border-primary/30 shadow-lg shadow-primary/10 text-center whitespace-nowrap shrink-0">
                  First Indian Skill Passport Certified Verification Platform
                </span>
                <span className="font-mono text-[11px] sm:text-[13px] font-semibold text-muted-foreground tracking-wider shrink-0">]</span>
              </div>
              <h1 id="hero-heading" className="hero-title opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.2s" }}>
                <span className="gradient-text">Hire Verified Talent</span>
                <span className="block text-white font-bold" style={{ fontFamily: 'var(--font-bebas), sans-serif' }}>with ProvenHire</span>
              </h1>
              <p className="hero-subtitle opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.35s" }}>
                Prove your skills through a <strong>5-layer verification system</strong> in 24–48 hours.{" "}
                <span className="text-primary font-semibold drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]">
                  Complete all 5 stages to unlock your Skill Passport and access premium opportunities.
                </span>
              </p>
              <div className="hero-buttons mb-8 sm:mb-12 opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.5s" }}>
                <Button size="lg" asChild className="btn-primary btn-hero">
                  <Link to="/auth">
                    Get Certified in 24hrs →
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
                  <Link to="/for-employers">
                    I&apos;m a Recruiter ↗
                  </Link>
                </Button>
              </div>
              {/* Desktop: original pill design. Mobile: stacked cards via CSS. */}
              <div className="hero-stats hero-stats-desktop opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.65s" }}>
                <div className="hero-stat-pill">
                  <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconLayers className="w-4 h-4 sm:w-5 sm:h-5" />
                  </span>
                  <div className="flex items-baseline gap-1.5 sm:gap-2">
                    <span className="font-bebas text-xl sm:text-2xl tracking-[1px] text-primary leading-none">5</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight whitespace-nowrap">Verification Layers</span>
                  </div>
                </div>
                <div className="hero-stat-pill">
                  <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconClock className="w-4 h-4 sm:w-5 sm:h-5" />
                  </span>
                  <div className="flex items-baseline gap-1.5 sm:gap-2">
                    <span className="font-bebas text-xl sm:text-2xl tracking-[1px] text-primary leading-none">24H</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight whitespace-nowrap">To Full Certification</span>
                  </div>
                </div>
                <div className="hero-stat-pill">
                  <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconRupee className="w-4 h-4 sm:w-5 sm:h-5" />
                  </span>
                  <div className="flex items-baseline gap-1.5 sm:gap-2">
                    <span className="font-bebas text-xl sm:text-2xl tracking-[1px] text-primary leading-none">₹0</span>
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight whitespace-nowrap">Upfront Cost to Hire</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-badge-wrap hidden lg:flex">
              <VerificationStagesCard />
            </div>
          </div>
        </div>
      </section>

      {/* How Verification Works - Visual Flow (#1) */}
      <section className="py-12 sm:py-16 bg-secondary border-y border-border scroll-mt-20" aria-labelledby="how-it-works-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
            <div>
              <div className="font-mono text-[10px] sm:text-xs font-bold text-primary tracking-[2px] sm:tracking-[3px] uppercase mb-2 sm:mb-3 flex items-center gap-2">
                <span className="text-muted-foreground">//</span> How_It_Works
              </div>
              <h2 id="how-it-works-heading" className="font-bebas text-3xl sm:text-4xl md:text-6xl tracking-[2px] sm:tracking-[3px] text-foreground mb-2 font-normal">
                How Verification <span className="text-primary">Works</span>
              </h2>
              <p className="text-muted-foreground text-base font-medium">Transparent process, no black boxes</p>
            </div>
            <div className="hidden md:flex shrink-0 text-primary/90">
              <TargetVerified size={100} />
            </div>
          </div>
          <VerificationFlowPreview />
          <div className="flex justify-center mt-8 gap-4">
            <SampleReportDialog />
          </div>
        </div>
      </section>

      {/* What You Unlock - Progress Gamification (#5) */}
      <section className="py-12 sm:py-16 bg-background border-b border-border scroll-mt-20" aria-labelledby="what-you-unlock-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="font-mono text-[10px] sm:text-xs font-bold text-primary tracking-[2px] sm:tracking-[3px] uppercase mb-2 sm:mb-3">// What_You_Unlock</div>
          <h2 id="what-you-unlock-heading" className="font-bebas text-3xl sm:text-4xl md:text-5xl tracking-[2px] sm:tracking-[3px] text-foreground mb-2">What You <span className="text-primary">Unlock</span></h2>
          <p className="text-muted-foreground mb-8 text-base font-medium">Complete verification stages to unlock more opportunities</p>
          <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto">
            <div className="bg-card p-8 rounded border border-border">
              <div className="space-y-6">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                      <span className="font-semibold text-sm sm:text-base">30% — Visible to companies</span>
                      <Badge variant="secondary" className="w-fit">Profile Setup</Badge>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-muted-foreground">Your profile appears in recruiter searches</p>
                  </div>
                </div>
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                      <span className="font-semibold text-sm sm:text-base">60% — Priority screening</span>
                      <Badge variant="secondary" className="w-fit">Tests Passed</Badge>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-muted-foreground">Get reviewed first by hiring managers</p>
                  </div>
                </div>
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#1FA971]/20 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 sm:h-6 sm:w-6 text-[#1FA971]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                      <span className="font-semibold text-sm sm:text-base">100% — Verified badge</span>
                      <Badge className="bg-[#1FA971]/20 text-[#1FA971] border border-[#1FA971]/30 w-fit">Full Access</Badge>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-muted-foreground">ProvenHire Skill Passport + all opportunities unlocked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEO-rich content: skill verified hiring, coding verification, why ProvenHire */}
      <section className="py-12 sm:py-16 bg-secondary/50 border-y border-border scroll-mt-20" aria-labelledby="skill-verified-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-10 text-foreground">
            <h2 id="skill-verified-heading" className="font-bebas text-3xl sm:text-4xl tracking-[2px] text-foreground">
              Skill Verified Hiring
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">ProvenHire</strong> is India&apos;s first verified hiring platform built on skill validation, not resumes. Companies waste weeks screening candidates who overstate their abilities. ProvenHire solves this by verifying every candidate through a multi-stage process before they reach your shortlist. Whether you need developers, engineers, or professionals, our <Link to="/jobs" className="text-primary hover:underline font-medium">job listings</Link> show only skill-verified talent. Recruiters use ProvenHire to <Link to="/for-employers" className="text-primary hover:underline font-medium">hire certified candidates</Link> with confidence.
            </p>

            <h2 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-foreground">
              Live Coding Verification
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Our verified hiring platform includes live coding and role-specific assessments. Candidates complete timed tests in a proctored environment, so you see real problem-solving ability—not memorised answers. This coding verification step filters out the majority of unqualified applicants before they ever reach an interview. For technical roles, ProvenHire&apos;s AI hiring platform combines aptitude tests, DSA rounds, and expert interviews to produce a clear skill level (A, B, or C). Recruiters get a <strong className="text-foreground">skill verification hiring</strong> pipeline that cuts time-to-hire and improves quality.
            </p>

            <h2 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-foreground">
              Structured Interview Scoring
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Beyond coding verification, ProvenHire uses structured interview scoring with fixed rubrics. Every candidate is evaluated on the same criteria, reducing bias and giving you comparable data across applicants. Our AI hiring platform supports both technical and non-technical roles: developers go through aptitude, live coding, and expert interviews; non-technical candidates complete assignments and human expert interviews. All results feed into a single <strong className="text-foreground">Proven Hire</strong> Skill Passport that travels with the candidate. <Link to="/verification" className="text-primary hover:underline font-medium">Start skill verification</Link> and join the verified hiring platform trusted by companies and job seekers alike.
            </p>

            <h2 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-foreground">
              Why Companies Trust ProvenHire
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Hiring today is broken: résumés are inflated, screening is slow, and bad hires are costly. ProvenHire fixes this with a verified hiring platform that proves skills before the first interview. Job seekers get certified in 24–48 hours and unlock access to premium roles; recruiters get a pre-verified talent pool and can focus on fit instead of filtering. Our developer hiring platform and coding assessment pipeline are designed for scale—whether you&apos;re hiring one developer or building an entire team. As an AI hiring platform, ProvenHire combines automation with human expert review for a fair, fast, and reliable process. Explore <Link to="/jobs" className="text-primary hover:underline font-medium">verified jobs</Link>, learn more <Link to="/about" className="text-primary hover:underline font-medium">about us</Link>, or <Link to="/for-employers" className="text-primary hover:underline font-medium">post a job</Link> and start hiring verified talent with ProvenHire.
            </p>
          </div>
        </div>
      </section>

      {/* 3-Stage Verification with Time Labels (#6) */}
      <section className="verify-section scroll-mt-20" aria-labelledby="verification-pipeline-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="font-mono text-[10px] sm:text-xs font-bold text-primary tracking-[2px] sm:tracking-[3px] uppercase mb-2 sm:mb-3">// Verification_Pipeline</div>
          <h2 id="verification-pipeline-heading" className="font-bebas text-3xl sm:text-4xl md:text-5xl tracking-[2px] sm:tracking-[3px] text-foreground mb-2">
            Five <span className="text-primary">Stages.</span> One <span className="text-primary">Credential.</span>
          </h2>
          <p className="text-muted-foreground mb-8 text-base font-medium">Only the top 18% of candidates pass our multi-stage verification to earn the ProvenHire Skill Passport</p>
          <div className="verify-grid">
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">1</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2.5 py-1 rounded text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" /> ~30 min
              </div>
              <div className="verify-icon"><Target className="h-8 w-8" /></div>
              <h3 className="text-lg font-bold">Aptitude + CS Fundamentals</h3>
              <p className="mb-3 text-base font-medium">Hard aptitude, logical reasoning, OS, DBMS, OOPS, CN, basic DSA</p>
              <div className="text-base font-medium text-muted-foreground bg-muted/50 p-2.5 rounded">
                <span className="font-semibold text-destructive">~70% eliminated</span> • Anti-cheat enabled
              </div>
            </div>
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">2</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2.5 py-1 rounded text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" /> ~45 min
              </div>
              <div className="verify-icon"><Brain className="h-8 w-8" /></div>
              <h3 className="text-lg font-bold">Role-Specific Skill Test</h3>
              <p className="mb-3 text-base font-medium">Coding test, debugging, system design MCQs, SQL, case studies based on role</p>
              <div className="text-base font-medium text-muted-foreground bg-muted/50 p-2.5 rounded">
                <span className="font-semibold text-amber-600">Only top 20% advance</span>
              </div>
            </div>
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">3</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2.5 py-1 rounded text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" /> ~20 min
              </div>
              <div className="verify-icon"><Video className="h-8 w-8" /></div>
              <h3 className="text-lg font-bold">Expert Interview</h3>
              <p className="mb-3 text-base font-medium">AI-assisted interview with fixed evaluation rubric, skill scoring 1-5</p>
              <div className="text-base font-medium text-muted-foreground bg-muted/50 p-2.5 rounded">
                <span className="font-semibold text-[#1FA971]">Certified Level A/B/C</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section scroll-mt-20" aria-labelledby="why-provenhire-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="font-mono text-[10px] sm:text-xs font-bold text-primary tracking-[2px] sm:tracking-[3px] uppercase mb-2 sm:mb-3">// Why_ProvenHire</div>
          <h2 id="why-provenhire-heading" className="font-bebas text-3xl sm:text-4xl md:text-5xl tracking-[2px] sm:tracking-[3px] text-foreground mb-2">Why Companies Trust <span className="text-primary">ProvenHire</span></h2>
          <p className="text-muted-foreground mb-8 text-base font-medium">Benefits for both job seekers and employers</p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon flex items-center justify-center text-primary">
                <PersonVerified size={64} />
              </div>
              <h3>For Job Seekers</h3>
              <ul>
                <li>✓ Earn ProvenHire Skill Passport</li>
                <li>✓ Get Certified Level A/B/C</li>
                <li>✓ Skip repetitive interviews</li>
                <li>✓ Direct access to top companies</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon flex items-center justify-center text-primary">
                <BuildingTrust size={64} />
              </div>
              <h3>For Employers</h3>
              <ul>
                <li>✓ Pre-verified talent pool</li>
                <li>✓ No screening needed — validate fit</li>
                <li>✓ Reduce time-to-hire by 60%</li>
                <li>✓ Pay only when you hire</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon flex items-center justify-center text-primary">
                <ShieldCheck size={64} />
              </div>
              <h3>Anti-Cheat Protection</h3>
              <ul>
                <li>✓ Full-screen mode enforcement</li>
                <li>✓ Tab-switch detection</li>
                <li>✓ Webcam snapshot verification</li>
                <li>✓ AI proctoring technology</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Founder Note (#19) */}
      <section className="py-12 bg-secondary border-y border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto text-center">
            <div className="bg-card p-8 rounded-lg border border-border transition-all duration-300 hover:border-white/15 hover:shadow-lg hover:shadow-black/20">
              <div className="w-20 h-20 rounded-full bg-primary/10 mx-auto mb-4 flex items-center justify-center text-primary">
                <PersonVerified size={48} />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-foreground">A Note from Our Team</h3>
              <p className="text-muted-foreground text-base font-medium italic leading-relaxed">
                "We're building hiring on proof, not claims. It's hard. We're doing it anyway. 
                Every feature we build is designed to make hiring fair — for candidates who deserve 
                to be seen for their skills, and for companies who deserve to hire with confidence."
              </p>
              <p className="mt-4 text-base font-semibold text-muted-foreground">— The ProvenHire Team</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6">
          <h2 className="font-bebas text-3xl sm:text-4xl md:text-5xl tracking-[2px] text-foreground mb-2 text-center">Ready to Get <span className="text-primary">Skill-Certified?</span></h2>
          <p className="text-muted-foreground mb-8 text-base sm:text-lg font-medium text-center max-w-xl xl:max-w-2xl 2xl:max-w-3xl mx-auto">Join India&apos;s first skill-certified hiring network where every candidate is verified before you hire</p>
          <div className="hero-buttons flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button size="lg" asChild className="btn-primary btn-hero">
              <Link to="/auth">Start Verification →</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
              <Link to="/for-employers">Hire Certified Talent</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
