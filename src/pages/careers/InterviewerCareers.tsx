import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/PhoneInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { MarketingPageHero } from "@/components/MarketingPageHero";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Code,
  MessageSquare,
  Clock,
  CheckCircle,
  ArrowRight,
  Video,
  UserCheck,
  Briefcase,
  Search,
} from "lucide-react";
import InterviewerConducting from "@/components/graphics/InterviewerConducting";
import { INTERVIEWER_ROLES } from "@/data/interviewerRoles";

export default function InterviewerCareers() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    experienceYears: "" as string | number,
    primaryRole: "" as string,
    phone: "",
    linkedIn: "",
    currentCompany: "",
    jobTitle: "",
    whyJoin: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    if (!form.primaryRole) {
      toast.error("Please select your primary role.");
      return;
    }
    const yrs = form.experienceYears === "" ? NaN : Number(form.experienceYears);
    if (!Number.isFinite(yrs) || yrs < 5) {
      toast.error("Minimum 5 years of industry experience is required.");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone is required.");
      return;
    }
    if (!form.linkedIn.trim()) {
      toast.error("LinkedIn URL is required.");
      return;
    }
    if (!form.currentCompany.trim() || !form.jobTitle.trim()) {
      toast.error("Current company and job title are required.");
      return;
    }
    if (form.whyJoin.trim().length < 100) {
      toast.error("Please tell us why you want to join (at least 100 characters).");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/interviewer-application", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        experienceYears: yrs,
        primaryRole: form.primaryRole,
        phone: form.phone.trim(),
        linkedIn: form.linkedIn.trim(),
        currentCompany: form.currentCompany.trim(),
        jobTitle: form.jobTitle.trim(),
        whyJoin: form.whyJoin.trim(),
      });
      setSubmitted(true);
      toast.success("Application submitted successfully!");
    } catch (err: any) {
      const msg = err?.message || err?.error || "Submission failed. Please try again.";
      toast.error(typeof msg === "string" ? msg : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <SEO
          title="Application received | Expert interviewer | ProvenHire"
          description="Your expert interviewer application was submitted."
          path="/careers/interviewer"
        />
        <Navbar />
        <MarketingPageHero
          eyebrow="Careers"
          title={
            <>
              Application <span className="text-primary">received</span>
            </>
          }
          subtitle="Thanks for applying to become an Expert Interviewer. Our team will review your application and get back to you within 3–5 business days."
        />
        <div className="marketing-content-band py-16 md:py-20">
          <div className="container mx-auto px-4 max-w-xl text-center">
            <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-[#1FA971]/15 border border-[#1FA971]/35 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-[#1FA971]" aria-hidden />
            </div>
            <Button asChild className="btn-primary shadow-glow">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Expert interviewer careers | ProvenHire"
        description="Apply to conduct live expert interviews for ProvenHire. Flexible schedule, technical and non-technical tracks."
        path="/careers/interviewer"
      />
      <Navbar />

      <MarketingPageHero
        eyebrow="Careers"
        title={
          <>
            Conduct <span className="text-primary">expert</span> interviews
          </>
        }
        subtitle="Join our interviewer panel: live video sessions, structured rubrics, and flexible availability. This is not a job seeker application — you are applying to interview candidates."
      />

      <div className="marketing-content-band pb-20">
        <section className="border-b border-border/80 bg-primary/5 py-4">
          <div className="container mx-auto px-4">
            <Alert className="max-w-3xl mx-auto border-primary/30 bg-card/60">
              <UserCheck className="h-5 w-5 text-primary" />
              <AlertDescription className="font-semibold text-foreground">
                For experienced professionals who want to conduct interviews — not for job seekers. Minimum 5 years of industry
                experience. Not for you? Use Find Jobs or Employers &amp; recruiters below.
              </AlertDescription>
            </Alert>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10">
            <div className="flex-shrink-0">
              <InterviewerConducting size={220} className="mx-auto" />
              <div className="flex justify-center gap-8 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />
                  You conduct the interview
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/60" aria-hidden />
                  Candidate is interviewed
                </span>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <Badge className="mb-4 bg-primary/15 text-primary border-primary/30">
                <Video className="mr-1 h-3 w-3" />
                Expert interviewer role
              </Badge>
              <p className="text-lg text-muted-foreground mb-4">
                Live video calls, evaluation rubrics, and impact on verified talent. Technical and non-technical tracks
                supported.
              </p>
              <p className="text-sm text-muted-foreground/85">
                This is not a job application. You are applying to become someone who <strong className="text-foreground">interviews</strong> job seekers.
              </p>
            </div>
          </div>
        </section>

        {/* Not for you? */}
        <section className="container mx-auto px-4 mb-16">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-4 justify-center items-center p-4 rounded-xl border-2 border-primary/15 bg-card/45">
            <span className="text-sm font-medium text-muted-foreground">Not for you?</span>
            <div className="flex gap-4">
              <Link
                to="/jobs"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Search className="h-4 w-4" />
                Find Jobs
              </Link>
              <Link
                to="/for-recruiters"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Briefcase className="h-4 w-4" />
                Employers &amp; recruiters
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="container mx-auto px-4 mb-16">
          <h2 className="text-xl font-bold text-center mb-8">What you get as an interviewer</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
            <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Flexible schedule</h3>
                <p className="text-sm text-muted-foreground">Set your own availability. Conduct interviews when it suits you.</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Code className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Technical & non-tech</h3>
                <p className="text-sm text-muted-foreground">DSA, Full Stack, System Design, Product, and more.</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-primary/12 bg-card/45 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Real impact</h3>
                <p className="text-sm text-muted-foreground">Evaluate candidates and help them prove their skills.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Application form */}
        <section className="container mx-auto px-4">
          <Card className="max-w-2xl mx-auto border-2 border-primary/15 bg-card/50">
            <CardHeader>
              <CardTitle>Apply to become an interviewer</CardTitle>
              <CardDescription>Fill in your details. We'll review and invite you to join the expert panel.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">Years of experience * (min 5)</Label>
                  <Input
                    id="experience"
                    type="number"
                    min={5}
                    max={50}
                    value={form.experienceYears}
                    onChange={(e) => setForm((p) => ({ ...p, experienceYears: e.target.value }))}
                    placeholder="e.g. 8"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Current company *</Label>
                    <Input
                      id="company"
                      value={form.currentCompany}
                      onChange={(e) => setForm((p) => ({ ...p, currentCompany: e.target.value }))}
                      placeholder="Where you work today"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle">Current job title *</Label>
                    <Input
                      id="jobTitle"
                      value={form.jobTitle}
                      onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                      placeholder="e.g. Senior Backend Engineer"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Primary role *</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Choose the role you can interview candidates for (e.g. Backend, Frontend, Marketing).
                  </p>
                  <select
                    value={form.primaryRole}
                    onChange={(e) => setForm((p) => ({ ...p, primaryRole: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    required
                  >
                    <option value="">Select your role</option>
                    {INTERVIEWER_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} ({r.track === "technical" ? "Technical" : "Non-Technical"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <PhoneInput
                    id="phone"
                    value={form.phone}
                    onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                    placeholder="9876543210"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn profile URL *</Label>
                  <Input
                    id="linkedin"
                    type="url"
                    value={form.linkedIn}
                    onChange={(e) => setForm((p) => ({ ...p, linkedIn: e.target.value }))}
                    placeholder="https://linkedin.com/in/..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whyJoin">Why join ProvenHire? * (min 100 characters)</Label>
                  <Textarea
                    id="whyJoin"
                    value={form.whyJoin}
                    onChange={(e) => setForm((p) => ({ ...p, whyJoin: e.target.value }))}
                    placeholder="What draws you to conducting expert interviews with us..."
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{form.whyJoin.trim().length} / 100+</p>
                </div>

                <Button type="submit" className="w-full btn-primary shadow-glow" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit application"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>

      <Footer />
    </div>
  );
}

