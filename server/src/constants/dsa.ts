/**
 * DSA round — shared constants (Judge0, rate limits, timeouts).
 * Do not duplicate magic numbers in routes; import from here.
 */

export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
  typescript: 74,
} as const;

/** Languages accepted by DSA API routes (frontend editor). */
export const DSA_API_LANGUAGES = ["javascript", "python", "java", "cpp", "c"] as const;
export type DsaApiLanguage = (typeof DSA_API_LANGUAGES)[number];

export const DSA_RUN_RATE_LIMIT = {
  PER_MINUTE: 5,
  PER_HOUR: 30,
} as const;

export const JUDGE0_POLL = {
  MAX_ATTEMPTS: 20,
  INTERVAL_MS: 500,
} as const;

export const DSA_DEFAULT_TIMEOUT_MS = parseInt(process.env.DSA_DEFAULT_TIMEOUT_MS ?? "5000", 10);
export const DSA_DEFAULT_MEMORY_LIMIT = 256000; // KB
export const DSA_WALL_TIME_LIMIT = 10; // seconds

export const DSA_QUESTIONS_COUNT = parseInt(process.env.DSA_QUESTIONS_COUNT ?? "3", 10);

/** Minimum aggregate score (0–100) to pass the DSA round — keep aligned with `src/data/dsaRoundConfig.ts`. */
export const DSA_PASS_THRESHOLD = 60;
export const DSA_PRACTICE_COUNT = 2;

export type ExpectedType = "exact" | "numeric" | "array" | "set";

export type TestResultStatus =
  | "passed"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "internal_error";

// Judge0 status IDs (CE)
export const JUDGE0_STATUS = {
  QUEUED: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
} as const;
