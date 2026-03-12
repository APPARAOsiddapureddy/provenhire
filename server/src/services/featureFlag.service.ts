/**
 * Feature Flag Service — Platform-wide configuration for integrity controls.
 * Admin can toggle OFF / MONITOR / STRICT without redeploy.
 * Cached in memory for fast access.
 */
import { prisma } from "../config/prisma.js";

export const FEATURE_FLAG_MODES = ["OFF", "MONITOR", "STRICT"] as const;
export type FeatureFlagMode = (typeof FEATURE_FLAG_MODES)[number];

/** All supported proctoring feature flags */
export const PROCTORING_FEATURE_FLAGS = [
  "tab_switch_detection",
  "copy_paste_detection",
  "devtools_detection",
  "fullscreen_required",
  "camera_required",
  "multiple_face_detection",
  "screen_recording_enabled",
  "microphone_monitoring",
  "ai_behavior_analysis",
] as const;

export type ProctoringFeatureName = (typeof PROCTORING_FEATURE_FLAGS)[number];

const DEFAULT_DESCRIPTIONS: Record<ProctoringFeatureName, string> = {
  tab_switch_detection: "Detect if candidate switches browser tab during assessment",
  copy_paste_detection: "Block copy-paste and context menu during assessment",
  devtools_detection: "Detect when developer tools are opened during assessment",
  fullscreen_required: "Require fullscreen mode during assessment",
  camera_required: "Require webcam to be on during assessment",
  multiple_face_detection: "Detect multiple faces in camera view",
  screen_recording_enabled: "Enable screen recording during assessment",
  microphone_monitoring: "Monitor microphone for unauthorized audio",
  ai_behavior_analysis: "AI-driven behavior analysis during assessment",
};

/** In-memory cache; invalidate on update */
let cache: Map<string, FeatureFlagMode> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

function isCacheValid(): boolean {
  return cache !== null && Date.now() < cacheExpiry;
}

/** Invalidate cache (call after admin updates flags) */
export function invalidateFeatureFlagCache(): void {
  cache = null;
}

/** Load flags from DB into cache */
async function loadCache(): Promise<Map<string, FeatureFlagMode>> {
  if (isCacheValid() && cache) return cache;
  const rows = await prisma.platformFeatureFlag.findMany();
  const map = new Map<string, FeatureFlagMode>();
  for (const r of rows) {
    const mode = FEATURE_FLAG_MODES.includes(r.mode as FeatureFlagMode)
      ? (r.mode as FeatureFlagMode)
      : "OFF";
    map.set(r.featureName, mode);
  }
  cache = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return map;
}

/**
 * Get the current mode for a feature.
 * Returns OFF if not configured.
 */
export async function getFeatureMode(featureName: string): Promise<FeatureFlagMode> {
  const map = await loadCache();
  const mode = map.get(featureName);
  return mode ?? "OFF";
}

/**
 * Sync helper for use in hot paths (returns cached or default).
 * Prefer getFeatureMode when async is acceptable.
 */
export function getFeatureModeSync(featureName: string): FeatureFlagMode {
  if (cache) {
    const m = cache.get(featureName);
    if (m) return m;
  }
  return "OFF";
}

/**
 * True if feature is enabled (MONITOR or STRICT).
 */
export async function isFeatureEnabled(featureName: string): Promise<boolean> {
  const mode = await getFeatureMode(featureName);
  return mode === "MONITOR" || mode === "STRICT";
}

/**
 * True if feature is in STRICT mode (enforcement applied).
 */
export async function isFeatureStrict(featureName: string): Promise<boolean> {
  const mode = await getFeatureMode(featureName);
  return mode === "STRICT";
}

/**
 * True if feature is in MONITOR mode (log only, no enforcement).
 */
export async function isFeatureMonitor(featureName: string): Promise<boolean> {
  const mode = await getFeatureMode(featureName);
  return mode === "MONITOR";
}

/** Get all flags (for admin panel and public config) */
export async function getAllFeatureFlags(): Promise<
  { featureName: string; mode: FeatureFlagMode; description: string | null; updatedAt: Date }[]
> {
  const rows = await prisma.platformFeatureFlag.findMany({
    orderBy: { featureName: "asc" },
  });
  const map = new Map<string, FeatureFlagMode>();
  for (const r of rows) {
    map.set(r.featureName, (FEATURE_FLAG_MODES.includes(r.mode as FeatureFlagMode) ? r.mode : "OFF") as FeatureFlagMode);
  }
  cache = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return rows.map((r) => ({
    featureName: r.featureName,
    mode: (FEATURE_FLAG_MODES.includes(r.mode as FeatureFlagMode) ? r.mode : "OFF") as FeatureFlagMode,
    description: r.description,
    updatedAt: r.updatedAt,
  }));
}

/** Ensure all proctoring flags exist in DB with defaults */
export async function ensureDefaultFlags(): Promise<void> {
  for (const name of PROCTORING_FEATURE_FLAGS) {
    await prisma.platformFeatureFlag.upsert({
      where: { featureName: name },
      create: {
        featureName: name,
        mode: "OFF",
        description: DEFAULT_DESCRIPTIONS[name],
      },
      update: {},
    });
  }
  invalidateFeatureFlagCache();
}

/** Update a single flag (admin) */
export async function updateFeatureFlag(
  featureName: string,
  mode: FeatureFlagMode,
  updatedBy?: string
): Promise<void> {
  await prisma.platformFeatureFlag.upsert({
    where: { featureName },
    create: {
      featureName,
      mode,
      description: DEFAULT_DESCRIPTIONS[featureName as ProctoringFeatureName] ?? null,
      updatedBy: updatedBy ?? null,
    },
    update: { mode, updatedBy: updatedBy ?? null },
  });
  invalidateFeatureFlagCache();
}
