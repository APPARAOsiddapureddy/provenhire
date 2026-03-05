import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
    setSubmitting(true);
    try {
      await api.post("/api/interviewer-application", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        experienceYears: form.experienceYears === "" ? undefined : Number(form.experienceYears),
        primaryRole: form.primaryRole,
        linkedIn: form.linkedIn.trim() || undefined,
        whyJoin: form.whyJoin.trim() || undefined,
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
        <Navbar />
        <div className="flex-1 pt-24 pb-20">
          <section className="container mx-auto px-4 max-w-xl mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Application Received</h1>
            <p className="text-muted-foreground mb-8">
              Thanks for applying to become an Expert Interviewer. Our team will review your application and get back to you within 3–5 business days.
            </p>
            <Button asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </section>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 pt-24 pb-20">
        {/* Clarity banner — impossible to miss */}
        <section className="border-b border-border bg-primary/5 py-4">
          <div className="container mx-auto px-4">
            <Alert className="max-w-3xl mx-auto border-primary/30 bg-background">
              <UserCheck className="h-5 w-5 text-primary" />
              <AlertDescription className="font-semibold text-foreground">
                This page is for professionals who want to <strong>conduct interviews</strong> — not for job seekers or employers. 
                You will interview candidates (DSA, system design, etc.) as a third-party expert.
              </AlertDescription>
            </Alert>
          </div>
        </section>

        {/* Hero with graphic */}
        <section className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-10">
            <div className="flex-shrink-0">
              <InterviewerConducting size={220} className="mx-auto" />
              <div className="flex justify-center gap-8 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  You conduct the interview
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  Candidate is interviewed
                </span>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <Badge className="mb-4 bg-primary/15 text-primary border-primary/30">
                <Video className="mr-1 h-3 w-3" />
                Expert Interviewer Role
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Apply to <span className="text-primary">conduct</span> expert interviews
              </h1>
              <p className="text-lg text-muted-foreground mb-6">
                Join our panel of interviewers. You conduct live video calls with candidates, evaluate their skills, and help shape verified talent. Flexible schedule, technical & non-technical tracks.
              </p>
              <p className="text-sm text-muted-foreground/80">
                This is not a job application. You are applying to become someone who <strong>interviews</strong> job seekers.
              </p>
            </div>
          </div>
        </section>

        {/* Not for you? */}
        <section className="container mx-auto px-4 mb-16">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-4 justify-center items-center p-4 rounded-xl border border-border bg-muted/30">
            <span className="text-sm font-medium text-muted-foreground">Not for you?</span>
            <div className="flex gap-4">
              <Link
                to="/jobs"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Search className="h-4 w-4" />
                I'm looking for a job
              </Link>
              <Link
                to="/for-employers"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Briefcase className="h-4 w-4" />
                I want to hire
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="container mx-auto px-4 mb-16">
          <h2 className="text-xl font-bold text-center mb-8">What you get as an interviewer</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border-2">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Flexible schedule</h3>
                <p className="text-sm text-muted-foreground">Set your own availability. Conduct interviews when it suits you.</p>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                  <Code className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Technical & non-tech</h3>
                <p className="text-sm text-muted-foreground">DSA, Full Stack, System Design, Product, and more.</p>
              </CardContent>
            </Card>
            <Card className="border-2">
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
          <Card className="max-w-2xl mx-auto border-2">
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
                  <Label htmlFor="experience">Years of experience</Label>
                  <Input
                    id="experience"
                    type="number"
                    min={0}
                    max={50}
                    value={form.experienceYears}
                    onChange={(e) => setForm((p) => ({ ...p, experienceYears: e.target.value }))}
                    placeholder="e.g. 5"
                  />
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
                  <Label htmlFor="phone">Mobile Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 9876543210"
                  />
                  <p className="text-xs text-muted-foreground">Helps admin connect with you easily.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn (optional)</Label>
                  <Input
                    id="linkedin"
                    type="url"
                    value={form.linkedIn}
                    onChange={(e) => setForm((p) => ({ ...p, linkedIn: e.target.value }))}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whyJoin">Why do you want to conduct interviews? (optional)</Label>
                  <Textarea
                    id="whyJoin"
                    value={form.whyJoin}
                    onChange={(e) => setForm((p) => ({ ...p, whyJoin: e.target.value }))}
                    placeholder="A few sentences about your motivation..."
                    rows={4}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
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
