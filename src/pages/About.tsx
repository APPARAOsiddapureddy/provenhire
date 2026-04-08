import { Card, CardContent } from "@/components/ui/card";
import { Shield, Target, Users, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { MarketingPageHero } from "@/components/MarketingPageHero";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="About ProvenHire – Verified Hiring Platform"
        description="Learn how ProvenHire verifies talent through skill validation, coding verification, and structured interviews. Our mission and process."
        path="/about"
      />
      <Navbar />

      <MarketingPageHero
        eyebrow="About"
        title={
          <>
            Our <span className="text-primary">mission</span>
          </>
        }
        subtitle="We're building a hiring platform where talent is verified, skills are real, and every opportunity is matched with purpose."
      />

      <div className="marketing-content-band py-14 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto mb-16">
            <h2 className="text-sm font-mono font-bold text-primary uppercase tracking-wider text-center mb-10">
              How we verify talent
            </h2>

            <div className="space-y-6">
              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-bold shadow-glow">
                        1
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Cognitive Assessment & CS Fundamentals</h3>
                      <p className="text-muted-foreground">
                        Candidates take a comprehensive test covering logical reasoning, problem-solving, and computer science
                        fundamentals. This filters for critical thinking and foundational knowledge.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-bold shadow-glow">
                        2
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">DSA Coding Challenges</h3>
                      <p className="text-muted-foreground">
                        Real-time Data Structures and Algorithms challenges test coding proficiency and problem-solving ability.
                        We evaluate code quality, optimization, and approach to complex problems.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-bold shadow-glow">
                        3
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Expert Interview Round</h3>
                      <p className="text-muted-foreground">
                        A senior professional with 5+ years of experience conducts a live interview. This human check ensures
                        communication skills, verifies integrity, and assesses cultural fit potential.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/35 bg-primary/10">
                <CardContent className="pt-6">
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground shadow-glow">
                        <Shield className="h-6 w-6" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 text-primary">Verified Profile Badge</h3>
                      <p className="text-muted-foreground">
                        Upon successful completion, candidates receive a verified profile badge that showcases their test scores,
                        interview feedback, and validated skills. This credential sets them apart in the job market.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto mb-20">
            <h2 className="text-sm font-mono font-bold text-primary uppercase tracking-wider text-center mb-10">
              Our core values
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <Target className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Integrity First</h3>
                  <p className="text-muted-foreground">
                    We believe in honesty and transparency. Our verification process is designed to reward genuine talent, not
                    shortcuts. Every candidate who joins represents real, validated skills.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <Zap className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Innovation & AI</h3>
                  <p className="text-muted-foreground">
                    We leverage cutting-edge AI technology for matching, job description generation, and profile optimization—making
                    the hiring process smarter and more efficient for everyone.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <Users className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Community & Support</h3>
                  <p className="text-muted-foreground">
                    From candidates to hiring teams, everyone gets hands-on support. Our talent acquisition team is here to guide
                    you from job posting through successful onboarding.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <Shield className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Trust & Credibility</h3>
                  <p className="text-muted-foreground">
                    Being on ProvenHire is a badge of honor. We maintain the highest standards because both job seekers and
                    employers deserve a platform they can trust completely.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto text-center p-8 bg-primary text-primary-foreground rounded-2xl shadow-lg border border-primary/30">
            <h2 className="text-3xl font-bold mb-4 font-bebas tracking-wide">Built for Real Talent</h2>
            <p className="text-lg opacity-95 mb-6">
              This platform is not about shortcuts. We value honesty, passion, and real talent. Please approach this journey with
              integrity—because only true talent shines here.
            </p>
            <p className="text-sm opacity-90">
              Our verification process is designed to celebrate your abilities and give you the recognition you deserve in a
              competitive job market.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default About;
