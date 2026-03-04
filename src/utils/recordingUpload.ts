import { api } from "@/lib/api";

export interface UploadRecordingResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const RETAKE_COOLDOWN_HOURS = 24;

export const sendHighRiskAlertNotification = async (
  alertType: string,
  testType: string,
  userId: string,
  message: string,
  violationDetails?: Record<string, unknown>
): Promise<void> => {
  try {
    await api.post("/api/notifications/admin", {
      alertType,
      testType,
      userId,
      message,
      violationDetails,
    });
  } catch (error) {
    console.error("Failed to send admin notification for alert:", error);
  }
};

export const uploadScreenRecording = async (
  _userId: string,
  _testId: string,
  _testType: "aptitude" | "dsa",
  recordingBlob: Blob
): Promise<UploadRecordingResult> => {
  try {
    const form = new FormData();
    form.append("file", recordingBlob, "recording.webm");
    const { url } = await api.post<{ url: string }>("/api/uploads", form);
    return { success: true, url };
  } catch (error: any) {
    console.error("Recording upload error:", error);
    return { success: false, error: error.message };
  }
};

export const getRecordingUrl = async (filePath: string): Promise<string | null> => filePath || null;

export const sendInvalidationEmail = async (
  _userId: string,
  _testType: "aptitude" | "dsa",
  _reason: string
): Promise<{ success: boolean; error?: string }> => {
  return { success: true };
};

export const invalidateTest = async (
  testId: string,
  testType: "aptitude" | "dsa",
  reason: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await api.post("/api/verification/invalidate", { testId, testType, reason });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const checkCooldownStatus = async (
  _userId: string,
  testType: "aptitude" | "dsa"
): Promise<{ inCooldown: boolean; cooldownEndsAt?: Date; hoursRemaining?: number }> => {
  try {
    const { aptitude, dsa } = await api.get<{ aptitude: any; dsa: any }>("/api/verification/cooldowns");
    return testType === "aptitude" ? aptitude : dsa;
  } catch {
    return { inCooldown: false };
  }
};

export const checkInvalidatedTests = async (_userId: string) => {
  try {
    const { aptitude, dsa } = await api.get<{ aptitude: boolean; dsa: boolean }>("/api/verification/invalidated");
    return { aptitude, dsa };
  } catch {
    return { aptitude: false, dsa: false };
  }
};

export interface ProctoringAnalyticsData {
  dailyStats: { date: string; violations: number; invalidations: number; tests: number }[];
  violationTypes: { type: string; count: number }[];
  totalStats: {
    totalTests: number;
    totalViolations: number;
    totalInvalidations: number;
    violationRate: number;
    invalidationRate: number;
  };
}

export const getProctoringAnalytics = async (): Promise<ProctoringAnalyticsData> => {
  try {
    const res = await api.get<{ alerts?: { type?: string; createdAt?: string }[] }>("/api/proctoring/alerts");
    const events = Array.isArray(res?.alerts) ? res.alerts : [];
    const byDate: Record<string, { violations: number; invalidations: number; tests: number }> = {};
    const violationTypes: Record<string, number> = {};
    for (const e of events) {
      const t = e?.type || "unknown";
      violationTypes[t] = (violationTypes[t] || 0) + 1;
      const d = (e?.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = { violations: 0, invalidations: 0, tests: 1 };
      else byDate[d].tests++;
      byDate[d].violations++;
    }
    let dailyStats = Object.entries(byDate).map(([date, v]) => ({ date, ...v }));
    if (dailyStats.length === 0) {
      dailyStats = [{ date: new Date().toISOString().slice(0, 10), violations: 0, invalidations: 0, tests: 0 }];
    }
    const totalViolations = events.length;
    const totalTests = Math.max(1, totalViolations);
    return {
      dailyStats,
      violationTypes: Object.entries(violationTypes).map(([type, count]) => ({ type, count })),
      totalStats: {
        totalTests,
        totalViolations,
        totalInvalidations: 0,
        violationRate: totalViolations / totalTests,
        invalidationRate: 0,
      },
    };
  } catch {
    return {
      dailyStats: [{ date: new Date().toISOString().slice(0, 10), violations: 0, invalidations: 0, tests: 0 }],
      violationTypes: [],
      totalStats: {
        totalTests: 0,
        totalViolations: 0,
        totalInvalidations: 0,
        violationRate: 0,
        invalidationRate: 0,
      },
    };
  }
};
