/**
 * Preload route chunks so navigation feels instant.
 * Call these on hover or when a route is likely to be visited next.
 */

export const preloadVerificationFlow = () =>
  import("./pages/verification/VerificationFlow");

export const preloadPostJob = () => import("./pages/dashboard/PostJob");
export const preloadCandidateSearch = () =>
  import("./pages/dashboard/CandidateSearch");
