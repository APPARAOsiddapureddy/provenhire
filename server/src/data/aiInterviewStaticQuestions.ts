export type QuestionPlanItem = {
  type: string;
  prompt: string;
  keyPoints: string[];
  questionBankId?: string | null;
  difficulty?: number;
  /** Deepening probes aligned to this prompt (bank-driven follow-up). */
  followups?: string[];
};

/** HR / behavioral — fewer clichés, harder to rehearse; same for all roles (last 4 of 11). */
export const HR_QUESTIONS: QuestionPlanItem[] = [
  {
    type: "behavioral",
    prompt:
      "Tell me about a time you strongly recommended a direction and later realized you were wrong once new data appeared. What did you change, and how did you communicate it to people who had already aligned to your first call?",
    keyPoints: [
      "concrete situation with stakes",
      "signal that changed their mind",
      "course correction (not doubling down)",
      "how they re-earned trust or reset expectations",
    ],
    followups: [
      "What would you instrument earlier next time so you catch that mistake faster?",
      "Who was most negatively affected, and what did you do for them specifically?",
    ],
  },
  {
    type: "behavioral",
    prompt:
      "Describe a decision where two good metrics pointed opposite ways (e.g., reliability vs. velocity, short-term revenue vs. long-term trust). What did you optimize for first, what did you explicitly sacrifice, and how did you document that trade-off for others?",
    keyPoints: ["both sides named honestly", "explicit trade-off", "stakeholder communication", "measurable outcome or learning"],
    followups: [
      "If you had half the time, which part of that decision would you cut scope on first?",
      "Who disagreed with your prioritization, and how did you handle that?",
    ],
  },
  {
    type: "behavioral",
    prompt:
      "What is a skill or domain belief you held 12–18 months ago that you have since deliberately abandoned? What evidence broke your old model, and how did you re-skill or adjust your process?",
    keyPoints: ["specific old vs new belief", "evidence-driven change", "concrete adaptation", "humility without self-deprecation"],
    followups: [
      "How did you validate the new approach before scaling it to the team?",
      "What residue of the old habit still shows up under pressure?",
    ],
  },
  {
    type: "behavioral",
    prompt:
      "When have you had to deliver a hard message upward (to a lead, exec, or client) that they did not want to hear? How did you structure the message, and what happened to the relationship and the plan afterward?",
    keyPoints: ["stakes and audience", "structure and empathy", "outcome on trust and delivery", "what they would repeat"],
    followups: [
      "What would you do differently if you had to send that message in writing only (no meeting)?",
      "How did you follow up after the emotional peak of that conversation?",
    ],
  },
];

