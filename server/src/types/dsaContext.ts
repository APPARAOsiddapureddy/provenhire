/**
 * PRD v2 — DSA context injected into AI Skills Interview orchestration.
 * Persist or pass through services when implementing the full flow.
 */
export interface DSAContext {
  problems: Array<{
    problemId: string;
    title: string;
    description: string;
    difficulty: string;
    candidateCode: string;
    language: string;
    testCasesPassed: number;
    testCasesTotal: number;
    isFullySolved: boolean;
    isPartiallySolved: boolean;
  }>;
}
