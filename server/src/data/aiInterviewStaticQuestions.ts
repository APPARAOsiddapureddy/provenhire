export type QuestionPlanItem = {
  type: string;
  prompt: string;
  keyPoints: string[];
  questionBankId?: string | null;
  difficulty?: number;
  /** Deepening probes aligned to this prompt (bank-driven follow-up). */
  followups?: string[];
};
/** HR/behavioral questions (same for all roles). Last 4 of 11. */
export const HR_QUESTIONS: QuestionPlanItem[] = [
  {
    type: "behavioral",
    prompt: "Tell me about a time you had to meet a tight deadline. How did you prioritize and deliver?",
    keyPoints: ["specific situation with deadline", "prioritization approach", "delivery outcome", "learning or improvement"],
  },
  {
    type: "behavioral",
    prompt: "Describe a situation where you had to handle conflicting feedback from stakeholders. How did you resolve it?",
    keyPoints: ["conflict between stakeholders", "listening and understanding both sides", "resolution approach", "outcome"],
  },
  {
    type: "behavioral",
    prompt: "Why are you interested in this role, and what do you hope to achieve in the next 1–2 years?",
    keyPoints: ["genuine interest in role/company", "aligned career goals", "concrete 1–2 year objectives"],
  },
  {
    type: "behavioral",
    prompt: "Describe a time when you had to learn something new quickly. How did you approach it and what was the outcome?",
    keyPoints: ["specific learning challenge", "approach or strategy", "resourcefulness", "outcome and application"],
    followups: [
      "What would you do differently if you had to learn it again?",
      "How did you verify you had learned enough to be effective?",
    ],
  },
];

