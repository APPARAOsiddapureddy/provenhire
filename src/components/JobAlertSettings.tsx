import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Bell, BellOff, Mail, Settings2, Eye, ChevronDown, MapPin, Briefcase, DollarSign, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface JobAlertSettingsProps {
  userSkills: string[];
  userEmail: string;
}

const EmailPreview = ({ frequency, userSkills }: { frequency: string; userSkills: string[] }) => {
  const sampleJob = {
    title: "Senior Frontend Developer",
    company: "TechCorp India",
    location: "Bangalore",
    jobType: "Full-time",
    salary: "₹20L - ₹25L",
    skills: ["React", "TypeScript", "Node.js", "CSS", "GraphQL"],
    matchPercentage: 85
  };

  const matchedSkills = sampleJob.skills.filter(skill => 
    userSkills.some(userSkill => 
      userSkill.toLowerCase().includes(skill.toLowerCase()) || 
      skill.toLowerCase().includes(userSkill.toLowerCase())
    )
  );

  if (frequency === "immediate") {
    return (
      <div className="bg-background border rounded-lg overflow-hidden text-xs">
        {/* Header */}
        <div className="bg-gradient-hero p-3 text-center">
          <h4 className="text-white font-semibold text-sm">New Job Match! 🎯</h4>
        </div>
        {/* Content */}
        <div className="p-3 space-y-2">
          <p className="text-muted-foreground">
            We found a job that matches <strong className="text-foreground">{sampleJob.matchPercentage}%</strong> of your skills!
          </p>
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-foreground">{sampleJob.title}</p>
                <p className="text-muted-foreground text-[11px]">{sampleJob.company}</p>
              </div>
              <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-[10px] font-medium">
                {sampleJob.matchPercentage}%
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px]">
                <MapPin className="h-2.5 w-2.5" />{sampleJob.location}
              </span>
              <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px]">
                <Briefcase className="h-2.5 w-2.5" />{sampleJob.jobType}
              </span>
              <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px]">
                <DollarSign className="h-2.5 w-2.5" />{sampleJob.salary}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {sampleJob.skills.map((skill, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    matchedSkills.includes(skill)
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {matchedSkills.includes(skill) && <CheckCircle2 className="h-2 w-2 inline mr-0.5" />}
                  {skill}
                </span>
              ))}
            </div>
          </div>
          <div className="text-center pt-1">
            <span className="inline-block bg-gradient-hero text-white px-3 py-1 rounded text-[10px] font-medium">
              View Job & Apply
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Daily/Weekly digest preview
  return (
    <div className="bg-background border rounded-lg overflow-hidden text-xs">
      {/* Header */}
      <div className="bg-gradient-hero p-3 text-center">
        <h4 className="text-white font-semibold text-sm">
          Your {frequency === "daily" ? "Daily" : "Weekly"} Job Digest 📬
        </h4>
        <p className="text-white/80 text-[11px] mt-0.5">
          3 jobs matching your skills
        </p>
      </div>
      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-muted-foreground text-[11px]">
          Best opportunities from the past {frequency === "daily" ? "24 hours" : "week"}:
        </p>
        
        {/* Sample Job Cards */}
        {[
          { title: "Senior Frontend Developer", company: "TechCorp", match: 85 },
          { title: "React Engineer", company: "StartupXYZ", match: 72 },
          { title: "Full Stack Developer", company: "BigTech Co", match: 65 },
        ].map((job, i) => (
          <div key={i} className="bg-secondary/50 rounded p-2 flex justify-between items-center">
            <div>
              <p className="font-medium text-foreground text-[11px]">{job.title}</p>
              <p className="text-muted-foreground text-[10px]">{job.company}</p>
            </div>
            <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">
              {job.match}%
            </span>
          </div>
        ))}
        
        <div className="text-center pt-1">
          <span className="inline-block bg-gradient-hero text-white px-3 py-1 rounded text-[10px] font-medium">
            Browse All Jobs
          </span>
        </div>
      </div>
    </div>
  );
};

const JobAlertSettings = ({ userSkills, userEmail }: JobAlertSettingsProps) => {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [minMatchPercentage, setMinMatchPercentage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscription();
    }
  }, [user]);

  const loadSubscription = async () => {
    try {
      const { subscription } = await api.get<{ subscription: any }>("/api/notifications/job-alerts");
      if (subscription) {
        setSubscriptionId(subscription.id);
        setIsActive(subscription.isActive);
        setFrequency(subscription.frequency);
        setMinMatchPercentage(subscription.minMatchPercentage);
      }
    } catch (error) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { subscription } = await api.post<{ subscription: any }>("/api/notifications/job-alerts", {
        email: userEmail,
        skills: userSkills,
        isActive,
        frequency,
        minMatchPercentage,
      });
      setSubscriptionId(subscription?.id ?? null);

      toast.success(isActive ? "Job alerts enabled!" : "Job alerts disabled");
    } catch (error: any) {
      console.error("Error saving subscription:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (userSkills.length === 0) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Bell className="h-4 w-4" />
            Job Alerts
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Job Alerts
            </SheetTitle>
            <SheetDescription className="sr-only">Manage your job alert preferences</SheetDescription>
          </SheetHeader>
          <div className="mt-8 text-center py-12">
            <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Add Your Skills First</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Complete your profile with skills to receive personalized job alerts.
            </p>
            <Button className="mt-4 bg-gradient-hero hover:opacity-90" asChild>
              <a href="/dashboard/jobseeker">Go to Profile</a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          {isActive ? (
            <Bell className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
          Job Alerts
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Job Alert Settings
          </SheetTitle>
          <SheetDescription className="sr-only">Configure notification frequency and match score</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label htmlFor="alerts-active" className="font-medium">
                  Email Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when matching jobs are posted
                </p>
              </div>
            </div>
            <Switch
              id="alerts-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Notification Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="daily">Daily Digest</SelectItem>
                <SelectItem value="weekly">Weekly Digest</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {frequency === "immediate" && "Get notified as soon as a matching job is posted"}
              {frequency === "daily" && "Receive a daily summary of matching jobs every morning"}
              {frequency === "weekly" && "Receive a weekly summary of matching jobs every Sunday"}
            </p>
          </div>

          {/* Match Percentage */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Minimum Match Score</Label>
              <span className="text-sm font-medium text-primary">{minMatchPercentage}%</span>
            </div>
            <Slider
              value={[minMatchPercentage]}
              onValueChange={(values) => setMinMatchPercentage(values[0])}
              min={20}
              max={100}
              step={10}
            />
            <p className="text-xs text-muted-foreground">
              Only notify me when jobs match at least {minMatchPercentage}% of my skills
            </p>
          </div>

          {/* Email Preview */}
          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview Email
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${previewOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Here's what your {frequency === "immediate" ? "job alert" : `${frequency} digest`} emails will look like:
                </p>
                <EmailPreview frequency={frequency} userSkills={userSkills} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Skills Preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Your Skills ({userSkills.length})</Label>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {userSkills.slice(0, 10).map((skill, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-secondary px-2 py-1 rounded"
                >
                  {skill}
                </span>
              ))}
              {userSkills.length > 10 && (
                <span className="text-xs text-muted-foreground">
                  +{userSkills.length - 10} more
                </span>
              )}
            </div>
          </div>

          {/* Email Destination */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Notifications will be sent to</Label>
            <p className="text-sm font-medium">{userEmail}</p>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full bg-gradient-hero hover:opacity-90"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default JobAlertSettings;
