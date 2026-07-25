import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GraduationCap, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  collegeApi,
  hasCollegeToken,
  setCollegeSession,
  type CollegeApiError,
  type CollegeSession,
} from "@/lib/collegeApi";

type SignInResponse = {
  college: CollegeSession;
  token: string;
  expiresIn: number;
};

export default function CollegeLoginPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    if (hasCollegeToken()) navigate("/c/workspace", { replace: true });
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      toast.error("Enter your login id and password");
      return;
    }
    setLoading(true);
    setInactive(false);
    try {
      const res = await collegeApi.post<SignInResponse>("/api/college/sign-in", {
        userId: userId.trim(),
        password,
      });
      setCollegeSession(res.token, res.college);
      toast.success("Signed in");
      navigate("/c/workspace", { replace: true });
    } catch (error) {
      const err = error as CollegeApiError;
      if (err.code === "ACCOUNT_INACTIVE") {
        setInactive(true);
      } else {
        toast.error(err.message || "Sign in failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
            <GraduationCap className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <CardTitle className="text-2xl">College Portal</CardTitle>
          <CardDescription>
            Sign in with the credentials shared by your ProvenHire administrator
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inactive && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              This college account is no longer active. Its workspace has been
              archived — contact your ProvenHire administrator.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="college-user-id">Login ID</Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="college-user-id"
                  type="text"
                  autoComplete="username"
                  placeholder="yourcollege0000@provenhire.in"
                  className="pl-9"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="college-password">Password</Label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="college-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pl-9"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