/** Role-specific technical questions (first 7 of 10). Key points define ideal answer criteria for scoring. */
export const ROLE_PLANS: Record<string, QuestionPlanItem[]> = {
  frontend: [
    { type: "conceptual", prompt: "Explain the component and state management principles you rely on in React or similar frameworks.", keyPoints: ["components as reusable units", "state management (local/global)", "data flow (props, context)", "separation of concerns"] },
    { type: "conceptual", prompt: "Describe how the browser rendering pipeline impacts UI performance and what optimizations you use.", keyPoints: ["DOM/CSSOM construction", "layout and paint", "virtual DOM or similar", "lazy load, code split, memoization"] },
    { type: "scenario", prompt: "A key UI flow is slow on low-end devices. How would you diagnose and fix it?", keyPoints: ["profiling (Chrome DevTools)", "identifying bottlenecks", "optimization strategy", "testing on target devices"] },
    { type: "scenario", prompt: "How would you implement feature flags for a UI release with staged rollout?", keyPoints: ["feature flag concept", "config/service for flags", "gradual rollout strategy", "rollback capability"] },
    { type: "problem_solving", prompt: "Design a robust form system with validation, autosave, and error recovery.", keyPoints: ["validation approach", "autosave without data loss", "error handling and recovery", "UX considerations"] },
    { type: "problem_solving", prompt: "How would you refactor a monolithic React app into maintainable modules?", keyPoints: ["identifying boundaries", "module structure", "shared dependencies", "incremental approach"] },
    { type: "scenario", prompt: "How do you ensure accessibility (a11y) in your frontend applications?", keyPoints: ["semantic HTML", "ARIA when needed", "keyboard navigation", "screen reader compatibility"] },
  ],
  backend: [
    {
      type: "conceptual",
      prompt: "Explain how you design reliable APIs with clear contracts and versioning.",
      keyPoints: ["REST or alternative", "API contracts/specs", "versioning strategy", "backward compatibility"],
      followups: [
        "How do you roll out a breaking API change without breaking existing clients?",
        "Where do you validate contract compliance in CI?",
      ],
    },
    {
      type: "conceptual",
      prompt: "Describe how you approach data modeling for scalability and integrity.",
      keyPoints: ["normalization vs denormalization", "constraints and validation", "scaling considerations", "consistency trade-offs"],
      followups: [
        "When would you denormalize despite duplication risk?",
        "How do you handle cross-service referential integrity?",
      ],
    },
    {
      type: "scenario",
      prompt: "A critical endpoint is timing out. Walk through your debugging plan.",
      keyPoints: ["monitoring and logs", "identifying bottleneck", "DB queries, N+1", "caching or optimization"],
      followups: [
        "What if traces show the DB is fast but p95 latency is still high?",
        "How do you decide between fixing hot code vs scaling out?",
      ],
    },
    {
      type: "scenario",
      prompt: "How would you design a background job system with retries and idempotency?",
      keyPoints: ["job queue concept", "retry with backoff", "idempotency keys", "failure handling"],
      followups: [
        "What happens when a worker crashes mid-job?",
        "How do you detect poison messages in the queue?",
      ],
    },
    {
      type: "problem_solving",
      prompt: "Design a caching strategy for a high-traffic read-heavy system.",
      keyPoints: ["cache layer choice", "invalidation strategy", "TTL and consistency", "cache-aside or similar"],
      followups: [
        "How does your strategy change under heavy writes?",
        "How do you avoid thundering herd on expiry?",
      ],
    },
    {
      type: "problem_solving",
      prompt: "Explain how you would prevent race conditions in a multi-worker environment.",
      keyPoints: ["locks or transactions", "distributed locking", "idempotency", "example scenario"],
      followups: [
        "Compare pessimistic vs optimistic concurrency for your example.",
        "What breaks if the lock lease expires too early?",
      ],
    },
    {
      type: "scenario",
      prompt: "How do you secure APIs against common vulnerabilities (injection, CSRF, etc.)?",
      keyPoints: ["input validation", "parameterized queries", "CSRF tokens", "auth and authorization"],
      followups: [
        "How do you prioritize fixes when OWASP scan shows many findings?",
        "What is your approach to secrets in config and rotation?",
      ],
    },
  ],
  fullstack: [
    { type: "conceptual", prompt: "How do you structure a full-stack application for maintainability and team scalability?", keyPoints: ["clear layer separation", "API boundaries", "shared types/contracts", "monorepo or similar"] },
    { type: "conceptual", prompt: "Explain your approach to authentication and authorization across frontend and backend.", keyPoints: ["auth flow (JWT/session)", "secure token handling", "RBAC or permissions", "frontend-backend coordination"] },
    { type: "scenario", prompt: "A user reports data inconsistency between what they see and what's in the DB. How do you debug?", keyPoints: ["reproduce the issue", "trace request path", "cache vs source", "eventual consistency"] },
    { type: "scenario", prompt: "How would you implement real-time features (e.g. live updates) end-to-end?", keyPoints: ["WebSockets or SSE", "backend push mechanism", "frontend subscription", "scaling considerations"] },
    { type: "problem_solving", prompt: "Design a feature that requires both frontend state and server-side validation. How do you coordinate?", keyPoints: ["client validation for UX", "server validation for security", "error handling", "state sync"] },
    { type: "problem_solving", prompt: "How would you migrate a monolith to a frontend + microservices architecture?", keyPoints: ["identify service boundaries", "strangler pattern", "API gateway", "incremental migration"] },
    { type: "scenario", prompt: "How do you handle offline support or poor connectivity in a web app?", keyPoints: ["service worker/cache", "local storage", "sync strategy", "conflict resolution"] },
  ],
  data: [
    { type: "conceptual", prompt: "Explain how you validate data quality and avoid biased insights.", keyPoints: ["data quality checks", "bias identification", "validation metrics", "sample representativeness"] },
    { type: "conceptual", prompt: "Describe a statistical concept you apply frequently and why it matters.", keyPoints: ["concept explained clearly", "practical application", "limitations understood", "domain relevance"] },
    { type: "scenario", prompt: "A dashboard shows conflicting metrics across teams. How would you investigate?", keyPoints: ["metric definitions", "data lineage", "calculation differences", "alignment process"] },
    { type: "scenario", prompt: "You must deliver insights from incomplete data. What is your approach?", keyPoints: ["assess completeness", "imputation or exclusion", "communicate uncertainty", "decision support"] },
    { type: "problem_solving", prompt: "Design an ETL pipeline for scale and reliability.", keyPoints: ["extract strategy", "transformation logic", "load approach", "monitoring and idempotency"] },
    { type: "problem_solving", prompt: "How would you model a cohort analysis for retention?", keyPoints: ["cohort definition", "retention metrics", "segmentation", "visualization"] },
    { type: "scenario", prompt: "How do you communicate data findings to non-technical stakeholders?", keyPoints: ["tell a story", "avoid jargon", "visual aids", "actionable recommendations"] },
  ],
  devops: [
    { type: "conceptual", prompt: "Explain how you design CI/CD pipelines for reliability and fast feedback.", keyPoints: ["automated build and test", "fast feedback loop", "deployment strategy", "rollback capability"] },
    { type: "conceptual", prompt: "Describe how you approach infrastructure as code (IaC) and version control.", keyPoints: ["Terraform/CloudFormation/etc", "version control for infra", "reproducibility", "state management"] },
    { type: "scenario", prompt: "A production deployment causes a critical outage. Walk through your rollback and post-mortem process.", keyPoints: ["immediate rollback", "blameless post-mortem", "root cause", "prevention measures"] },
    { type: "scenario", prompt: "How would you design monitoring and alerting for a distributed system?", keyPoints: ["metrics to track", "alert thresholds", "observability stack", "on-call and runbooks"] },
    { type: "problem_solving", prompt: "Design a strategy for zero-downtime deployments.", keyPoints: ["blue-green or canary", "health checks", "traffic shifting", "database migrations"] },
    { type: "problem_solving", prompt: "How would you secure secrets and credentials in a cloud environment?", keyPoints: ["secrets manager", "no hardcoding", "least privilege", "rotation strategy"] },
    { type: "scenario", prompt: "How do you handle cost optimization in a cloud infrastructure?", keyPoints: ["right-sizing", "reserved/spot instances", "idle resource cleanup", "monitoring spend"] },
  ],
  ml: [
    { type: "conceptual", prompt: "Explain how you validate and avoid overfitting in ML models.", keyPoints: ["train/val/test split", "cross-validation", "regularization", "holdout evaluation"] },
    { type: "conceptual", prompt: "Describe the trade-offs between different model types for a given problem.", keyPoints: ["model comparison", "accuracy vs interpretability", "compute cost", "problem fit"] },
    { type: "scenario", prompt: "A model performs well offline but poorly in production. How would you debug?", keyPoints: ["data drift", "feature engineering mismatch", "latency or serving", "A/B evaluation"] },
    { type: "scenario", prompt: "How would you design an ML pipeline for continuous retraining?", keyPoints: ["data pipeline", "trigger conditions", "retraining workflow", "model versioning"] },
    { type: "problem_solving", prompt: "Design an approach for an imbalanced classification problem.", keyPoints: ["imbalance handling", "metrics (precision/recall)", "sampling or weighting", "threshold tuning"] },
    { type: "problem_solving", prompt: "How do you ensure ML systems are fair and free from bias?", keyPoints: ["bias sources", "fairness metrics", "mitigation techniques", "ongoing monitoring"] },
    { type: "scenario", prompt: "How do you explain model predictions to non-technical stakeholders?", keyPoints: ["SHAP/LIME or similar", "plain language", "confidence levels", "limitations"] },
  ],
  mobile: [
    { type: "conceptual", prompt: "Explain mobile app architecture patterns (e.g. clean architecture, MVVM) and when to use them.", keyPoints: ["architecture pattern", "separation of concerns", "testability", "when to choose"] },
    { type: "conceptual", prompt: "Describe how you handle offline storage and sync in mobile apps.", keyPoints: ["local storage choice", "sync strategy", "conflict resolution", "offline UX"] },
    { type: "scenario", prompt: "An app works on emulators but crashes on certain devices. How would you debug?", keyPoints: ["device-specific issues", "crash reporting", "repro steps", "resource constraints"] },
    { type: "scenario", prompt: "How would you implement deep linking and app-to-app navigation?", keyPoints: ["URL scheme or Universal Links", "handling incoming links", "state restoration", "fallback to web"] },
    { type: "problem_solving", prompt: "Design an approach for reducing app size and improving load time.", keyPoints: ["asset optimization", "lazy loading", "code splitting", "metrics"] },
    { type: "problem_solving", prompt: "How do you handle different screen sizes and orientations?", keyPoints: ["responsive layouts", "adaptive UI", "constraint-based layout", "testing approach"] },
    { type: "scenario", prompt: "How do you ensure good battery and performance on low-end devices?", keyPoints: ["background work", "battery impact", "memory management", "target device testing"] },
  ],
  qa: [
    { type: "conceptual", prompt: "Explain your test pyramid approach and when you use unit vs integration vs E2E tests.", keyPoints: ["pyramid structure", "unit for logic", "integration for flows", "E2E sparingly"] },
    { type: "conceptual", prompt: "Describe how you design test cases for complex user flows.", keyPoints: ["identify scenarios", "edge cases", "equivalence partitioning", "traceability"] },
    { type: "scenario", prompt: "A bug appears in production that wasn't caught by tests. How would you improve coverage?", keyPoints: ["root cause analysis", "gap in coverage", "test to prevent", "process improvement"] },
    { type: "scenario", prompt: "How would you test a system with external API dependencies?", keyPoints: ["mocking stubs", "contract testing", "test doubles", "integration strategy"] },
    { type: "problem_solving", prompt: "Design a test strategy for a legacy system with no existing tests.", keyPoints: ["risk assessment", "prioritization", "characterization tests", "incremental approach"] },
    { type: "problem_solving", prompt: "How do you balance automation with exploratory testing?", keyPoints: ["when to automate", "exploratory value", "documentation", "hybrid approach"] },
    { type: "scenario", prompt: "How do you work with developers to shift testing left?", keyPoints: ["early involvement", "CI integration", "collaboration", "shared ownership"] },
  ],
  software: [
    { type: "conceptual", prompt: "Explain the design principles you apply when writing maintainable code.", keyPoints: ["SOLID or similar", "DRY, clear naming", "single responsibility", "examples"] },
    { type: "conceptual", prompt: "Describe how you approach code reviews and what you look for.", keyPoints: ["logic correctness", "security", "readability", "constructive feedback"] },
    { type: "scenario", prompt: "Walk through how you would troubleshoot a critical production issue.", keyPoints: ["reproduce and isolate", "logs and metrics", "hypothesis testing", "fix and verify"] },
    { type: "scenario", prompt: "You inherit a legacy system with performance issues. What is your approach?", keyPoints: ["measure first", "identify hotspots", "incremental refactor", "tests before change"] },
    { type: "problem_solving", prompt: "Design a solution for a feature that requires trade-offs. Explain the trade-offs.", keyPoints: ["options considered", "trade-off analysis", "decision rationale", "implementation approach"] },
    { type: "problem_solving", prompt: "How would you refactor a large codebase with minimal risk?", keyPoints: ["incremental strategy", "tests as safety net", "feature flags", "rollback plan"] },
    { type: "scenario", prompt: "How do you balance speed of delivery with code quality?", keyPoints: ["prioritization", "tech debt awareness", "pragmatic trade-offs", "continuous improvement"] },
  ],
  product: [
    { type: "conceptual", prompt: "Explain how you prioritize features when you have limited resources.", keyPoints: ["framework (RICE, impact)", "stakeholder input", "data-driven", "trade-off reasoning"] },
    { type: "conceptual", prompt: "Describe your approach to gathering and validating user feedback.", keyPoints: ["user research methods", "validation before build", "qualitative and quantitative", "iteration"] },
    { type: "scenario", prompt: "A key stakeholder disagrees with your roadmap. How would you handle it?", keyPoints: ["understand their view", "data and rationale", "compromise or alignment", "communication"] },
    { type: "scenario", prompt: "How would you launch a new feature with minimal risk?", keyPoints: ["beta/soft launch", "gradual rollout", "metrics and feedback", "rollback plan"] },
    { type: "problem_solving", prompt: "Design a process for going from idea to shipped product.", keyPoints: ["discovery and validation", "prioritization", "build and iterate", "launch and learn"] },
    { type: "problem_solving", prompt: "How do you balance user needs with business goals?", keyPoints: ["user research", "business constraints", "alignment strategies", "trade-off examples"] },
    { type: "scenario", prompt: "How do you work with engineering to scope and estimate features?", keyPoints: ["clear requirements", "technical feasibility", "estimation techniques", "ongoing collaboration"] },
  ],
  project: [
    { type: "conceptual", prompt: "Explain how you plan and track project milestones.", keyPoints: ["planning approach", "milestone definition", "tracking tools", "communication"] },
    { type: "conceptual", prompt: "Describe your approach to risk management and mitigation.", keyPoints: ["risk identification", "assessment", "mitigation plans", "contingency"] },
    { type: "scenario", prompt: "A project is behind schedule. How would you get it back on track?", keyPoints: ["root cause analysis", "scope vs timeline", "resource adjustment", "stakeholder communication"] },
    { type: "scenario", prompt: "How would you handle scope creep from stakeholders?", keyPoints: ["change control", "impact assessment", "prioritization", "documentation"] },
    { type: "problem_solving", prompt: "Design a communication plan for a cross-functional project.", keyPoints: ["stakeholder mapping", "frequency and format", "escalation path", "transparency"] },
    { type: "problem_solving", prompt: "How do you resolve conflicts between team members?", keyPoints: ["mediate objectively", "understand root cause", "focus on resolution", "follow-up"] },
    { type: "scenario", prompt: "How do you balance competing priorities from multiple stakeholders?", keyPoints: ["prioritization framework", "transparent communication", "trade-off decisions", "alignment"] },
  ],
};

