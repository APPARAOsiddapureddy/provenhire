/**
 * Interviewer roles — replaces technical/non_technical.
 * Technical roles map to roleType "technical", non-technical to "non_technical".
 * Used for matching interviewers with job seekers by targetJobTitle.
 */
export const INTERVIEWER_ROLES = [
  { value: "Backend", label: "Backend", track: "technical" as const },
  { value: "Frontend", label: "Frontend", track: "technical" as const },
  { value: "Full Stack", label: "Full Stack", track: "technical" as const },
  { value: "Data", label: "Data", track: "technical" as const },
  { value: "DevOps", label: "DevOps", track: "technical" as const },
  { value: "ML Engineer", label: "ML Engineer", track: "technical" as const },
  { value: "Mobile", label: "Mobile", track: "technical" as const },
  { value: "QA", label: "QA", track: "technical" as const },
  { value: "Software Engineer", label: "Software Engineer", track: "technical" as const },
  { value: "Operations", label: "Operations", track: "non_technical" as const },
  { value: "Marketing", label: "Marketing", track: "non_technical" as const },
  { value: "Sales", label: "Sales", track: "non_technical" as const },
  { value: "Product Manager", label: "Product Manager", track: "non_technical" as const },
  { value: "Project Manager", label: "Project Manager", track: "non_technical" as const },
  { value: "Content", label: "Content", track: "non_technical" as const },
  { value: "HR", label: "HR", track: "non_technical" as const },
  { value: "Business Analyst", label: "Business Analyst", track: "non_technical" as const },
  { value: "UX Designer", label: "UX Designer", track: "non_technical" as const },
  { value: "Customer Success", label: "Customer Success", track: "non_technical" as const },
] as const;

export type InterviewerRoleValue = (typeof INTERVIEWER_ROLES)[number]["value"];

export function getTrackForRole(role: string): "technical" | "non_technical" {
  const r = INTERVIEWER_ROLES.find((x) => x.value === role);
  return r?.track ?? (isTechnicalRole(role) ? "technical" : "non_technical");
}

function isTechnicalRole(role: string): boolean {
  const technicalKeywords = ["backend", "frontend", "full stack", "data", "devops", "ml", "mobile", "qa", "software"];
  const r = role.toLowerCase();
  return technicalKeywords.some((k) => r.includes(k));
}

/** Check if job seeker targetJobTitle matches interviewer primaryRole */
export function rolesMatch(jobSeekerTitle: string | null | undefined, interviewerRole: string | null | undefined): boolean {
  if (!jobSeekerTitle?.trim() || !interviewerRole?.trim()) return false;
  const title = jobSeekerTitle.toLowerCase();
  const role = interviewerRole.toLowerCase();
  if (title.includes(role)) return true;
  if (role.includes("full stack") && (title.includes("fullstack") || title.includes("full stack"))) return true;
  if (role.includes("data") && (title.includes("data analyst") || title.includes("data scientist"))) return true;
  if (role.includes("product") && title.includes("product manager")) return true;
  if (role.includes("project") && title.includes("project manager")) return true;
  if (role.includes("software") && title.includes("software")) return true;
  return false;
}
