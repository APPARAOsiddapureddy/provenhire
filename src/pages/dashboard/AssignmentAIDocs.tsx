import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ArrowLeft, LogOut, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const AssignmentAIDocs = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [docContent, setDocContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const loadDocs = async () => {
      try {
        const response = await fetch("/docs/assignmentai.md", { cache: "no-cache" });
        if (!response.ok) {
          throw new Error("Failed to load documentation.");
        }
        const text = await response.text();
        setDocContent(text);
      } catch (error: any) {
        setLoadError(error?.message || "Unable to load documentation.");
      } finally {
        setLoading(false);
      }
    };

    loadDocs();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="bg-background/95 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center shadow-glow">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-hero bg-clip-text text-transparent">
                AssignmentAI Docs
              </h1>
              <p className="text-xs text-muted-foreground">
                Recruiter documentation and workflow ideology
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/recruiter")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <Separator orientation="vertical" className="h-8" />
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium">{user?.email || "Recruiter"}</p>
              <p className="text-xs text-muted-foreground">Recruiter Access</p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              AssignmentAI - Complete Project Documentation
            </CardTitle>
            <CardDescription>
              Reference guide for the AssignmentAI recruiter workflow and system design.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                Loading documentation...
              </div>
            )}
            {!loading && loadError && (
              <div className="text-sm text-destructive">{loadError}</div>
            )}
            {!loading && !loadError && (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {docContent}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AssignmentAIDocs;
