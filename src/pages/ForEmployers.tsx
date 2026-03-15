import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CheckCircle, Sparkles, Shield, Users, Target, Clock, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";

const ForEmployers = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();

  // Job seeker: employers page is for recruiters; redirect to job seeker experience
  useEffect(() => {
    if (user && userRole === 'jobseeker') {
      navigate('/jobs', { replace: true });
      return;
    }
  }, [user, userRole, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <div className="flex-1 pt-24 pb-20">
        {/* Hero */}
        <section className="container mx-auto px-4 mb-20">
          <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto text-center animate-fade-in">
            <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
              <Sparkles className="mr-1 h-3 w-3" />
              For Hiring Teams
            </Badge>
            
            <h1 className="text-5xl font-bold mb-6">
              Hire <span className="bg-gradient-hero bg-clip-text text-transparent">Verified Talent</span> Faster
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8">
              Access a pool of pre-verified exceptional candidates. Post jobs for free, 
              leverage AI-powered matching, and save weeks on your hiring process.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-gradient-hero hover:opacity-90 transition-opacity shadow-glow">
                <Link to="/auth?role=recruiter">
                  Post Your First Job Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth?role=recruiter">Schedule a Demo</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="container mx-auto px-4 mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">Why Top Companies Choose ProvenHire</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl 2xl:max-w-7xl mx-auto">
            <Card className="border-2 hover:border-primary/50 transition-all">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-hero rounded-xl flex items-center justify-center mb-4 shadow-glow">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">100% Verified Candidates</h3>
                <p className="text-muted-foreground">
                  Every candidate has passed rigorous aptitude tests, DSA challenges, 
                  and expert interviews. No more wasting time on unqualified applicants.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-all">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-hero rounded-xl flex items-center justify-center mb-4 shadow-glow">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Reduce Time-to-Hire by 60%</h3>
                <p className="text-muted-foreground">
                  Skip the initial screening rounds. Our verified talent pool means you start 
                  with final-round interviews immediately.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-all">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-gradient-hero rounded-xl flex items-center justify-center mb-4 shadow-glow">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">AI-Powered Perfect Matches</h3>
                <p className="text-muted-foreground">
                  Our DNA Matching technology considers skills, experience, culture fit, 
                  and career goals for precision hiring.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="bg-secondary py-20">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Complete Hiring Solution</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-hero rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle>AI Job Description Generator</CardTitle>
                      <CardDescription className="mt-2">
                        Create compelling JDs instantly with AI assistance. Automatically optimize 
                        for keywords and candidate attraction.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Generate JD from job title in seconds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Customize tone and requirements</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>SEO-optimized for better reach</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-hero rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                      <Target className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle>DNA Matching Technology</CardTitle>
                      <CardDescription className="mt-2">
                        Our proprietary algorithm matches candidates based on 50+ parameters 
                        beyond just skills and experience.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Technical skill alignment</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Culture and team fit prediction</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Career trajectory matching</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-hero rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle>Pre-Verification & Background Checks</CardTitle>
                      <CardDescription className="mt-2">
                        All candidates come pre-verified with test scores, interview feedback, 
                        and skill validation reports.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Aptitude test results included</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>DSA performance metrics</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Expert interview assessment</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-hero rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle>TA Support & Onboarding</CardTitle>
                      <CardDescription className="mt-2">
                        Get hands-on support from our talent acquisition experts throughout 
                        the entire hiring journey.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Dedicated TA specialist assigned</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Interview coordination support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Day-1 onboarding assistance</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="container mx-auto px-4 py-20">
          <h2 className="text-3xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Post jobs for free forever. Only pay when you make a successful hire.
          </p>
          
          <div className="max-w-md mx-auto">
            <Card className="border-2 border-primary shadow-glow">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-3xl mb-2">Free Forever</CardTitle>
                <CardDescription className="text-base">
                  No upfront costs, no monthly fees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <span>Unlimited job postings</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <span>Access to verified candidate pool</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <span>AI-powered matching & JD generation</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <span>TA support & onboarding help</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                    <span>Pay only on successful hire</span>
                  </li>
                </ul>
                <Button size="lg" className="w-full bg-gradient-hero hover:opacity-90" asChild>
                  <Link to="/auth?role=recruiter">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center p-12 bg-gradient-hero rounded-2xl text-white shadow-glow">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Transform Your Hiring?
            </h2>
            <p className="text-lg opacity-90 mb-8">
              Join 500+ companies hiring exceptional talent through ProvenHire
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/auth?role=recruiter">Post Your First Job</Link>
              </Button>
              <Button size="lg" variant="outline" className="bg-white/10 border-white text-white hover:bg-white/20" asChild>
                <Link to="/auth?role=recruiter">Schedule Demo</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
};

export default ForEmployers;