/** Role-specific technical questions (first 7 of 10). Key points define ideal answer criteria for scoring. */
export const ROLE_PLANS: Record<string, QuestionPlanItem[]> = {
  frontend: [
    {
      type: "conceptual",
      prompt:
        "Explain how you structure components and state so the UI stays predictable as the app grows (framework-agnostic is fine).",
      keyPoints: ["composition vs inheritance or hooks patterns", "state boundaries (local vs shared)", "side-effect isolation", "testing implications"],
      followups: ["Where have you regretted a state boundary you drew, and what leaked?", "How do you prevent prop-drilling or context soup?"],
    },
    {
      type: "conceptual",
      prompt: "Walk through the browser path from input event to pixels on screen, calling out where jank usually appears.",
      keyPoints: ["main thread vs compositor", "layout thrashing", "paint/composite", "practical mitigations"],
      followups: ["When is `will-change` or GPU layers the wrong fix?", "How do you prove jank is gone, not just shifted?"],
    },
    {
      type: "scenario",
      prompt:
        "A critical checkout flow regressed: LCP > 4s on mid-range Android, but desktop is fine. Constraints: you cannot remove required third-party scripts this sprint. How do you diagnose and ship a fix in one week?",
      keyPoints: ["device/network profiling", "critical path and deferral", "caching or bundling", "verification on real hardware"],
      followups: ["What do you defer vs load on interaction?", "What metric guardrails do you add in CI?"],
    },
    {
      type: "scenario",
      prompt: "You need feature flags for a B2B app with per-tenant behavior. How do you avoid flag spaghetti and unsafe defaults?",
      keyPoints: ["flag lifecycle and ownership", "defaults and kill switches", "evaluation latency", "testing flagged paths"],
      followups: ["How do you clean up flags after launch?", "What breaks if the flag service is down for 5 minutes?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design a form wizard (5 steps) with validation, autosave, and recovery after refresh or crash. Constraints: max 500 KB client bundle for the wizard code; users may switch devices mid-flow.",
      keyPoints: ["state persistence (server vs local)", "idempotency of saves", "validation per step vs submit", "privacy of partial data"],
      followups: ["Conflict: two tabs open — how do you merge?", "How do you handle PII in autosave payloads?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Refactor a 200k-line React SPA where any change risks regressions. Constraints: no big-bang rewrite; one team of 4; you need measurable bundle-size reduction in 6 weeks.",
      keyPoints: ["incremental boundaries (routes/features)", "measurement (bundle analyzer)", "strangler or lazy boundaries", "risk controls"],
      followups: ["What is the first module you extract and why?", "How do you stop new coupling during the refactor?"],
    },
    {
      type: "scenario",
      prompt: "You must ship WCAG 2.1 AA for a data-heavy table UI on a tight deadline. Where do teams usually fail, and how do you sequence work?",
      keyPoints: ["semantic structure", "keyboard and focus", "live regions / announcements", "testing with assistive tech"],
      followups: ["How do you prioritize virtualized rows vs. screen reader verbosity?", "What do you automate vs. manually audit?"],
    },
  ],
  backend: [
    {
      type: "conceptual",
      prompt: "Explain how you design reliable APIs with clear contracts and versioning.",
      keyPoints: ["REST or alternative", "API contracts/specs", "versioning strategy", "backward compatibility"],
      followups: ["How do you roll out a breaking API change without breaking existing clients?", "Where do you validate contract compliance in CI?"],
    },
    {
      type: "conceptual",
      prompt: "Describe how you approach data modeling for scalability and integrity.",
      keyPoints: ["normalization vs denormalization", "constraints and validation", "scaling considerations", "consistency trade-offs"],
      followups: ["When would you denormalize despite duplication risk?", "How do you handle cross-service referential integrity?"],
    },
    {
      type: "scenario",
      prompt: "A critical endpoint is timing out. Walk through your debugging plan.",
      keyPoints: ["monitoring and logs", "identifying bottleneck", "DB queries, N+1", "caching or optimization"],
      followups: ["What if traces show the DB is fast but p95 latency is still high?", "How do you decide between fixing hot code vs scaling out?"],
    },
    {
      type: "scenario",
      prompt: "How would you design a background job system with retries and idempotency?",
      keyPoints: ["job queue concept", "retry with backoff", "idempotency keys", "failure handling"],
      followups: ["What happens when a worker crashes mid-job?", "How do you detect poison messages in the queue?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design a read-heavy caching layer. Constraints: ~10M DAU, p95 read latency 50 ms SLO, origin database cannot exceed 2k QPS aggregate; writes are bursty (flash sales).",
      keyPoints: ["cache placement (CDN/app/DB)", "invalidation or TTL strategy", "stampede mitigation", "write-through vs write-behind trade-offs"],
      followups: ["What fails first under a hot key attack?", "How do you observe cache effectiveness in production?"],
    },
    {
      type: "problem_solving",
      prompt: "Explain how you would prevent race conditions in a multi-worker environment.",
      keyPoints: ["locks or transactions", "distributed locking", "idempotency", "example scenario"],
      followups: ["Compare pessimistic vs optimistic concurrency for your example.", "What breaks if the lock lease expires too early?"],
    },
    {
      type: "scenario",
      prompt: "How do you secure APIs against common vulnerabilities (injection, CSRF, etc.)?",
      keyPoints: ["input validation", "parameterized queries", "CSRF tokens", "auth and authorization"],
      followups: ["How do you prioritize fixes when OWASP scan shows many findings?", "What is your approach to secrets in config and rotation?"],
    },
  ],
  fullstack: [
    {
      type: "conceptual",
      prompt: "How do you structure a full-stack app so teams can ship independently without breaking shared contracts?",
      keyPoints: ["API/schema ownership", "shared types or codegen", "module boundaries", "monorepo vs polyrepo trade-offs"],
      followups: ["Where do you allow duplication to reduce coupling?", "How do you version breaking API changes with the web client?"],
    },
    {
      type: "conceptual",
      prompt: "Explain authN and authZ across browser, API gateway, and services for a B2B SaaS.",
      keyPoints: ["token/session model", "tenant isolation", "least privilege", "token refresh and revocation"],
      followups: ["What breaks if the browser stores the refresh token incorrectly?", "How do you audit admin impersonation?"],
    },
    {
      type: "scenario",
      prompt:
        "Users see stale totals in the UI while the DB shows correct aggregates. Constraints: Redis cache with 60s TTL; some writes bypass the cache path. How do you find root cause and fix?",
      keyPoints: ["repro and trace path", "cache key design", "write-through gaps", "consistency messaging to users"],
      followups: ["Do you fix correctness or UX first under outage pressure?", "What invariant checks do you add after the fix?"],
    },
    {
      type: "scenario",
      prompt: "You need real-time presence and notifications for 50k concurrent connections on a modest budget. Outline an end-to-end approach.",
      keyPoints: ["transport choice (WS/SSE)", "fan-out and backpressure", "horizontal scale", "auth on connection"],
      followups: ["What happens during deploy with sticky sessions disabled?", "How do you avoid thundering reconnect storms?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design a feature with rich client validation and strict server validation. Constraints: mobile web must work offline for 2 minutes of edits; server is source of truth.",
      keyPoints: ["duplicate rules strategy", "conflict resolution", "error UX", "security (no trust in client)"],
      followups: ["How do you keep rules in sync across stacks?", "What is your merge strategy when offline edits conflict?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Migrate a monolith to web + services. Constraints: zero downtime; peak 3k RPS; no more than 15% latency regression during migration.",
      keyPoints: ["strangler or parallel run", "data dual-write or CDC", "rollback", "observability per slice"],
      followups: ["Which slice do you cut first and why?", "How do you test parity between old and new paths?"],
    },
    {
      type: "scenario",
      prompt: "Mobile web on flaky 3G: how do you handle offline reads, queued writes, and conflict surfacing?",
      keyPoints: ["service worker scope", "optimistic UI limits", "sync queue", "user-visible conflict rules"],
      followups: ["What data do you refuse to cache on shared devices?", "How do you cap queue growth?"],
    },
  ],
  data: [
    {
      type: "conceptual",
      prompt: "How do you validate data quality and reduce biased conclusions before insights reach decisions?",
      keyPoints: ["quality dimensions", "bias sources", "sampling and segments", "documentation of limitations"],
      followups: ["Give an example where a 'clean' metric still misled stakeholders.", "How do you decide when not to ship an analysis?"],
    },
    {
      type: "conceptual",
      prompt: "Pick one statistical or causal idea you use often in product or ops work and explain when it fails.",
      keyPoints: ["clear definition", "practical use", "assumptions", "failure modes"],
      followups: ["How do you explain that limitation to a skeptical exec?", "What simpler heuristic do you use under time pressure?"],
    },
    {
      type: "scenario",
      prompt:
        "Two teams report different conversion rates for the same funnel on the same day. Constraints: both queries pass CI; warehouse refresh lag ≤ 15 min. How do you reconcile?",
      keyPoints: ["metric definitions", "filters and cohorts", "time zones and attribution", "alignment process"],
      followups: ["What single source of definition do you institutionalize?", "How do you prevent recurrence without slowing teams?"],
    },
    {
      type: "scenario",
      prompt: "Leadership wants a decision Monday; you have 70% of needed data and known gaps. What do you deliver?",
      keyPoints: ["explicit uncertainty", "sensitivity analysis", "risk framing", "next data to collect"],
      followups: ["What would flip your recommendation?", "How do you avoid false precision in slides?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design an ETL pipeline for 500 GB/day of events with at-least-once ingestion. Constraints: downstream warehouse load must stay under 5k insert batches/min; late events up to 48h must be corrected idempotently.",
      keyPoints: ["ingestion idempotency", "partitioning and compaction", "late data handling", "monitoring SLAs"],
      followups: ["How do you handle schema drift from producers?", "What is your backfill strategy after a bug?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Model cohort retention for a freemium product. Constraints: definition of 'active' is disputed between teams; you must pick one for the board deck.",
      keyPoints: ["cohort grain", "active definition trade-offs", "leading vs lagging", "visualization that resists misread"],
      followups: ["How do you stress-test the definition with edge users?", "What guardrail metric pairs with retention?"],
    },
    {
      type: "scenario",
      prompt: "How do you present an ambiguous result to non-technical executives without them overfitting to a single chart?",
      keyPoints: ["narrative with uncertainty", "decision options", "next steps", "questions to expose assumptions"],
      followups: ["How do you handle the 'just give me the number' pressure?", "What do you pre-read in the room?"],
    },
  ],
  devops: [
    {
      type: "conceptual",
      prompt: "How do you design CI/CD for fast feedback without letting flaky tests erode trust?",
      keyPoints: ["pipeline stages", "test selection", "artifact promotion", "flake management"],
      followups: ["What do you block merges on vs warn on?", "How do you attribute flakes to infra vs code?"],
    },
    {
      type: "conceptual",
      prompt: "Describe IaC practices that keep prod changes reviewable and reversible.",
      keyPoints: ["state handling", "modules", "policy as code", "drift detection"],
      followups: ["When do you allow click-ops exceptions?", "How do you test infra changes safely?"],
    },
    {
      type: "scenario",
      prompt: "A deploy caused a critical outage. Constraints: rollback must complete in <5 min; DB migration already partially applied. What do you do first through postmortem?",
      keyPoints: ["rollback vs forward fix", "customer comms", "data safety", "blameless RCA"],
      followups: ["When would you refuse to roll back?", "What guardrail prevents repeat class of failure?"],
    },
    {
      type: "scenario",
      prompt: "Design alerting for a distributed system without pager fatigue. Constraints: SLO error budget is 0.2% monthly.",
      keyPoints: ["SLO-based alerts", "symptoms vs causes", "runbooks", "on-call hygiene"],
      followups: ["What do you alert on at tier-2 vs tier-1?", "How do you catch slow-burn SLO burns?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Zero-downtime deploy for a stateful service with long-lived TCP sessions. Constraints: session stickiness today; you want to move to rolling pods behind a LB.",
      keyPoints: ["connection draining", "health checks", "double-write or bridge period", "validation"],
      followups: ["What user-visible failure modes remain?", "How do you roll back mid-migration?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Secrets in a multi-account cloud setup. Constraints: 200 microservices; no secret in git; rotation every 90 days; break-glass for incidents.",
      keyPoints: ["secrets manager", "identity boundaries", "rotation automation", "audit"],
      followups: ["How do developers debug locally without prod secrets?", "What is your blast radius if one secret leaks?"],
    },
    {
      type: "scenario",
      prompt: "Finance says cloud spend is 30% over budget. Constraints: you cannot degrade prod SLOs. What is your 30-day plan?",
      keyPoints: ["measurement and tagging", "right-sizing", "waste elimination", "trade-offs communicated"],
      followups: ["What spend do you never optimize first?", "How do you prevent teams from gaming tags?"],
    },
  ],
  ml: [
    {
      type: "conceptual",
      prompt: "How do you validate models and keep them from overfitting to offline metrics?",
      keyPoints: ["splits and leakage", "regularization", "robust offline metrics", "production monitoring"],
      followups: ["Where has leakage bitten you in feature pipelines?", "What is your policy on reusing test sets?"],
    },
    {
      type: "conceptual",
      prompt: "Compare two model families for the same task: what dimensions beyond accuracy matter for production?",
      keyPoints: ["latency/cost", "interpretability", "maintainability", "data dependence"],
      followups: ["When do you pick a simpler worse-accuracy model?", "How do you document that choice for non-ML partners?"],
    },
    {
      type: "scenario",
      prompt: "Offline AUC is strong but production precision dropped after launch. Constraints: no full model retrain for 2 weeks. What is your triage order?",
      keyPoints: ["data/serving skew", "thresholds", "slice analysis", "mitigations and comms"],
      followups: ["What temporary guardrails do you ship?", "How do you decide rollback vs patch?"],
    },
    {
      type: "scenario",
      prompt: "Design continuous retraining with governance. Constraints: training jobs cost $5k each; you get at most 4 runs/month unless incident.",
      keyPoints: ["triggers", "data versioning", "evaluation gates", "rollback"],
      followups: ["Who approves an out-of-band retrain?", "How do you detect silent degradation?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Severe class imbalance (1:500). Constraints: business cares about recall@fixed precision ≥0.9; false positives are costly to ops.",
      keyPoints: ["metrics choice", "sampling/weighting", "calibration", "human-in-loop or thresholds"],
      followups: ["What baseline do you demand before fancy architectures?", "How do you monitor minority class drift?"],
    },
    {
      type: "problem_solving",
      prompt: "Fairness concern raised on a deployed model. Constraints: legal wants a response in 72h; you lack ground-truth labels for protected attributes.",
      keyPoints: ["proxy risks", "mitigations", "monitoring", "transparency limits"],
      followups: ["What do you stop doing immediately?", "What evidence is 'good enough' to resume?"],
    },
    {
      type: "scenario",
      prompt: "Explain model behavior to a skeptical exec without math-heavy slides. What is your structure?",
      keyPoints: ["outcomes and limits", "examples and counterfactuals", "confidence language", "decision support"],
      followups: ["What question do you refuse to answer with the current model?", "How do you set review cadence?"],
    },
  ],
  mobile: [
    {
      type: "conceptual",
      prompt: "Compare mobile architecture patterns you have used (MVVM, MVI, clean). When does each break down?",
      keyPoints: ["separation of concerns", "testability", "team skill fit", "concrete trade-offs"],
      followups: ["What is your default for a new greenfield app and why?", "Where does DI complexity hurt?"],
    },
    {
      type: "conceptual",
      prompt: "How do you design offline-first flows without corrupting server state?",
      keyPoints: ["local source of truth", "sync protocol", "conflict rules", "UX for failures"],
      followups: ["What conflicts do you refuse to auto-merge?", "How do you test flaky networks systematically?"],
    },
    {
      type: "scenario",
      prompt: "Crash only on certain OEM devices. Constraints: no physical device lab budget this quarter. How do you proceed?",
      keyPoints: ["symbolication and breadcrumbs", "remote logging ethics", "cloud device farms", "narrow hypotheses"],
      followups: ["When do you block release on a 0.1% crash slice?", "What telemetry do you add first?"],
    },
    {
      type: "scenario",
      prompt: "Deep linking into authenticated screens: how do you handle cold start, expired tokens, and web fallback?",
      keyPoints: ["URL design", "auth handoff", "state restoration", "security (open redirects)"],
      followups: ["How do you test links from email vs push?", "What is your policy on logged-out users hitting deep links?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Cut cold start time by 40% in 4 weeks. Constraints: cannot remove required SDKs; binary size cap already hit.",
      keyPoints: ["profiling", "lazy init", "defer non-critical work", "measurement in CI"],
      followups: ["What do you load after first frame?", "How do you prevent regressions?"],
    },
    {
      type: "problem_solving",
      prompt: "Support phones from 5\" to foldables with one codebase. Constraints: design wants custom layouts per form factor.",
      keyPoints: ["window size classes", "adaptive layouts", "testing matrix", "performance on low RAM"],
      followups: ["How do you avoid N× maintenance for layouts?", "What is your lowest supported API level policy?"],
    },
    {
      type: "scenario",
      prompt: "Battery drain spike after a release. How do you isolate background work vs UI vs network?",
      keyPoints: ["profilers", "workmanager/job limits", "wake locks", "A/B or staged rollout"],
      followups: ["What user setting interactions complicate diagnosis?", "How do you communicate hotfix ETA?"],
    },
  ],
  qa: [
    {
      type: "conceptual",
      prompt: "Explain your test pyramid and where you intentionally violate it — with consequences you accept.",
      keyPoints: ["unit vs integration vs E2E", "cost of violation", "risk-based reasoning", "examples"],
      followups: ["What test type has given your team false confidence?", "How do you measure ROI of E2E?"],
    },
    {
      type: "conceptual",
      prompt: "How do you design tests for non-deterministic systems (async, clocks, retries, flaky networks)?",
      keyPoints: ["determinism hooks", "seed/time control", "retry assertions", "isolation"],
      followups: ["When do you prefer contract tests over E2E here?", "How do you avoid over-mocking reality?"],
    },
    {
      type: "scenario",
      prompt:
        "A sev-2 escaped to prod despite green CI. Constraints: test suite runtime is already 45 min; you cannot double it. How do you close the hole?",
      keyPoints: ["RCA on gap", "targeted regression", "shift-left ownership", "signal not volume"],
      followups: ["What do you delete or quarantine in the suite?", "What production check buys time safely?"],
    },
    {
      type: "scenario",
      prompt: "Third-party APIs in critical paths: how do you test without brittle live calls?",
      keyPoints: ["contract tests", "record/replay trade-offs", "fault injection", "consumer-driven contracts"],
      followups: ["When do you run a subset live in CI?", "How do you detect provider drift early?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Legacy monolith, almost no tests, 10 releases/year becoming weekly. Constraints: 15% of modules cause 80% of incidents; no dedicated QA headcount increase.",
      keyPoints: ["risk heatmap", "characterization tests", "critical user journeys", "incremental gates"],
      followups: ["What is your first automated gate on the deploy path?", "How do you stop new untested code paths?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Load test before Black Friday. Constraints: prod-like traffic shape unknown; budget for one 4-hour soak in staging; DB is 30% smaller than prod.",
      keyPoints: ["risk assumptions", "traffic model", "bottleneck identification", "interpretation limits"],
      followups: ["What result would still make you block the release?", "What do you monitor first hour live?"],
    },
    {
      type: "scenario",
      prompt: "Developers ship fast but skip tests. How do you change incentives without becoming the bottleneck?",
      keyPoints: ["shared ownership", "CI signals", "templates and examples", "escalation path"],
      followups: ["What do you automate in PR templates?", "When do you say no to a hotfix without tests?"],
    },
  ],
  software: [
    {
      type: "conceptual",
      prompt: "What principles guide your refactors when the domain is messy and tests are thin?",
      keyPoints: ["safety rails", "incremental steps", "observability", "naming and boundaries"],
      followups: ["When do you stop refactoring and freeze behavior?", "What debt do you document vs fix?"],
    },
    {
      type: "conceptual",
      prompt: "What do you optimize for in code review beyond correctness?",
      keyPoints: ["security", "operability", "inclusive feedback", "learning"],
      followups: ["How do you handle repeated style debates?", "What is your SLA for review turnaround?"],
    },
    {
      type: "scenario",
      prompt: "Sev-1 in prod: error rate 10x baseline. Constraints: last deploy was 6 hours ago; rollback is not obviously safe. First 30 minutes?",
      keyPoints: ["stabilize vs root cause", "comms", "data integrity", "decision criteria"],
      followups: ["When do you split traffic vs roll back?", "What do you log for the postmortem you wish you had?"],
    },
    {
      type: "scenario",
      prompt: "Legacy system: p95 latency doubled after a dependency upgrade. No obvious errors. How do you bisect?",
      keyPoints: ["measurement", "profiling", "dependency diff", "controlled experiment"],
      followups: ["What do you pin temporarily?", "How do you prevent upgrade thrash?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Ship a feature with strict latency and correctness trade-offs. Constraints: 120 ms p95 budget end-to-end; occasional stale reads acceptable for 30s for non-financial reads.",
      keyPoints: ["options with numbers", "consistency model", "fallback behavior", "verification"],
      followups: ["What invariant is non-negotiable?", "How do you expose staleness to users if needed?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Refactor a 10-year module with shared global state. Constraints: two teams touch it weekly; you have 3 sprints.",
      keyPoints: ["seam identification", "tests around seams", "feature flags", "incremental extraction"],
      followups: ["What is the smallest first extraction?", "How do you coordinate cross-team merges?"],
    },
    {
      type: "scenario",
      prompt: "Business wants 2x velocity; engineering warns quality collapse. How do you broker a sustainable plan?",
      keyPoints: ["throughput vs utilization", "WIP limits", "debt budget", "measurable quality signals"],
      followups: ["What metric do you refuse to game?", "How often do you revisit the bargain?"],
    },
  ],
  product: [
    {
      type: "conceptual",
      prompt: "How do you prioritize when RICE-style scores disagree with qualitative customer pain you have seen firsthand?",
      keyPoints: ["framework use and limits", "qual vs quant synthesis", "explicit assumptions", "stakeholder alignment"],
      followups: ["Tell me a time the score was wrong — what signal overrode it?", "How do you document dissenting opinions?"],
    },
    {
      type: "conceptual",
      prompt: "How do you validate demand before engineering commits more than one sprint?",
      keyPoints: ["hypothesis", "cheap tests", "success criteria", "kill criteria"],
      followups: ["What is an example of a validation you stopped early?", "How do you handle HiPPO pressure?"],
    },
    {
      type: "scenario",
      prompt:
        "Two exec sponsors want opposite roadmap bets for Q3. Constraints: one shared engineering pool; you can only fully fund one bet; the other gets a thin experiment.",
      keyPoints: ["decision framing", "data and risk", "experiment design", "communication plan"],
      followups: ["What would change your mind in 4 weeks?", "How do you protect the thin experiment from being starved?"],
    },
    {
      type: "scenario",
      prompt:
        "Launch a risky feature to 10% of users first. Constraints: key metric moves slowly (28-day retention); you need a go/no-go in 10 days.",
      keyPoints: ["leading indicators", "guardrails", "rollback triggers", "ethical exposure"],
      followups: ["What false positive in metrics worries you most?", "How do you communicate uncertainty to GTM?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design a discovery-to-delivery process for a cross-functional squad. Constraints: designers and engineers each 4 people; legal review adds 1 week median.",
      keyPoints: ["discovery artifacts", "handoffs", "parallelization", "quality gates"],
      followups: ["Where do you allow skipping steps?", "How do you measure cycle time without sandbagging?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Balance user trust (privacy) with growth metrics. Constraints: personalization could lift activation 8% but increases data collection; compliance requires opt-in in EU only.",
      keyPoints: ["segmented approach", "defaults and copy", "measurement ethics", "trade-off articulation"],
      followups: ["What do you refuse to ship even if legal allows?", "How do you test messaging sensitivity?"],
    },
    {
      type: "scenario",
      prompt: "Engineering says an estimate is 2× your expectation. Constraints: fixed launch date with marketing spend committed.",
      keyPoints: ["scope negotiation", "risk transparency", "phased scope", "stakeholder reset"],
      followups: ["What do you cut first: quality, scope, or polish?", "How do you avoid silent corner-cutting?"],
    },
  ],
  project: [
    {
      type: "conceptual",
      prompt: "How do you structure milestones so they predict delivery without encouraging sandbagging or gaming?",
      keyPoints: ["milestone granularity", "evidence of done", "buffers and transparency", "tracking"],
      followups: ["What leading indicators do you watch weekly?", "When do you reset the plan vs push harder?"],
    },
    {
      type: "conceptual",
      prompt: "How do you prioritize risks when the register is long but mitigation time is short?",
      keyPoints: ["impact × likelihood", "dependencies", "mitigation vs acceptance", "owners"],
      followups: ["What risk do teams commonly underestimate in software projects?", "How do you escalate a accepted risk that worsens?"],
    },
    {
      type: "scenario",
      prompt:
        "Project is 4 weeks behind with 6 weeks to committed date. Constraints: scope is contractually fixed; budget for at most 2 contractors for 3 weeks; overtime capped at 10% for the core team.",
      keyPoints: ["critical path analysis", "trade-offs on quality vs parallelization", "dependency negotiation", "stakeholder comms"],
      followups: ["What scope do you try to renegotiate first with evidence?", "How do you avoid burning out the two experts everyone depends on?"],
    },
    {
      type: "scenario",
      prompt:
        "Scope creep: legal requests a compliance workflow mid-sprint that touches 3 squads. Constraints: no date movement allowed by leadership; each squad already at 95% utilization.",
      keyPoints: ["change control", "impact sizing", "WIP reduction", "escalation with options"],
      followups: ["What do you stop doing to absorb the work?", "How do you document the risk acceptance if you must?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Design a communication plan for a 6-month program across 4 time zones, 8 stakeholder groups, and monthly steering. Constraints: exec sponsor only has 30 min/month; two groups are historically misaligned.",
      keyPoints: ["stakeholder map", "cadence and channels", "decision rights", "conflict surfacing early"],
      followups: ["What async artifact replaces a meeting?", "How do you handle silent disagreement?"],
    },
    {
      type: "problem_solving",
      prompt:
        "Two senior ICs clash on technical direction; both are critical path; their dispute is slowing commits. Constraints: you cannot remove either from the project; HR escalation is last resort; you need movement in 48 hours.",
      keyPoints: ["fact base vs personality", "time-boxed decision forum", "documented decision", "follow-through"],
      followups: ["What if neither option is technically clean?", "How do you prevent the loser from quietly sabotaging?"],
    },
    {
      type: "scenario",
      prompt:
        "Steering committee pulls the program in three directions with equal political weight. Constraints: you can only deliver one top priority per month; metrics dashboards disagree on impact.",
      keyPoints: ["transparent prioritization framework", "single stack rank with rationale", "negotiation", "managing optics"],
      followups: ["How do you say no to the highest-title sponsor?", "What interim deliverable buys alignment time?"],
    },
  ],
};

export const FALLBACK_PLAN = ROLE_PLANS.software;

function normalizeRoleTitle(role: string): string {
  return role.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Map job title string to InterviewQuestionBank.role key.
 * Order matters: compound titles (e.g. ML platform) before generic "platform" or "data".
 */
export function resolveInterviewBankRole(role: string): string {
  const r = normalizeRoleTitle(role);

  // --- Compound / high-signal first ---
  if (/\b(full[\s-]?stack|fullstack)\b/.test(r)) return "fullstack";

  // ML / AI engineering & science (before devops "platform" and generic "data")
  if (
    /\b(ml platform|machine learning platform|machine learning engineer|machine learning scientist)\b/.test(r) ||
    /\b(deep learning|computer vision|nlp engineer|natural language processing)\b/.test(r) ||
    /\b(mlops|generative ai|ai scientist)\b/.test(r) ||
    /\b(mle)\b/.test(r) ||
    /\b(ml)\b.*\b(engineer|developer|researcher|architect|scientist)\b/.test(r) ||
    /\b(engineer|developer|researcher|scientist)\b.*\b(ml|machine learning)\b/.test(r) ||
    /\b(ai engineer|artificial intelligence engineer)\b/.test(r)
  ) {
    return "ml";
  }

  // Data analytics / engineering (avoid matching "database" alone)
  if (
    /\b(data scientist|data analyst|data engineer|analytics engineer)\b/.test(r) ||
    /\b(business intelligence|bi developer|bi analyst|data warehouse|etl developer)\b/.test(r) ||
    /\b(statistician|quantitative analyst)\b/.test(r)
  ) {
    return "data";
  }

  // Backend & data stores
  if (
    /\b(backend|back end|back-end)\b/.test(r) ||
    /\b(database engineer|database developer|sql developer|\bdba\b)\b/.test(r) ||
    /\b(server[\s-]?side|api engineer|microservices engineer)\b/.test(r)
  ) {
    return "backend";
  }

  // Frontend (after backend to avoid "backend of frontend" oddities)
  if (/\b(frontend|front end|front-end)\b/.test(r)) return "frontend";
  if (/\b(ui engineer|ui developer|react developer|angular developer)\b/.test(r)) return "frontend";
  if (/\bvue\.?js\b/.test(r) || /\bvue developer\b/.test(r)) return "frontend";
  if (/\breact\b/.test(r) && !/\breact native\b/.test(r) && /\b(engineer|developer)\b/.test(r)) return "frontend";

  // DevOps / SRE / platform (non-ML; "ml platform" handled above)
  if (
    /\b(devops|sre|site reliability)\b/.test(r) ||
    /\b(infrastructure engineer|cloud engineer|kubernetes|terraform engineer)\b/.test(r) ||
    /\bplatform engineer\b/.test(r)
  ) {
    return "devops";
  }

  // Mobile before generic "react"
  if (/\b(mobile|ios|android|flutter|swift developer|kotlin developer)\b/.test(r) || /\breact native\b/.test(r)) {
    return "mobile";
  }

  // QA / test
  if (/\b(qa|quality assurance|test engineer|sdet|automation engineer|software tester)\b/.test(r)) return "qa";

  // Product marketing IC track → general software bank (unless they are explicitly a PM)
  if (/\bproduct marketing\b/.test(r) && !/\bproduct manager\b/.test(r)) return "software";

  const hasPmTitle =
    /\b(product manager|product owner|head of product|director of product|chief product officer|group product)\b/.test(r) ||
    /\b(senior|lead|principal|staff|associate|junior|jr\.?)\s+product manager\b/.test(r) ||
    /\b(apm|spm)\b/.test(r);

  const designIcWithoutPm =
    /\b(product designer|product design|ux designer|ui designer)\b/.test(r) && !hasPmTitle;
  if (designIcWithoutPm) return "software";
  if (hasPmTitle) return "product";

  // Program / project / delivery (TPM before generic PM word)
  if (/\b(technical program|tpm)\b/.test(r)) return "project";
  if (
    /\b(project manager|program manager|scrum master|delivery manager|agile coach|project coordinator)\b/.test(r) ||
    /\b(pmo|ppm)\b/.test(r)
  ) {
    return "project";
  }

  // Ambiguous "PM": product vs project vs engineering manager
  if (/\bpm\b/.test(r)) {
    if (/\b(engineer|engineering|developer|software)\b/.test(r)) return "software";
    return "product";
  }

  // Broad "data" without "database" false positive
  if (/\bdata\b/.test(r) && !/\bdatabase\b/.test(r) && /\b(analyst|scientist|engineer)\b/.test(r)) return "data";

  return "software";
}

/** Base difficulty by question type (1–4). */
function difficultyBaseForType(type: string): number {
  if (type === "behavioral") return 1;
  if (type === "conceptual") return 2;
  if (type === "scenario") return 3;
  if (type === "problem_solving") return 4;
  return 2;
}

/**
 * Static bank difficulty adjusted for experience level (junior / mid / senior).
 * Used by `buildStaticQuestionPlan` and DB seed parity.
 */
export function difficultyForStaticQuestion(type: string, experienceLevel?: string): number {
  const base = difficultyBaseForType(type);
  const lvl = (experienceLevel || "mid").toLowerCase();
  if (lvl === "junior") {
    if (type === "behavioral") return 1;
    return Math.max(1, base - 1);
  }
  if (lvl === "senior") {
    if (type === "behavioral") return 2;
    return Math.min(5, base + 1);
  }
  return base;
}

/** Static 7 tech + 4 HR. `experienceLevel` adjusts difficulty when provided (junior | mid | senior). */
export function buildStaticQuestionPlan(jobRole: string, experienceLevel?: string): QuestionPlanItem[] {
  const key = resolveInterviewBankRole(jobRole);
  const techPlan = ROLE_PLANS[key] ?? FALLBACK_PLAN;
  const lvl = experienceLevel?.toLowerCase();
  return [...techPlan, ...HR_QUESTIONS].map((q) => ({
    type: q.type,
    prompt: q.prompt,
    keyPoints: q.keyPoints,
    questionBankId: null,
    difficulty: difficultyForStaticQuestion(q.type, lvl),
    followups: q.followups,
  }));
}
