/**
 * Admin: Platform Settings → Integrity Controls
 * Toggle feature flags (OFF / MONITOR / STRICT) for proctoring systems.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type FeatureFlagMode = "OFF" | "MONITOR" | "STRICT";

interface FeatureFlag {
  featureName: string;
  mode: FeatureFlagMode;
  description: string | null;
  updatedAt: string;
}

const FEATURE_LABELS: Record<string, string> = {
  tab_switch_detection: "Tab Switching Detection",
  copy_paste_detection: "Copy Paste Detection",
  fullscreen_required: "Fullscreen Required",
  camera_required: "Camera Required",
  multiple_face_detection: "Multiple Face Detection",
  screen_recording_enabled: "Screen Recording Enabled",
  microphone_monitoring: "Microphone Monitoring",
  ai_behavior_analysis: "AI Behavior Analysis",
};

const MODE_DESCRIPTIONS: Record<FeatureFlagMode, string> = {
  OFF: "Disabled — no detection or enforcement",
  MONITOR: "Monitor only — log events, no blocking",
  STRICT: "Strict — violations trigger warnings/failure",
};

const IntegrityControls = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchFlags = async () => {
    try {
      const res = await api.get<{ flags: FeatureFlag[] }>("/api/admin/feature-flags");
      setFlags(res.flags ?? []);
    } catch {
      toast.error("Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleModeChange = async (featureName: string, mode: FeatureFlagMode) => {
    setUpdating(featureName);
    try {
      await api.patch(`/api/admin/feature-flags/${featureName}`, { mode });
      setFlags((prev) =>
        prev.map((f) => (f.featureName === featureName ? { ...f, mode } : f))
      );
      toast.success(`${FEATURE_LABELS[featureName] ?? featureName} set to ${mode}`);
    } catch {
      toast.error("Failed to update flag");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Integrity Controls
            </CardTitle>
            <CardDescription>
              Configure proctoring and integrity monitoring. Changes apply globally without redeploy.
            </CardDescription>
          </div>
          <button
            onClick={fetchFlags}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-6">
          OFF = disabled · MONITOR = log only · STRICT = enforce (block/fail)
        </p>
        <div className="space-y-4">
          {flags.map((flag) => (
            <div
              key={flag.featureName}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-muted/30"
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {FEATURE_LABELS[flag.featureName] ?? flag.featureName}
                </div>
                {flag.description && (
                  <div className="text-sm text-muted-foreground mt-0.5">{flag.description}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {updating === flag.featureName ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Select
                    value={flag.mode}
                    onValueChange={(v) => handleModeChange(flag.featureName, v as FeatureFlagMode)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OFF">OFF</SelectItem>
                      <SelectItem value="MONITOR">MONITOR</SelectItem>
                      <SelectItem value="STRICT">STRICT</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>
        {flags.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No feature flags configured.</p>
        )}
        <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm">
            <strong>UX:</strong> Even when proctoring is OFF, the platform displays: &quot;ProvenHire
            uses integrity monitoring to ensure fair assessments.&quot; This maintains recruiter trust.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default IntegrityControls;
