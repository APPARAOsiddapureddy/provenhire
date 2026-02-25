import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Shield, Sparkles, Users, Lightbulb, Award, Target, Brain, Video, Clock, TrendingUp, Eye, Lock, Zap, RefreshCw, MessageSquare } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VerificationFlowPreview from "@/components/VerificationFlowPreview";
import SampleReportDialog from "@/components/SampleReportDialog";
import FeedbackWidget from "@/components/FeedbackWidget";
import { Badge } from "@/components/ui/badge";
import {
  HeroBadge,
  TargetVerified,
  PersonVerified,
  ShieldCheck,
  BuildingTrust,
  IconLayers,
  IconClock,
  IconRupee,
} from "@/components/graphics";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      
      {/* Hero Section — Deep Navy + Gold with premium badge graphic */}
      <section className="hero-section">
        <div className="hero-overlay" />
        <div className="container mx-auto relative z-10 px-4">
          <div className="hero-content hero-content-with-graphic">
            <div>
              <div className="flex items-center justify-center lg:justify-start gap-2.5 mb-7 opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.1s" }}>
                <span className="font-mono text-[13px] font-semibold text-muted-foreground tracking-wider">[</span>
                <div className="w-2 h-2 rounded-full bg-[#1FA971] animate-pulse" aria-hidden />
                <span className="font-mono text-[13px] font-bold text-primary tracking-[2px] uppercase">
                  India's First Skill-Certified Hiring Network
                </span>
                <span className="font-mono text-[13px] font-semibold text-muted-foreground tracking-wider">]</span>
              </div>
              <h1 className="hero-title opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.2s" }}>
                <span className="gradient-text">Verified Talent,</span>
                <span className="block text-white/50">Not Resumes.</span>
              </h1>
              <p className="hero-subtitle opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.35s" }}>
                Prove your skills through a <strong>5-layer verification system</strong> in 24–48 hours. Carry a Skill Passport no resume can match. Get hired by companies that trust evidence over college names.
              </p>
              <div className="hero-buttons mb-12 opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.5s" }}>
                <Button size="lg" asChild className="btn-primary btn-hero">
                  <Link to="/auth">
                    Get Certified in 24hrs →
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
                  <Link to="/for-employers">
                    I'm a Recruiter ↗
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap justify-center lg:justify-start gap-0 border-y border-white/12 py-5 opacity-0 animate-fade-in-up animate-fill-forwards" style={{ animationDelay: "0.65s" }}>
                <div className="flex items-center gap-3 px-6 sm:px-8 py-2 border-r border-white/12 first:pl-0 last:border-r-0 last:pr-0 transition-all duration-300 hover:scale-[1.02] hover:bg-white/5 rounded-lg">
                  <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconLayers className="w-6 h-6" />
                  </span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-bebas text-[2.75rem] tracking-[2px] text-primary leading-none">5</span>
                    <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">Verification<br />Layers</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-6 sm:px-8 py-2 border-r border-white/12 first:pl-0 last:border-r-0 last:pr-0 transition-all duration-300 hover:scale-[1.02] hover:bg-white/5 rounded-lg">
                  <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconClock className="w-6 h-6" />
                  </span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-bebas text-[2.75rem] tracking-[2px] text-primary leading-none">24H</span>
                    <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">To Full<br />Certification</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-6 sm:px-8 py-2 border-r border-white/12 first:pl-0 last:border-r-0 last:pr-0 transition-all duration-300 hover:scale-[1.02] hover:bg-white/5 rounded-lg">
                  <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary shrink-0">
                    <IconRupee className="w-6 h-6" />
                  </span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-bebas text-[2.75rem] tracking-[2px] text-primary leading-none">₹0</span>
                    <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">Upfront Cost<br />to Hire</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-badge-wrap hidden lg:flex">
              <HeroBadge size={260} className="text-primary" />
            </div>
          </div>
        </div>
      </section>

      {/* How Verification Works - Visual Flow (#1) */}
      <section className="py-16 bg-secondary border-y border-border scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
            <div>
              <div className="font-mono text-xs font-bold text-primary tracking-[3px] uppercase mb-3 flex items-center gap-3">
                <span className="text-muted-foreground">//</span> How_It_Works
              </div>
              <h2 className="font-bebas text-4xl md:text-6xl tracking-[3px] text-foreground mb-2 font-normal">
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

      {/* AI Interview Transparency Section (#7, #8) */}
      <section className="py-16 bg-background border-b border-border scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 px-4 py-2.5 rounded mb-4 font-mono text-xs font-bold tracking-wider uppercase">
              <Brain className="h-5 w-5" />
              AI Interview Transparency
            </div>
            <div className="bg-card p-6 rounded-lg border border-border mb-6 transition-all duration-300 hover:border-white/15 hover:shadow-lg hover:shadow-black/20">
              <p className="text-lg md:text-xl font-semibold mb-2 text-foreground">
                🤖 AI does not reject candidates.
              </p>
              <p className="text-muted-foreground text-base font-medium">
                It only highlights your strengths and identifies growth areas. Final decisions involve human experts.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card p-5 rounded-lg border border-border transition-all duration-300 hover:translate-y-1 hover:border-primary/30">
                <MessageSquare className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="font-semibold text-foreground text-base">Communication Clarity</p>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border transition-all duration-300 hover:translate-y-1 hover:border-primary/30">
                <Target className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="font-semibold text-foreground text-base">Problem Approach</p>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border transition-all duration-300 hover:translate-y-1 hover:border-primary/30">
                <Brain className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="font-semibold text-foreground text-base">Depth of Thinking</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fast Track for Seniors (#9, #10) */}
      <section className="py-12 bg-secondary border-b border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2 font-mono text-xs font-bold text-primary tracking-wider uppercase">
                <Zap className="h-5 w-5" />
                For Experienced Talent
              </div>
              <p className="text-xl font-semibold mb-1 text-foreground">Have 5+ years experience?</p>
              <p className="text-muted-foreground text-base font-medium">One interview. Reused across multiple companies.</p>
            </div>
            <Button asChild className="bg-primary text-primary-foreground font-extrabold text-base rounded-md hover:brightness-110 transition-transform hover:scale-105">
              <Link to="/auth">Fast Track Application →</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What You Unlock - Progress Gamification (#5) */}
      <section className="py-16 bg-background border-b border-border scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="font-mono text-xs font-bold text-primary tracking-[3px] uppercase mb-3">// What_You_Unlock</div>
          <h2 className="font-bebas text-4xl md:text-5xl tracking-[3px] text-foreground mb-2">What You <span className="text-primary">Unlock</span></h2>
          <p className="text-muted-foreground mb-8 text-base font-medium">Complete verification stages to unlock more opportunities</p>
          <div className="max-w-2xl mx-auto">
            <div className="bg-card p-8 rounded border border-border">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Eye className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-base">30% — Visible to companies</span>
                      <Badge variant="secondary">Profile Setup</Badge>
                    </div>
                    <p className="text-base font-medium text-muted-foreground">Your profile appears in recruiter searches</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-base">60% — Priority screening</span>
                      <Badge variant="secondary">Tests Passed</Badge>
                    </div>
                    <p className="text-base font-medium text-muted-foreground">Get reviewed first by hiring managers</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#1FA971]/20 flex items-center justify-center">
                    <Award className="h-6 w-6 text-[#1FA971]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-base">100% — Verified badge</span>
                      <Badge className="bg-[#1FA971]/20 text-[#1FA971] border border-[#1FA971]/30">Full Access</Badge>
                    </div>
                    <p className="text-base font-medium text-muted-foreground">ProvenHire Skill Passport + all opportunities unlocked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Stage Verification with Time Labels (#6) */}
      <section className="verify-section scroll-mt-20">
        <div className="container mx-auto">
          <div className="font-mono text-xs font-bold text-primary tracking-[3px] uppercase mb-3">// Verification_Pipeline</div>
          <h2 className="font-bebas text-4xl md:text-5xl tracking-[3px] text-foreground mb-2">
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
      <section className="features-section scroll-mt-20">
        <div className="container mx-auto">
          <div className="font-mono text-xs font-bold text-primary tracking-[3px] uppercase mb-3">// Why_ProvenHire</div>
          <h2 className="font-bebas text-4xl md:text-5xl tracking-[3px] text-foreground mb-2">Why Choose <span className="text-primary">ProvenHire?</span></h2>
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
          <div className="max-w-2xl mx-auto text-center">
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
        <div className="container mx-auto">
          <h2 className="font-bebas text-4xl md:text-5xl tracking-[2px] text-foreground mb-2">Ready to Get <span className="text-primary">Skill-Certified?</span></h2>
          <p className="text-muted-foreground mb-8 text-lg font-medium">Join India's first skill-certified hiring network where every candidate is verified before you hire</p>
          <div className="hero-buttons">
            <Button size="lg" asChild className="btn-primary btn-hero">
              <Link to="/auth">Start Verification →</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
              <Link to="/for-employers">Hire Certified Talent</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feedback Widget (#20) */}
      <div className="py-6 bg-background border-t">
        <div className="container mx-auto px-4 flex justify-center">
          <FeedbackWidget context="landing-page" />
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Index;
