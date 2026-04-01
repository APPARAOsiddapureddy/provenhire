export type JobSeekerProfileLike = {
  fullName?: string | null;
  full_name?: string | null;
} | null | undefined;

export type UserEmailLike = { email?: string | null } | null | undefined;

/**
 * Sidebar/header identity for job seekers — matches JobSeekerDashboard:
 * "Welcome" + "W" until profile has a non-empty full name; then full name + word/email-based initials.
 */
export function jobSeekerShellUser(
  profile: JobSeekerProfileLike,
  user: UserEmailLike
): { name: string; initials: string } {
  const hasCompletedProfileSetup = Boolean((profile?.fullName ?? profile?.full_name)?.trim());
  const userName = (profile?.fullName ?? profile?.full_name) || user?.email?.split("@")[0] || "Candidate";
  const basis = hasCompletedProfileSetup
    ? (profile?.fullName ?? profile?.full_name) || user?.email || "U"
    : "W";
  const initials = basis
    .split(/\s|@/)
    .filter(Boolean)
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    name: hasCompletedProfileSetup ? userName : "Welcome",
    initials,
  };
}

/** Initials for avatars / inline badges from a display name or email fallback (same algorithm as shell). */
export function jobSeekerInitialsFromFullName(fullName: string, emailFallback: string | undefined): string {
  const trimmed = fullName.trim();
  const basis = trimmed || emailFallback || "U";
  return basis
    .split(/\s|@/)
    .filter(Boolean)
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
