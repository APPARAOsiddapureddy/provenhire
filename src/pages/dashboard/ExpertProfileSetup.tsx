/**
 * PRD §4.4 — mandatory expert profile before dashboard (server-enforced).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function splitList(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ExpertProfileSetup() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    profileImage: "",
    bio: "",
    currentCompany: "",
    jobTitle: "",
    linkedInUrl: "",
    expertiseAreas: "",
    preferredInterviewTopics: "",
    languagesSpoken: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.bio.trim().length < 80) {
      toast.error("Bio must be at least 80 characters.");
      return;
    }
    const expertiseAreas = splitList(form.expertiseAreas);
    const preferredInterviewTopics = splitList(form.preferredInterviewTopics);
    const languagesSpoken = splitList(form.languagesSpoken);
    if (!expertiseAreas.length || !preferredInterviewTopics.length || !languagesSpoken.length) {
      toast.error("Add at least one item for expertise, interview topics, and languages.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/expert/profile", {
        profileImage: form.profileImage.trim() || null,
        bio: form.bio.trim(),
        currentCompany: form.currentCompany.trim(),
        jobTitle: form.jobTitle.trim(),
        linkedInUrl: form.linkedInUrl.trim(),
        expertiseAreas,
        preferredInterviewTopics,
        languagesSpoken,
      });
      toast.success("Profile complete. Welcome to your dashboard.");
      navigate("/dashboard/expert", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container max-w-2xl mx-auto px-4 pt-24 pb-16">
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Complete your expert interviewer profile</CardTitle>
            <CardDescription>
              Candidates see this when they book with you. All fields are required except photo URL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="profileImage">Profile photo URL (optional)</Label>
                <Input
                  id="profileImage"
                  type="url"
                  placeholder="https://…"
                  value={form.profileImage}
                  onChange={(e) => setForm((p) => ({ ...p, profileImage: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Short bio * (min 80 characters)</Label>
                <Textarea
                  id="bio"
                  rows={5}
                  required
                  value={form.bio}
                  onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                  placeholder="Your background, seniority, and what you focus on in interviews."
                />
                <p className="text-xs text-muted-foreground">{form.bio.trim().length} / 80+</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Current company *</Label>
                  <Input
                    id="company"
                    required
                    value={form.currentCompany}
                    onChange={(e) => setForm((p) => ({ ...p, currentCompany: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Current job title *</Label>
                  <Input
                    id="title"
                    required
                    value={form.jobTitle}
                    onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="li">LinkedIn URL *</Label>
                <Input
                  id="li"
                  type="url"
                  required
                  value={form.linkedInUrl}
                  onChange={(e) => setForm((p) => ({ ...p, linkedInUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expertise">Expertise areas * (comma-separated)</Label>
                <Input
                  id="expertise"
                  placeholder="Backend, System Design, DSA"
                  value={form.expertiseAreas}
                  onChange={(e) => setForm((p) => ({ ...p, expertiseAreas: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topics">Preferred interview topics * (comma-separated)</Label>
                <Input
                  id="topics"
                  placeholder="DSA, System Design, Behavioural"
                  value={form.preferredInterviewTopics}
                  onChange={(e) => setForm((p) => ({ ...p, preferredInterviewTopics: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="langs">Languages spoken * (comma-separated)</Label>
                <Input
                  id="langs"
                  placeholder="English, Hindi"
                  value={form.languagesSpoken}
                  onChange={(e) => setForm((p) => ({ ...p, languagesSpoken: e.target.value }))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  "Save and continue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
