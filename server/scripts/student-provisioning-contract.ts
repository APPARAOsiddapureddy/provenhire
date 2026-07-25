import assert from "node:assert/strict";

import {
  buildActivationUrl,
  classifyStudentProvisioning,
} from "../src/services/studentProvisioning.service.js";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

console.log("student provisioning - credential safety");

// --- The load-bearing rule: an institution must never be handed a way into a
// student account that already works. ---
check("a verified email/password account is never given an activation link", () => {
  assert.equal(
    classifyStudentProvisioning({ emailVerified: true, authProvider: "EMAIL" }),
    "already_active",
  );
});

check("a Google account is never given an activation link", () => {
  assert.equal(
    classifyStudentProvisioning({ emailVerified: false, authProvider: "GOOGLE" }),
    "already_active",
  );
});

check("a verified Google account is also left alone", () => {
  assert.equal(
    classifyStudentProvisioning({ emailVerified: true, authProvider: "GOOGLE" }),
    "already_active",
  );
});

// --- The legitimate cases. ---
check("a brand new email is created", () => {
  assert.equal(classifyStudentProvisioning(null), "created");
  assert.equal(classifyStudentProvisioning(undefined), "created");
});

check("an abandoned unverified signup gets a fresh link, not a new account", () => {
  assert.equal(
    classifyStudentProvisioning({ emailVerified: false, authProvider: "EMAIL" }),
    "link_reissued",
  );
});

check("a missing authProvider on an unverified account still reissues", () => {
  assert.equal(classifyStudentProvisioning({ emailVerified: false }), "link_reissued");
  assert.equal(
    classifyStudentProvisioning({ emailVerified: false, authProvider: null }),
    "link_reissued",
  );
});

// --- The activation URL is a set-your-own-password link, never a credential. ---
check("activation url points at the password-set flow and carries no password", () => {
  const url = buildActivationUrl("tok123", "student@example.edu", "https://provenhire.in");
  assert.ok(url.startsWith("https://provenhire.in/reset-password?"));
  assert.ok(url.includes("token=tok123"));
  assert.ok(url.includes("student%40example.edu"));
  assert.ok(!/password=/i.test(url));
});

check("a trailing slash on the base url does not double up", () => {
  assert.equal(
    buildActivationUrl("t", "a@b.co", "https://provenhire.in/"),
    "https://provenhire.in/reset-password?token=t&email=a%40b.co",
  );
});

check("email is url-encoded so '+' addressing survives", () => {
  const url = buildActivationUrl("t", "roll+2026@college.edu", "https://provenhire.in");
  assert.ok(url.includes("roll%2B2026%40college.edu"));
  assert.ok(!url.includes("roll+2026@college.edu"));
});

console.log(`\n${passed}/${passed} student provisioning checks passed`);
