/**
 * Admin: Platform Settings → Integrity Controls
 * Toggle feature flags (OFF / MONITOR / STRICT) for proctoring systems.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Shield, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/api";

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
  multiple_face_detection: "Face / phone / no-face (camera AI)",
  screen_recording_enabled: "Screen Recording Enabled",
  microphone_monitoring: "Microphone Monitoring (background voice, etc.)",
  ai_behavior_analysis: "AI Behavior Analysis",
  proctoring_strike_termination: "3-strike auto-end (strict proctoring)",
};

type PresetEntry = [string, FeatureFlagMode];

/** Shared exam hall: disable face/audio auto-end false positives when many students sit together */
const PRESET_COMPUTER_LAB: PresetEntry[] = [
  ["multiple_face_detection", "OFF"],
  ["microphone_monitoring", "OFF"],
  ["proctoring_strike_termination", "OFF"],
  ["tab_switch_detection", "MONITOR"],
  ["fullscreen_required", "MONITOR"],
];

/** Solo / remote: strongest integrity + end test after 3 repeated alerts per rule */
const PRESET_REMOTE_HIGH_STAKES: PresetEntry[] = [
  ["multiple_face_detection", "STRICT"],
  ["microphone_monitoring", "STRICT"],
  ["tab_switch_detection", "STRICT"],
  ["fullscreen_required", "STRICT"],
  ["proctoring_strike_termination", "STRICT"],
  ["copy_paste_detection", "STRICT"],
  ["devtools_detection", "STRICT"],
];

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

  const downloadFlagsCsv = async () => {
    const token = getAuthToken();
    try {
      const r = await fetch("/api/admin/export-feature-flags", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("failed");
      const csv = await r.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "provenhire-feature-flags.csv";
      a.click();
      URL.revokeObjectURL(u);
      toast.success("Feature flags export downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  const applyPreset = async (label: string, entries: PresetEntry[]) => {
    setUpdating("__preset__");
    try {
      for (const [featureName, mode] of entries) {
        await api.patch(`/api/admin/feature-flags/${featureName}`, { mode });
      }
      const res = await api.get<{ flags: FeatureFlag[] }>("/api/admin/feature-flags");
      setFlags(res.flags ?? []);
      toast.success(`${label} applied`);
    } catch {
      toast.error("Failed to apply preset");
    } finally {
      setUpdating(null);
    }
  };

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadFlagsCsv}>
              <Download className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <button
              type="button"
              onClick={fetchFlags}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          OFF = disabled · MONITOR = log + learner warnings (no auto-end from strikes) · STRICT = full enforcement.{" "}
          <strong>3-strike auto-end</strong> applies only when &quot;3-strike auto-end&quot; is STRICT — it ends the run
          after three repeated alerts for the same rule class (no face, extra faces, phone, tab leave, fullscreen exit,
          loud / multi-voice audio). Copy-paste does not use strike toasts.
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={updating !== null}
            onClick={() => applyPreset("Computer lab / classroom", PRESET_COMPUTER_LAB)}
          >
            Preset: Computer lab
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={updating !== null}
            onClick={() => applyPreset("Remote high-stakes", PRESET_REMOTE_HIGH_STAKES)}
          >
            Preset: Remote exam (strict)
          </Button>
        </div>
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
