/**
 * Expert Interviewer Dashboard — focused panel with slots, upcoming, past, stats.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Video,
  LogOut,
  Award,
  User,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  FileCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { toast } from "sonner";

export default function ExpertDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [past, setPast] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalConducted: 0, passed: 0, passRate: 0 });
  const [loading, setLoading] = useState(true);
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");
  const [addSlotLoading, setAddSlotLoading] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTimes, setBulkTimes] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profileRes, upcomingRes, pastRes, statsRes] = await Promise.allSettled([
        api.get("/api/expert/profile"),
        api.get("/api/expert/sessions/upcoming"),
        api.get("/api/expert/sessions/past"),
        api.get("/api/expert/stats"),
      ]);
      if (profileRes.status === "fulfilled" && profileRes.value?.interviewer) {
        setProfile(profileRes.value.interviewer);
        setSlots(profileRes.value.interviewer.slots ?? []);
      }
      if (upcomingRes.status === "fulfilled") setUpcoming(upcomingRes.value?.sessions ?? []);
      if (pastRes.status === "fulfilled") setPast(pastRes.value?.sessions ?? []);
      if (statsRes.status === "fulfilled") setStats(statsRes.value ?? { totalConducted: 0, passed: 0, passRate: 0 });
    } catch (e) {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotDate || !slotTime) {
      toast.error("Enter date and time");
      return;
    }
    setAddSlotLoading(true);
    try {
      const [y, m, d] = slotDate.split("-").map(Number);
      const [hr, min] = slotTime.split(":").map(Number);
      const startsAt = new Date(y, m - 1, d, hr, min);
      const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      await api.post("/api/expert/slots", {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      toast.success("Slot added");
      setAddSlotOpen(false);
      setSlotDate("");
      setSlotTime("");
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add slot");
    } finally {
      setAddSlotLoading(false);
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkDate || !bulkTimes.trim()) {
      toast.error("Enter date and times (e.g. 10:00, 11:00, 14:00)");
      return;
    }
    const times = bulkTimes.split(/[\n,\s]+/).filter(Boolean);
    if (times.length === 0) {
      toast.error("Enter at least one time");
      return;
    }
    setBulkLoading(true);
    try {
      const [y, m, d] = bulkDate.split("-").map(Number);
      for (const t of times) {
        const [hr, min] = t.includes(":") ? t.split(":").map(Number) : [parseInt(t, 10), 0];
        const startsAt = new Date(y, m - 1, d, hr, min);
        if (startsAt < new Date()) continue;
        const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
        await api.post("/api/expert/slots", {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      }
      toast.success(`${times.length} slot(s) added`);
      setBulkAddOpen(false);
      setBulkDate("");
      setBulkTimes("");
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add slots");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    try {
      await api.delete(`/api/expert/slots/${id}`);
      toast.success("Slot removed");
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete slot");
    }
  };

  const formatSlot = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <Navbar />
      <main className="flex-1 container max-w-6xl mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Expert Interviewer
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage availability and conduct interviews
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              {profile?.track ?? "technical"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-2 shadow-md bg-card/80 backdrop-blur">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalConducted}</p>
                <p className="text-sm text-muted-foreground">Interviews conducted</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 shadow-md bg-card/80 backdrop-blur">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/15 flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.passed}</p>
                <p className="text-sm text-muted-foreground">Candidates passed</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 shadow-md bg-card/80 backdrop-blur">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.passRate}%</p>
                <p className="text-sm text-muted-foreground">Pass rate</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My availability */}
        <Card className="mb-8 border-2 shadow-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              My Availability
            </CardTitle>
            <CardDescription>
              Add slots when you're free. Job seekers book from these.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-3 mb-6">
              <Dialog open={addSlotOpen} onOpenChange={setAddSlotOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 shadow-md">
                    <Plus className="h-4 w-4 mr-2" />
                    Add slot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add availability slot</DialogTitle>
                    <DialogDescription>45 min slots. Pick date and start time.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddSlot} className="space-y-4">
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div>
                      <Label>Start time</Label>
                      <Input
                        type="time"
                        value={slotTime}
                        onChange={(e) => setSlotTime(e.target.value)}
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddSlotOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={addSlotLoading}>{addSlotLoading ? "Adding..." : "Add"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={bulkAddOpen} onOpenChange={setBulkAddOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Bulk add slots
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add multiple slots</DialogTitle>
                    <DialogDescription>One date, multiple times (comma or newline separated). e.g. 10:00, 11:00, 14:00</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleBulkAdd} className="space-y-4">
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={bulkDate}
                        onChange={(e) => setBulkDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div>
                      <Label>Times</Label>
                      <Textarea
                        value={bulkTimes}
                        onChange={(e) => setBulkTimes(e.target.value)}
                        placeholder="10:00, 11:00, 14:00"
                        rows={3}
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setBulkAddOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={bulkLoading}>{bulkLoading ? "Adding..." : "Add all"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {slots.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground font-medium">No availability set</p>
                <p className="text-sm text-muted-foreground mt-1">Add slots to receive bookings from job seekers</p>
                <Button className="mt-4" onClick={() => setAddSlotOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first slot
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {slots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                  >
                    <span className="font-medium">{formatSlot(s.startsAt)}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSlot(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Upcoming */}
          <Card className="border-2 shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-green-500/10 to-transparent border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Video className="h-5 w-5 text-green-600 dark:text-green-400" />
                Upcoming Interviews
              </CardTitle>
              <CardDescription>Scheduled sessions. Join to conduct and evaluate.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {upcoming.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                  <Video className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground text-sm">No upcoming interviews</p>
                  <p className="text-xs text-muted-foreground mt-1">Add slots and job seekers will book</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcoming.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl border-2 border-border bg-card hover:border-primary/30 transition-colors"
                    >
                      <div className="font-semibold">
                        {s.user?.jobSeekerProfile?.fullName || s.user?.name || "Candidate"}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {s.scheduledAt ? formatSlot(s.scheduledAt) : "—"}
                      </div>
                      <Button
                        className="mt-3 w-full"
                        onClick={() => navigate(`/interview/room/${s.id}`)}
                      >
                        <Video className="h-4 w-4 mr-2" />
                        Join interview
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past */}
          <Card className="border-2 shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-amber-500/10 to-transparent border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                Past Interviews
              </CardTitle>
              <CardDescription>Completed sessions</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {past.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                  <Award className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground text-sm">No past interviews yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {past.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50"
                    >
                      <span className="font-medium text-sm">
                        {s.user?.jobSeekerProfile?.fullName || s.user?.name || "Candidate"}
                      </span>
                      <Badge variant={s.evaluationPass ? "default" : "destructive"}>
                        {s.evaluationPass ? "Pass" : "Fail"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Profile */}
        <Card className="mt-8 border-2 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="text-sm text-muted-foreground">{user?.email ?? "—"}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Track:</span> {profile?.track ?? "technical"}
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Domains:</span> {(profile?.domains as string[])?.join(", ") || "—"}
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