export const FALLBACK_PLAN = ROLE_PLANS.software;

/** Map job title string to InterviewQuestionBank.role key */
export function resolveInterviewBankRole(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("frontend")) return "frontend";
  if (r.includes("backend")) return "backend";
  if (r.includes("full stack") || r.includes("fullstack")) return "fullstack";
  if (r.includes("data analyst") || r.includes("data scientist") || r.includes("data")) return "data";
  if (r.includes("devops")) return "devops";
  if (r.includes("ml ") || r.includes("machine learning") || r.includes("ml engineer")) return "ml";
  if (r.includes("mobile")) return "mobile";
  if (r.includes("qa") || r.includes("quality")) return "qa";
  if (r.includes("product manager") || r.includes("product ")) return "product";
  if (r.includes("project manager") || r.includes("project ")) return "project";
  return "software";
}

/** Static 7 tech + 4 HR (experience level ignored until DB bank is active). */
export function buildStaticQuestionPlan(jobRole: string): QuestionPlanItem[] {
  const key = resolveInterviewBankRole(jobRole);
  const techPlan = ROLE_PLANS[key] ?? FALLBACK_PLAN;
  return [...techPlan, ...HR_QUESTIONS].map((q) => ({
    type: q.type,
    prompt: q.prompt,
    keyPoints: q.keyPoints,
    questionBankId: null,
    difficulty: difficultyForType(q.type),
    followups: q.followups,
  }));
}

function difficultyForType(type: string): number {
  if (type === "behavioral") return 1;
  if (type === "conceptual") return 2;
  if (type === "scenario") return 3;
  if (type === "problem_solving") return 4;
  return 2;
}
