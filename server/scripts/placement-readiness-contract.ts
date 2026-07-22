import assert from "node:assert/strict";

import {
  canReadPlacementArtifact,
  signPlacementCallback,
  verifyPlacementCallback,
} from "../src/services/placementReadinessContracts.js";
import {
  resolveExistingPlacementLaunch,
  resolvePlacementWebUrl,
} from "../src/routes/placementReadiness.js";

const secret = "test-placement-webhook-secret";
const timestamp = "1784275200";
const nowMs = Number(timestamp) * 1000;
const body = JSON.stringify({ event_id: "evt-1", event_type: "placement.report.ready" });
const signature = signPlacementCallback(body, timestamp, secret);

assert.deepEqual(verifyPlacementCallback({ body, timestamp, signature, secret, nowMs }), { ok: true });
assert.equal(verifyPlacementCallback({ body: `${body} `, timestamp, signature, secret, nowMs }).ok, false);
assert.deepEqual(
  verifyPlacementCallback({ body, timestamp, signature, secret, nowMs: nowMs + 301_000 }),
  { ok: false, reason: "stale_timestamp" },
);

assert.equal(canReadPlacementArtifact({ requesterId: "candidate", requesterRole: "jobseeker", candidateId: "candidate", workspaceOwnerUserId: "owner" }), true);
assert.equal(canReadPlacementArtifact({ requesterId: "admin", requesterRole: "admin", candidateId: "candidate", workspaceOwnerUserId: "owner" }), true);
assert.equal(canReadPlacementArtifact({ requesterId: "owner", requesterRole: "recruiter", candidateId: "candidate", workspaceOwnerUserId: "owner" }), true);
assert.equal(canReadPlacementArtifact({ requesterId: "other", requesterRole: "recruiter", candidateId: "candidate", workspaceOwnerUserId: "owner" }), false);
assert.equal(canReadPlacementArtifact({ requesterId: "other", requesterRole: "jobseeker", candidateId: "candidate", workspaceOwnerUserId: "owner" }), false);

assert.equal(
  resolvePlacementWebUrl({
    NODE_ENV: "production",
    PLACEMENT_READINESS_WEB_URL: "https://placement.provenhire.in",
  }),
  "https://provenhireplacement.vercel.app",
);
assert.equal(
  resolvePlacementWebUrl({
    NODE_ENV: "production",
    PLACEMENT_READINESS_WEB_URL: "https://placement.provenhire.in",
    PLACEMENT_READINESS_CUSTOM_DOMAIN_READY: "true",
  }),
  "https://placement.provenhire.in",
);

assert.deepEqual(
  resolveExistingPlacementLaunch({
    handoffId: "handoff-1",
    status: "started",
    placementSessionId: "session/1",
    expiresAt: new Date("2026-07-22T00:00:00.000Z"),
    webUrl: "https://placement.example.com",
  }),
  {
    handoff_id: "handoff-1",
    launch_url: "https://placement.example.com/interview-room/session%2F1",
    expires_at: "2026-07-22T00:00:00.000Z",
    resumed: true,
    status: "started",
  },
);
assert.equal(
  resolveExistingPlacementLaunch({
    handoffId: "handoff-2",
    status: "created",
    placementSessionId: null,
    expiresAt: new Date("2026-07-22T00:00:00.000Z"),
    webUrl: "https://placement.example.com",
  }),
  null,
);

console.log("placement readiness contract: 12/12 passed");
