/**
 * PRD v4.1: Expert Interviewer Dashboard
 * Separate role — own login, own dashboard. Conducts Stage 5 Human Expert Interviews only.
 * Recruiters have zero involvement in Stage 5.
 */
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Video, LogOut, Award, Clock, User } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ExpertDashboard = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bebas font-bold text-foreground tracking-wide">
              Expert Interviewer Dashboard
            </h1>
            <p className="text-muted-foreground font-medium mt-1">
              Stage 5 — Human Expert Interview (Tech Track)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              Neutral third party · No recruiter affiliation
            </Badge>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-mono text-sm text-primary uppercase tracking-wider">
                <Calendar className="h-4 w-4" />
                Upcoming interviews
              </CardTitle>
              <CardDescription>
                Your scheduled Stage 5 sessions. Candidate profile (resume, scores, AI transcript) visible 24 hours before.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No upcoming interviews. Set your slot availability to receive bookings.
              </p>
              <Button variant="outline" className="mt-4" disabled>
                Manage slots (coming soon)
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-mono text-sm text-primary uppercase tracking-wider">
                <Video className="h-4 w-4" />
                Past interviews
              </CardTitle>
              <CardDescription>
                Completed sessions. Evaluation form submitted in dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No past interviews yet.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-primary uppercase tracking-wider">
              <Award className="h-4 w-4" />
              PRD v4.1 — Expert Interviewer
            </CardTitle>
            <CardDescription>
              You conduct 30–45 min live video interviews. You review: resume, aptitude score, DSA score, AI transcript before the session.
              Scoring: Technical Depth (30%), Problem Solving (20%), Authenticity (15%), Real-World Exposure (15%), System Thinking (10%), Communication (10%). Pass threshold ≥70%. Borderline 60–69%: second reviewer auto-assigned.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{user?.email ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Compensation: Rs.300–500 per completed interview (monthly)</span>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default ExpertDashboard;
