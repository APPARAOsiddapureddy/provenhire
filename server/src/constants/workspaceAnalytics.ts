// A round counts as "needs retake" when its percentageScore falls below this
// cutoff. Deliberately separate from DSA_PASS_THRESHOLD (dsa.ts) - that one
// gates standalone DSA practice mode, a different product context.
export const WORKSPACE_ROUND_RETAKE_THRESHOLD_PERCENT = 50;

// Mirrors the weakest readiness band produced by Tier-4's
// scoreToReadinessBand() (Tier -4/server/src/domain/catalog.ts) and the
// readinessBands union (Tier -4/shared/contracts.ts). No shared package
// exists between the two repos - if that band ever gets renamed there,
// this constant silently stops matching.
export const WORKSPACE_INTERVIEW_RETAKE_BAND = "foundation_gap";

// Percentile cutoffs used to bucket per-module scores into top/mid/bottom
// bands for the dashboard's distribution charts.
export const SCORE_BAND_TOP_PERCENTILE = 0.75;
export const SCORE_BAND_BOTTOM_PERCENTILE = 0.25;

// How long a computed analytics payload is served from the in-process cache
// before being recomputed on the next request.
export const WORKSPACE_ANALYTICS_CACHE_TTL_MS = 30_000;
