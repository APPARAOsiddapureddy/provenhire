/**
 * Interviewer roles — maps to technical/non_technical for backward compatibility.
 */

const TECHNICAL_ROLES = [
  "Backend", "Frontend", "Full Stack", "Data", "DevOps",
  "ML Engineer", "Mobile", "QA", "Software Engineer",
];

const NON_TECHNICAL_ROLES = [
  "Operations", "Marketing", "Sales", "Product Manager", "Project Manager",
  "Content", "HR", "Business Analyst", "UX Designer", "Customer Success",
];

const ALL_ROLES = [...TECHNICAL_ROLES, ...NON_TECHNICAL_ROLES];

export function getTrackForRole(role: string): "technical" | "non_technical" {
  if (TECHNICAL_ROLES.includes(role)) return "technical";
  if (NON_TECHNICAL_ROLES.includes(role)) return "non_technical";
  const r = role.toLowerCase();
  const techKeywords = ["backend", "frontend", "full stack", "data", "devops", "ml", "mobile", "qa", "software"];
  return techKeywords.some((k) => r.includes(k)) ? "technical" : "non_technical";
}

export function isValidRole(role: string): boolean {
  return ALL_ROLES.includes(role);
}

/** Check if job seeker targetJobTitle matches interviewer primaryRole */
export function rolesMatch(
  jobSeekerTitle: string | null | undefined,
  interviewerRole: string | null | undefined
): boolean {
  if (!jobSeekerTitle?.trim() || !interviewerRole?.trim()) return false;
  const title = jobSeekerTitle.toLowerCase();
  const role = interviewerRole.toLowerCase();
  if (title.includes(role)) return true;
  if (role.includes("full stack") && (title.includes("fullstack") || title.includes("full stack"))) return true;
  if (role.includes("data") && (title.includes("data analyst") || title.includes("data scientist") || title.includes("data engineer"))) return true;
  if (role.includes("product") && title.includes("product manager")) return true;
  if (role.includes("project") && title.includes("project manager")) return true;
  if (role.includes("software") && title.includes("software")) return true;
  if (role.includes("backend") && (title.includes("backend") || title.includes("back-end"))) return true;
  if (role.includes("frontend") && (title.includes("frontend") || title.includes("front-end") || title.includes("front end"))) return true;
  if (role.includes("full stack") && title.includes("fullstack")) return true;
  if (role.includes("mobile") && title.includes("mobile")) return true;
  if (role.includes("devops") && title.includes("devops")) return true;
  if (role.includes("qa") && (title.includes("qa") || title.includes("quality assurance"))) return true;
  if (role.includes("ml") && (title.includes("ml") || title.includes("machine learning"))) return true;
  if (role.includes("ux") && (title.includes("ux") || title.includes("user experience"))) return true;
  if (role.includes("hr") && (title.includes("hr") || title.includes("human resources"))) return true;
  return false;
}
