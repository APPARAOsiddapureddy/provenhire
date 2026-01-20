import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Shield, Sparkles, Users, Lightbulb, Award, Target, Brain, Video, Clock, TrendingUp, Eye, Lock, Zap, RefreshCw, MessageSquare } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VerificationFlowPreview from "@/components/VerificationFlowPreview";
import SampleReportDialog from "@/components/SampleReportDialog";
import FeedbackWidget from "@/components/FeedbackWidget";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      
      {/* Hero Section - Updated Headlines (#15, #16) */}
      <section className="hero-section">
        <div className="hero-overlay" />
        <div className="container mx-auto relative z-10">
          <div className="hero-content">
            {/* Early Access Badge (#18) */}
            <div className="mb-4 flex flex-wrap gap-2 justify-center">
              <Badge className="bg-amber-500/20 text-amber-100 border-amber-400/30">
                🚀 Early Access — Building with you
              </Badge>
              <span className="bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-full inline-block">
                India's First Skill-Certified Hiring Network
              </span>
            </div>
            {/* Fixed Hero Headline (#15) */}
            <h1 className="hero-title">
              <span className="gradient-text">Verified Talent</span>, Not Resumes
            </h1>
            {/* Sub-line for Candidates (#16) */}
            <p className="hero-subtitle">
              Prove your skills once. Get hired faster.<br />
              <span className="text-white/70 text-base">Every candidate here has proven their skills through our rigorous 3-stage verification.</span>
            </p>
            <div className="flex flex-wrap gap-4 justify-center mb-8">
              <div className="flex items-center gap-2 text-white/90">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span>3-Stage Verification</span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <RefreshCw className="h-5 w-5 text-green-400" />
                <span>Interview Once, Use Everywhere</span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <Award className="h-5 w-5 text-green-400" />
                <span>ProvenHire Skill Passport</span>
              </div>
            </div>
            <div className="hero-buttons">
              <Button size="lg" asChild className="btn-primary btn-hero">
                <Link to="/auth">
                  Get Verified Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
                <Link to="/for-employers">
                  Hire Certified Talent
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How Verification Works - Visual Flow (#1) */}
      <section className="py-12 bg-card border-b">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">How Verification Works</h2>
            <p className="text-muted-foreground">Transparent process, no black boxes</p>
          </div>
          <VerificationFlowPreview />
          <div className="flex justify-center mt-8 gap-4">
            <SampleReportDialog />
          </div>
        </div>
      </section>

      {/* AI Interview Transparency Section (#7, #8) */}
      <section className="py-12 bg-blue-50 dark:bg-blue-950/20 border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full mb-4">
              <Brain className="h-4 w-4" />
              <span className="font-medium">AI Interview Transparency</span>
            </div>
            {/* AI Role Disclaimer (#7) */}
            <div className="bg-white dark:bg-card p-6 rounded-xl border mb-6">
              <p className="text-lg font-medium mb-2">
                🤖 AI does not reject candidates.
              </p>
              <p className="text-muted-foreground">
                It only highlights your strengths and identifies growth areas. Final decisions involve human experts.
              </p>
            </div>
            {/* AI Evaluation Criteria (#8) */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-white dark:bg-card p-4 rounded-lg border">
                <MessageSquare className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="font-medium">Communication Clarity</p>
              </div>
              <div className="bg-white dark:bg-card p-4 rounded-lg border">
                <Target className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="font-medium">Problem Approach</p>
              </div>
              <div className="bg-white dark:bg-card p-4 rounded-lg border">
                <Brain className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="font-medium">Depth of Thinking</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fast Track for Seniors (#9, #10) */}
      <section className="py-10 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-b">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-amber-600" />
                <span className="font-semibold text-amber-800 dark:text-amber-300">For Experienced Talent</span>
              </div>
              <p className="text-lg font-medium mb-1">Have 5+ years experience?</p>
              <p className="text-muted-foreground text-sm">One interview. Reused across multiple companies.</p>
            </div>
            <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
              <Link to="/auth">Fast Track Application →</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What You Unlock - Progress Gamification (#5) */}
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="section-header">
            <h2>What You Unlock</h2>
            <p>Complete verification stages to unlock more opportunities</p>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="bg-card p-8 rounded-xl border shadow-sm">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Eye className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">30% — Visible to companies</span>
                      <Badge variant="secondary">Profile Setup</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Your profile appears in recruiter searches</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">60% — Priority screening</span>
                      <Badge variant="secondary">Tests Passed</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Get reviewed first by hiring managers</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Award className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">100% — Verified badge</span>
                      <Badge className="bg-green-100 text-green-700">Full Access</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">ProvenHire Skill Passport + all opportunities unlocked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Stage Verification with Time Labels (#6) */}
      <section className="verify-section">
        <div className="container mx-auto">
          <div className="section-header">
            <span className="bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full inline-block mb-4">
              Our Rigorous Process
            </span>
            <h2>3-Stage Verification System</h2>
            <p>Only the top 18% of candidates pass our multi-stage verification to earn the ProvenHire Skill Passport</p>
          </div>
          <div className="verify-grid">
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">1</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> ~30 min
              </div>
              <div className="verify-icon"><Target className="h-8 w-8" /></div>
              <h3>Aptitude + CS Fundamentals</h3>
              <p className="mb-3">Hard aptitude, logical reasoning, OS, DBMS, OOPS, CN, basic DSA</p>
              <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-semibold text-destructive">~70% eliminated</span> • Anti-cheat enabled
              </div>
            </div>
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">2</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> ~45 min
              </div>
              <div className="verify-icon"><Brain className="h-8 w-8" /></div>
              <h3>Role-Specific Skill Test</h3>
              <p className="mb-3">Coding test, debugging, system design MCQs, SQL, case studies based on role</p>
              <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-semibold text-amber-600">Only top 20% advance</span>
              </div>
            </div>
            <div className="verify-card relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">3</div>
              <div className="absolute -top-3 right-3 flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> ~20 min
              </div>
              <div className="verify-icon"><Video className="h-8 w-8" /></div>
              <h3>Expert Interview</h3>
              <p className="mb-3">AI-assisted interview with fixed evaluation rubric, skill scoring 1-5</p>
              <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-semibold text-green-600">Certified Level A/B/C</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container mx-auto">
          <div className="section-header">
            <h2>Why Choose ProvenHire?</h2>
            <p>Benefits for both job seekers and employers</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>For Job Seekers</h3>
              <ul>
                <li>✓ Earn ProvenHire Skill Passport</li>
                <li>✓ Get Certified Level A/B/C</li>
                <li>✓ Skip repetitive interviews</li>
                <li>✓ Direct access to top companies</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🏢</div>
              <h3>For Employers</h3>
              <ul>
                <li>✓ Pre-verified talent pool</li>
                <li>✓ No screening needed — validate fit</li>
                <li>✓ Reduce time-to-hire by 60%</li>
                <li>✓ Pay only when you hire</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
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
      <section className="py-12 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-card p-8 rounded-xl border shadow-sm">
              <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-4">A Note from Our Team</h3>
              <p className="text-muted-foreground italic leading-relaxed">
                "We're building hiring on proof, not claims. It's hard. We're doing it anyway. 
                Every feature we build is designed to make hiring fair — for candidates who deserve 
                to be seen for their skills, and for companies who deserve to hire with confidence."
              </p>
              <p className="mt-4 text-sm text-muted-foreground">— The ProvenHire Team</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container mx-auto">
          <h2>Ready to Get Skill-Certified?</h2>
          <p>Join India's first skill-certified hiring network where every candidate is verified before you hire</p>
          <div className="hero-buttons">
            <Button size="lg" variant="outline" asChild className="btn-outline btn-hero">
              <Link to="/auth">
                Start Verification
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild className="btn-secondary btn-hero">
              <Link to="/for-employers">
                Hire Certified Talent
              </Link>
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
