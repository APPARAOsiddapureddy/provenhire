import assert from "node:assert/strict";

import {
  canReadPlacementArtifact,
  signPlacementCallback,
  verifyPlacementCallback,
} from "../src/services/placementReadinessContracts.js";

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

console.log("placement readiness contract: 8/8 passed");
