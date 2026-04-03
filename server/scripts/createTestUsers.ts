/**
 * Create flow-audit test accounts via HTTP only (no UI).
 * Run from server root: npx tsx scripts/createTestUsers.ts
 */
import { config } from "dotenv";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(fileURLToPath(new URL(".", import.meta.url)), "../.env") });

const BASE = process.env.AUDIT_API_BASE ?? "http://127.0.0.1:10000";

type Track = "technical" | "non_technical";

const users: Array<{
  name: string;
  email: string;
  password: string;
  roleType: Track;
  experienceYears: number;
  targetJobTitle: string;
  label: string;
}> = [
  {
    name: "Tech Fresher Tester",
    email: "tech-fresher@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "technical",
    experienceYears: 0,
    targetJobTitle: "Backend Engineer",
    label: "TECH_FRESHER",
  },
  {
    name: "Tech Mid Tester",
    email: "tech-mid@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "technical",
    experienceYears: 2,
    targetJobTitle: "Backend Engineer",
    label: "TECH_MID",
  },
  {
    name: "Tech Senior Tester",
    email: "tech-senior@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "technical",
    experienceYears: 5,
    targetJobTitle: "Backend Engineer",
    label: "TECH_SENIOR",
  },
  {
    name: "NonTech Fresher Tester",
    email: "nontech-fresher@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "non_technical",
    experienceYears: 0,
    targetJobTitle: "Marketing",
    label: "NONTECH_FRESHER",
  },
  {
    name: "NonTech Mid Tester",
    email: "nontech-mid@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "non_technical",
    experienceYears: 2,
    targetJobTitle: "Marketing",
    label: "NONTECH_MID",
  },
  {
    name: "NonTech Senior Tester",
    email: "nontech-senior@test.provenhire.com",
    password: "TestFlow@2026",
    roleType: "non_technical",
    experienceYears: 5,
    targetJobTitle: "Marketing",
    label: "NONTECH_SENIOR",
  },
];

const results: Array<{
  label: string;
  email: string;
  userId?: string;
  token?: string;
  status: string;
  roleType?: Track;
  experienceYears?: number;
  error?: unknown;
}> = [];

async function jsonFetch(path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function createUser(u: (typeof users)[0]) {
  try {
    let reg = await jsonFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: u.name,
        email: u.email,
        password: u.password,
        roleType: u.roleType,
      }),
    });

    if (reg.status === 409) {
      const login = await jsonFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: u.email, password: u.password }),
      });
      if (login.status !== 200 || !login.data?.token) {
        results.push({
          label: u.label,
          email: u.email,
          status: "FAILED",
          error: login.data ?? "login after 409 failed",
        });
        console.log(`❌ ${u.label} — exists but login failed`);
        return;
      }
      const token = login.data.token as string;
      const userId = login.data.user?.id as string;
      results.push({
        label: u.label,
        email: u.email,
        userId,
        token,
        status: "EXISTING_LOGGED_IN",
        roleType: u.roleType,
        experienceYears: u.experienceYears,
      });
      console.log(`↪ ${u.label} — already registered, captured token`);
      await saveProfile(token, u);
      return;
    }

    if (reg.status !== 200 || !reg.data?.token) {
      results.push({ label: u.label, email: u.email, status: "FAILED", error: reg.data });
      console.log(`❌ ${u.label} — register`, JSON.stringify(reg.data));
      return;
    }

    const token = reg.data.token as string;
    const userId = reg.data.user?.id as string;
    await saveProfile(token, u);
    results.push({
      label: u.label,
      email: u.email,
      userId,
      token,
      status: "CREATED",
      roleType: u.roleType,
      experienceYears: u.experienceYears,
    });
    console.log(`✅ ${u.label}`);
  } catch (e) {
    results.push({ label: u.label, email: u.email, status: "FAILED", error: String(e) });
    console.log(`❌ ${u.label} — ${e}`);
  }
}

async function saveProfile(
  token: string,
  u: {
    name: string;
    roleType: Track;
    experienceYears: number;
    targetJobTitle: string;
  },
) {
  const employed = u.experienceYears > 0;
  const prof = await jsonFetch("/api/users/job-seeker-profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fullName: u.name,
      phone: "9876543210",
      location: "Bangalore, India",
      employmentStatus: employed ? "employed" : "student",
      currentRole: employed ? "Engineer" : "Student",
      experienceYears: u.experienceYears,
      bio: "Test account for flow verification",
      skills: ["JavaScript", "Python"],
      college: "Test University",
      graduationYear: "2022",
      education: "B.Tech @ Test University (2022)",
      workExperience: employed ? "Engineer at TestCo" : "",
      targetJobTitle: u.targetJobTitle,
      noticePeriod: employed ? "30 days" : undefined,
      currentSalary: employed ? "10 LPA" : null,
      expectedSalary: "15 LPA",
      roleType: u.roleType,
    }),
  });
  if (prof.status !== 200) {
    console.warn(`  ⚠ profile save ${u.name}:`, prof.status, JSON.stringify(prof.data));
  }
}

async function main() {
  console.log(`BASE=${BASE}\n`);
  for (const u of users) {
    await createUser(u);
  }
  const out = resolve(fileURLToPath(new URL(".", import.meta.url)), "../test-users.json");
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch(console.error);
