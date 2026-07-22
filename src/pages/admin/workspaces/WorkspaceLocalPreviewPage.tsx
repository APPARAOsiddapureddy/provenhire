import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  Code2,
  BrainCircuit,
  Database,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

import { WorkspaceRegistrationsTable } from "./WorkspaceAdminComponents";
import type {
  WorkspaceCandidateDossier,
  WorkspaceRegistration,
  WorkspaceRoundType,
} from "./types";

const now = new Date().toISOString();
export const workspaceId = "local-preview-workspace";

export const registrations: WorkspaceRegistration[] = [
  {
    id: "preview-registration-praveen",
    workspaceId,
    userId: "preview-praveen",
    status: "registered",
    registeredAt: now,
    user: {
      id: "preview-praveen",
      email: "praveen.preview@provenhire.local",
      name: "Praveen Kumar",
      jobSeekerProfile: {
        fullName: "Praveen Kumar",
        targetJobTitle: "Full Stack Developer",
        college: "Local preview fixture",
      },
    },
  },
];

const attempt = (
  id: string,
  order: number,
  name: string,
  type: WorkspaceRoundType,
  score: number,
) => ({
  id,
  roundType: type,
  status: "completed",
  score,
  percentageScore: score,
  weightedScore: score / 4,
  completedAt: now,
  workspaceRound: {
    id: `round-${order}`,
    order,
    name,
    type,
    scoreWeightage: 33.33,
  },
});

function dossierFor(
  registration: WorkspaceRegistration,
  scoreOffset = 0,
): WorkspaceCandidateDossier {
  const candidate = registration.user!;
  const strong = scoreOffset === 0;
  const aptitudeScore = 91 - scoreOffset;
  const dsaScore = 88 - scoreOffset;
  const sqlScore = 84 - scoreOffset;
  // The linked saved Antigravity artifact is a 6.0/10 MAYBE report. Keep the
  // workspace index aligned with that canonical report instead of inventing a demo verdict.
  const antigravityScore = strong ? 60 : 74;
  const aptitudeQuestionReview = [
    {
      id: "lr-01",
      question:
        "A deployment can start only after both security approval and load testing. Load testing is complete, but security approval is pending. What follows?",
      options: [
        "Deployment may start",
        "Deployment must wait",
        "Only a rollback may start",
        "No conclusion",
      ],
      selectedAnswer: "Deployment must wait",
      correctAnswer: "Deployment must wait",
      outcome: "correct",
      marks: 4,
    },
    {
      id: "qa-07",
      question:
        "A service processes 1,200 requests in 8 minutes at a constant rate. How many requests does it process in 15 minutes?",
      options: ["1,800", "2,000", "2,250", "2,400"],
      selectedAnswer: strong ? "2,250" : "2,000",
      correctAnswer: "2,250",
      outcome: strong ? "correct" : "incorrect",
      marks: 4,
    },
    {
      id: "cs-11",
      question:
        "Which isolation anomaly allows two transactions to read the same row and both update based on the old value?",
      options: ["Dirty read", "Lost update", "Phantom read", "Write skew"],
      selectedAnswer: "Lost update",
      correctAnswer: "Lost update",
      outcome: "correct",
      marks: 4,
    },
    {
      id: "lr-14",
      question:
        "All idempotent handlers are retry-safe. Some payment handlers are idempotent. Which conclusion is guaranteed?",
      options: [
        "All payment handlers are retry-safe",
        "Some payment handlers are retry-safe",
        "No payment handler fails",
        "All retry-safe handlers are idempotent",
      ],
      selectedAnswer: "Some payment handlers are retry-safe",
      correctAnswer: "Some payment handlers are retry-safe",
      outcome: "correct",
      marks: 4,
    },
    {
      id: "qa-19",
      question:
        "Error rate falls from 2.5% to 1.5%. What is the relative reduction?",
      options: ["1%", "20%", "40%", "60%"],
      selectedAnswer: strong ? "20%" : "40%",
      correctAnswer: "40%",
      outcome: strong ? "incorrect" : "correct",
      marks: 4,
    },
    {
      id: "cs-23",
      question:
        "What property does a compare-and-swap loop primarily provide when contention is bounded?",
      options: [
        "Wait freedom",
        "Lock freedom",
        "Serializability",
        "Durability",
      ],
      selectedAnswer: "Lock freedom",
      correctAnswer: "Lock freedom",
      outcome: "correct",
      marks: 4,
    },
    {
      id: "lr-27",
      question:
        "A monitor fires if latency is high or error rate is high. Neither alert fired. What can be inferred?",
      options: [
        "Both signals stayed below threshold",
        "Only latency stayed low",
        "The monitor was disabled",
        "Nothing",
      ],
      selectedAnswer: "Both signals stayed below threshold",
      correctAnswer: "Both signals stayed below threshold",
      outcome: "correct",
      marks: 4,
    },
    {
      id: "qa-30",
      question:
        "A cache hit saves 18 ms. At 4,000 hits per minute, how much aggregate latency is avoided per minute?",
      options: ["7.2 seconds", "72 seconds", "720 seconds", "7,200 seconds"],
      selectedAnswer: null,
      correctAnswer: "72 seconds",
      outcome: "skipped",
      marks: 4,
    },
  ];
  const dsaProblems = [
    {
      title: "Rate-limited event processor",
      score: strong ? 46 : 40,
      status: "passed",
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(k)",
      approach:
        "Sort arrivals by timestamp, expire buckets outside the rolling window, then maintain a bounded per-key queue so rate decisions are deterministic.",
      code: "function acceptedEvents(events: Event[], limit: number, windowMs: number) {\n  const queues = new Map<string, number[]>();\n  return [...events].sort((a, b) => a.at - b.at).filter((event) => {\n    const queue = queues.get(event.key) ?? [];\n    while (queue.length && queue[0] <= event.at - windowMs) queue.shift();\n    if (queue.length >= limit) return false;\n    queue.push(event.at); queues.set(event.key, queue); return true;\n  });\n}",
      testCasesPassed: strong ? 11 : 9,
      testCasesTotal: 11,
      edgeCases: [
        "Out-of-order arrivals",
        "Exact window boundary",
        "Independent tenant keys",
      ],
      followUpRead:
        "Correctly explained why sorting dominates runtime and why the active queue is bounded by the rate limit.",
    },
    {
      title: "Idempotent delivery ledger",
      score: strong ? 42 : 36,
      status: "partial",
      timeComplexity: "O(n)",
      spaceComplexity: "O(u)",
      approach:
        "Use the idempotency key as the ledger identity, return the first committed result for duplicates, and reject conflicting payload reuse.",
      code: "function commitDeliveries(items: Delivery[]) {\n  const ledger = new Map<string, string>();\n  for (const item of items) {\n    const prior = ledger.get(item.key);\n    if (prior && prior !== item.payloadHash) throw new Error('idempotency conflict');\n    if (!prior) ledger.set(item.key, item.payloadHash);\n  }\n  return ledger;\n}",
      testCasesPassed: strong ? 10 : 8,
      testCasesTotal: 11,
      edgeCases: [
        "Duplicate redelivery",
        "Key reused with changed payload",
        "Empty ledger",
      ],
      followUpRead: strong
        ? "Distinguished process-local deduplication from a durable transactional ledger and identified write-before-ack recovery."
        : "Core deduplication was correct; the durable crash-recovery boundary needed prompting.",
    },
  ];
  return {
    schemaVersion: "workspace_candidate_dossier_v1",
    workspaceId,
    candidate,
    registration: {
      id: registration.id,
      status: registration.status,
      registeredAt: registration.registeredAt,
      roundAttempts: [
        attempt(
          `${registration.userId}-aptitude`,
          1,
          "Aptitude round",
          "mcq",
          aptitudeScore,
        ),
        attempt(
          `${registration.userId}-dsa`,
          2,
          "DSA round",
          "coding",
          dsaScore,
        ),
        attempt(
          `${registration.userId}-sql`,
          3,
          "SQL round",
          "sql",
          sqlScore,
        ),
        attempt(
          `${registration.userId}-interview`,
          4,
          "Placement Readiness interview",
          "interview",
          antigravityScore,
        ),
      ],
    },
    synthesis: {
      schemaVersion: "candidate_assessment_synthesis_v2",
      recommendation: "INSUFFICIENT EVIDENCE",
      decisionStatus: "insufficient_evidence",
      compositeScore: null,
      confidence: null,
      completedModules: 4,
      requiredModules: ["aptitude", "dsa", "sql", "interview"],
      completedModuleKeys: ["aptitude", "dsa", "sql", "interview"],
      readyModuleKeys: ["sql", "interview"],
      missingModuleKeys: ["aptitude", "dsa"],
      overallRead:
        "All four configured modules have stored results, but the Aptitude ledger and the failed DSA judge case are incomplete. Cross-module interpretation and the human decision are withheld until those sources are recovered or the assessments are rerun.",
      crossModuleSignals: [
        "Cross-module strengths are withheld until every source module is auditable.",
      ],
      contradictions: [
        "Cross-module comparison is withheld until every module has complete, auditable evidence.",
      ],
      verifiedStrengths: [],
      scopedRisks: strong
        ? [
            "Idempotency claims lack crash-recovery mechanisms.",
            "Tenant isolation remained conceptual rather than implementation-specific.",
          ]
        : [
            "Crash-recovery depth is only partially verified.",
            "Multi-region operations remain untested.",
          ],
      nextActions: strong
        ? [
            "Run one write-before-ack crash-recovery design probe.",
            "Ask for concrete tenant-isolation enforcement and tests.",
          ]
        : [
            "Run a 30-minute crash-recovery design probe.",
            "Ask for one independently implemented reliability work sample.",
          ],
      evidenceBasis: {
        aptitudeScore,
        dsaScore,
        sqlScore,
        interviewScore: antigravityScore,
        antigravityScore,
        antigravityVerdict: null,
        scoreSpread: 0,
        aptitudeEvidenceComplete: false,
        dsaEvidenceComplete: false,
        antigravityEvidenceComplete: true,
      },
      integrity: {
        status: "verified",
        targetRole: "Full Stack Developer",
        artifactRole: "Full stack developer",
        workspaceInterviewLinked: true,
        issues: [],
      },
      roleRubric: {
        targetRole: "Full Stack Developer",
        responsibilities: [
          "Own reliable full-stack features from API to user experience",
          "Debug production failures with observable evidence",
          "Design safe data and service boundaries",
        ],
      },
      evidenceCompleteness: {
        aptitude: false,
        dsa: false,
        sql: true,
        interview: true,
        antigravity: true,
        byModule: {
          aptitude: false,
          dsa: false,
          sql: true,
          interview: true,
        },
        issues: [
          "Aptitude retains only 8/30 question records.",
          "The partial DSA submission does not retain a reproducible failed judge case.",
        ],
      },
      decisionGates: [
        {
          key: "identity_and_role",
          status: "ready",
          label: "Candidate, session, workspace, and role binding",
          detail:
            "The saved Praveen Kumar artifact and Full Stack Developer target match this preview dossier.",
        },
        {
          key: "module_evidence",
          status: "incomplete",
          label: "Required assessment evidence",
          detail:
            "4/4 configured modules have stored results, but Aptitude retains only 8/30 questions and the DSA failure is not reproducible. Decision use is blocked.",
        },
        {
          key: "role_rubric",
          status: "ready",
          label: "Employer role rubric",
          detail:
            "Three employer-approved responsibilities are attached. They cannot be applied until the source evidence is complete.",
        },
        {
          key: "human_decision",
          status: "pending",
          label: "Named human decision owner",
          detail:
            "A qualified reviewer can record a decision only after the incomplete Aptitude and DSA evidence is recovered or rerun.",
        },
      ],
    },
    agentReports: {
      dsa: {
        id: `${registration.userId}-dsa-agent`,
        reportKind: "dsa",
        promptVersion: "assessment_report_agents_v1",
        model: "deepseek/deepseek-r1",
        sourceHash: "local-preview",
        completedAt: now,
        result: {
          schemaVersion: "dsa_reasoning_report_v1",
          decisionSignal: strong ? "strong" : "mixed",
          confidence: strong ? 0.91 : 0.76,
          executiveRead: strong
            ? "The candidate passed 21 of 22 retained tests. One submission passed every retained test and one remains partial at 10/11; inspect the failed case before using this as a broader correctness signal. The source supports sound bounded data-structure choices but does not prove durable concurrent operation."
            : "The retained implementation evidence is mixed. Inspect failed cases and crash-recovery reasoning before drawing a role-readiness conclusion.",
          algorithmicReasoning:
            "The event processor correctly identifies ordering as the dominant operation and bounds active per-key state by the rolling window. The ledger solution uses expected O(n) map operations and explicitly detects conflicting key reuse.",
          implementationQuality:
            "Source is concise and readable, with identities and failure branches visible. Production use would still require durable storage, atomic commit semantics, and operational instrumentation.",
          correctnessBoundary:
            "21/22 retained tests support strong bounded correctness. They do not prove concurrency safety, persistence across process death, or behavior under multi-writer races.",
          verifiedStrengths: [
            {
              claim:
                "Connects data-structure choice to the governing invariant",
              evidence: [
                "Per-key rolling queue",
                "Idempotency key mapped to payload hash",
              ],
              confidence: "high",
            },
          ],
          failureAndRiskAnalysis: [
            {
              claim:
                "Durability is reasoned about but not implemented in the submitted map",
              evidence: ["Official source uses process-local Map storage"],
              confidence: "high",
            },
          ],
          roleReadiness: {
            readyFor: [
              "Bounded backend implementation tasks",
              "Algorithm selection with explicit invariants",
            ],
            needsSupportFor: [
              "Transactional delivery ledgers",
              "Concurrent multi-writer correctness",
            ],
            avoidUntilVerified: [
              "Owning payment idempotency without a persistence design review",
            ],
          },
          recommendedPanelProbes: [
            "Ask the candidate to make the ledger atomic across write-before-ack process death.",
            "Introduce two concurrent writers using the same key with different payloads.",
          ],
          evidenceLimits: [
            "The local preview contains representative source and aggregate judge outcomes, not a live production submission record.",
          ],
        },
        usage: { prompt_tokens: 4312, completion_tokens: 1620 },
        estimatedCostUsd: 0.0071,
      },
      unified: {
        id: `${registration.userId}-unified-agent`,
        reportKind: "unified",
        promptVersion: "assessment_report_agents_v1",
        model: "deepseek/deepseek-r1",
        sourceHash: "local-preview",
        completedAt: now,
        result: {
          schemaVersion: "unified_reasoning_report_v1",
          recommendation: "insufficient_evidence",
          confidence: strong ? 0.82 : 0.8,
          executiveRead: strong
            ? "Aptitude (91) and DSA (88) support strong bounded problem solving, while Antigravity (60) leaves crash recovery and implementation depth unresolved. This contradiction requires a targeted human review; it is not an automated advance decision."
            : "Objective reasoning and implementation are positive while distributed recovery evidence remains incomplete. A human reviewer must apply the role rubric and resolve that gap.",
          crossModuleThesis:
            "Aptitude establishes fast structured comprehension; DSA converts that into executable mechanisms; Antigravity verifies whether the same reasoning survives ownership and failure-mode pressure.",
          reinforcingSignals: [
            {
              claim:
                "Structured reasoning transfers from fixed problems into production mechanisms",
              evidence: [
                `Aptitude ${aptitudeScore}/100`,
                `DSA ${dsaScore}/100`,
                `Antigravity ${antigravityScore}/100`,
              ],
              confidence: "high",
            },
          ],
          contradictions: [
            {
              claim:
                "Objective implementation performance is stronger than demonstrated production failure-handling depth",
              evidence: [
                `DSA ${dsaScore}/100`,
                `Antigravity ${antigravityScore}/100`,
                "Crash-recovery mechanism unresolved",
              ],
              confidence: "high",
            },
          ],
          riskRegister: [
            {
              risk: strong
                ? "Product-cost prioritization remains lightly tested"
                : "Crash recovery remains partially verified",
              severity: "medium",
              evidence: [
                strong
                  ? "Antigravity recommended follow-up"
                  : "Interview failure-recovery gap",
              ],
              resolution: strong
                ? "Run one cost-versus-reliability decision discussion."
                : "Run a write-before-ack recovery design probe.",
            },
          ],
          roleFit: {
            readyNow: [
              "Backend feature ownership",
              "Observable reliability improvements",
            ],
            conditional: [
              "High-stakes distributed correctness with design review",
            ],
            notYetProven: ["Independent multi-region operational ownership"],
          },
          panelDecisionGuide: [
            "Use the DSA source and Antigravity claim evidence together; do not re-test generic syntax.",
            "Resolve only the highest remaining uncertainty before the final decision.",
          ],
          evidenceLimits: [
            "The local preview is production-shaped demonstration data, not a real candidate record.",
          ],
        },
        usage: { prompt_tokens: 6870, completion_tokens: 1950 },
        estimatedCostUsd: 0.0097,
      },
    },
    modules: {
      aptitude: {
        latest: {
          id: `${registration.userId}-aptitude-result`,
          score: aptitudeScore,
          completedAt: now,
          answers: {
            totalQuestions: 30,
            correct: strong ? 27 : 23,
            incorrect: strong ? 2 : 5,
            skipped: strong ? 1 : 2,
            totalMarks: 100,
            earnedMarks: aptitudeScore,
            timeTakenSeconds: strong ? 1432 : 1680,
            timeLimitSeconds: 1800,
            questionReview: aptitudeQuestionReview,
            categories: [
              { name: "Logical reasoning", score: strong ? 94 : 82 },
              { name: "Quantitative aptitude", score: strong ? 89 : 76 },
              {
                name: "Computer science fundamentals",
                score: strong ? 91 : 79,
              },
            ],
          },
        },
        history: [],
      },
      dsa: {
        latest: {
          id: `${registration.userId}-dsa-result`,
          score: dsaScore,
          completedAt: now,
          answers: {
            language: "TypeScript",
            totalProblems: 2,
            passedProblems: strong ? 2 : 1,
            testCasesPassed: strong ? 21 : 17,
            testCasesTotal: 22,
            complexityAssessment: strong
              ? "Both submissions state and justify their asymptotic costs. The first solution pays O(n log n) to normalize unordered arrivals; the ledger solution is O(n) expected time with O(u) storage for unique keys."
              : "Correct core solution; recovery and edge-case handling need follow-up.",
            problems: dsaProblems,
          },
        },
        history: [],
      },
      sql: {
        latest: null,
        history: [],
        workspaceEvidence: {
          attemptId: `${registration.userId}-sql`,
          sessionId: `${registration.userId}-sql-session`,
          score: sqlScore,
          completedAt: now,
          passedCount: 1,
          totalCount: 2,
          timeTakenSeconds: 1960,
          submissions: [
            {
              id: `${registration.userId}-sql-submission-1`,
              taskId: "sql-monthly-retention",
              query:
                "SELECT account_id, DATE_TRUNC('month', occurred_at) AS month, COUNT(*) AS active_days\nFROM account_events\nGROUP BY account_id, DATE_TRUNC('month', occurred_at);",
              passedCount: 7,
              totalCount: 8,
              score: sqlScore,
              results: {
                summary: "7 of 8 retained judge cases passed",
                failedCase: "Accounts with duplicate same-day events require COUNT(DISTINCT occurred_at::date).",
              },
              submittedAt: now,
              task: {
                title: "Monthly account retention",
                difficulty: "medium",
                description:
                  "Aggregate active account days by month without double-counting duplicate daily events.",
              },
            },
          ],
        },
      },
      interview: {
        latest: {
          source: "placement_readiness",
          id: `${registration.userId}-placement-artifact`,
          sessionId: `${registration.userId}-placement-session`,
          schemaVersion: "placement.report.v1",
          reportHash: "local-preview-placement-report",
          score: antigravityScore,
          receivedAt: now,
          handoffStatus: "completed",
          report: {
            scorecard: {
              overallScore: antigravityScore,
              readinessBand: strong ? "developing" : "interview ready",
              reasoningSummary:
                "The candidate communicated implementation choices clearly and used concrete project evidence, while crash-recovery depth remains the most valuable follow-up area.",
              dimensionScores: {
                communication: 82,
                technicalDepth: 72,
                projectOwnership: 76,
                pressureHandling: 79,
              },
            },
            readinessVerdict: {
              summary:
                "Ready for a focused employer panel, with one reliability-design probe recommended before a final decision.",
            },
            validationSummary: { validationPassed: true },
            strongestConvertingSignals: [
              "Explains implementation choices with specific project examples.",
              "Acknowledges uncertainty without inventing production evidence.",
            ],
            avoidableRejectionRisks: [
              "Crash recovery after a write-before-ack failure needs a concrete mechanism.",
            ],
            deliveryRead: {
              summary: "Answers were structured and concise.",
              pressureHandlingSignal:
                "The candidate maintained clear boundaries when challenged.",
            },
            projectOwnershipRead: {
              summary: "Ownership claims were tied to implementation decisions.",
              authenticitySignal:
                "Examples included trade-offs and failure boundaries rather than broad claims.",
            },
            questionReviews: [
              {
                slotId: "reliability-1",
                slotLabel: "Reliability ownership",
                answerBand: "partial",
                questionText:
                  "How would you make event delivery idempotent across a process crash?",
                answerSummary:
                  "Used an idempotency ledger but did not fully bind the write and acknowledgement transaction.",
                whatWasGood: ["Identified idempotency keys and conflict detection."],
                strongerAnswerWouldInclude: [
                  "Persist result and acknowledgement state in one durable transaction.",
                ],
              },
            ],
            sevenDayPlan: [
              "Practice one write-before-ack recovery design and explain its invariants.",
            ],
            thirtyDayPlan: [
              "Build and test a durable outbox with retries, deduplication, and operator alerts.",
            ],
          },
        },
        status: "completed",
        lastError: null,
      },
      antigravity: {
        latest: {
          id: `${registration.userId}-ag-report`,
          antigravitySessionId: `local_${registration.userId}_session`,
          schemaVersion: "final_report_v2",
          overallScore: strong ? 6.0 : 7.4,
          hireRecommendation: strong ? "MAYBE" : "HIRE WITH FOLLOW-UP",
          confidenceScore: strong ? 0.6 : 0.78,
          report: {
            preview_replay_case_id:
              "export_ced237fe-624e-401f-b55a-8404ae1ae6a3_ced237fe-624e-401f-b55a-8404ae1ae6a3",
            recruiter_summary: strong
              ? "The candidate communicates high-level system-design trade-offs, while implementation knowledge and failure handling remain shallow in the retained interview evidence. Coverage was moderate; use the unresolved crash-recovery and tenant-isolation probes to collect the missing evidence."
              : "Arjun showed solid implementation fundamentals and honest boundaries. A targeted follow-up on distributed failure recovery would reduce the remaining uncertainty.",
            strengths: strong
              ? [
                  "Communicates high-level system-design trade-offs",
                  "Adapts answers under pressure",
                  "Identifies common scalability levers",
                ]
              : [
                  "Good implementation fundamentals",
                  "Honest uncertainty handling",
                  "Clear communication",
                ],
            risk_flags: strong
              ? [
                  "Idempotency lacks a crash-recovery mechanism",
                  "Tenant isolation lacks implementation-specific proof",
                ]
              : [
                  "Distributed crash-recovery depth remains partially tested",
                  "Limited evidence for multi-region operation",
                ],
            scores: strong
              ? {
                  technical_depth: 5.0,
                  reasoning_structure: 7.0,
                  production_awareness: 6.0,
                  communication: 7.0,
                  adaptability: 8.0,
                }
              : {
                  technical_depth: 7.2,
                  reasoning_structure: 7.8,
                  production_awareness: 6.8,
                  communication: 8.1,
                },
            coverage_portrait: {
              coverage_score: strong ? 0.6 : 0.72,
              coverage_confidence: strong ? 0.6 : 0.79,
              primary_domain: {
                voluntary_coverage: strong
                  ? [
                      "High-level design trade-offs",
                      "Common scalability levers",
                    ]
                  : ["Implementation fundamentals", "Communication"],
                recovered_coverage: ["Product tradeoffs"],
                missed_coverage: strong
                  ? ["Crash recovery", "Concrete tenant isolation"]
                  : ["Multi-region recovery"],
                incorrect_coverage: [],
              },
            },
            claim_findings: [
              {
                claim: "Owned production reliability improvements",
                status: strong ? "partial" : "partial",
                interpretation: strong
                  ? "High-level concepts were credible, but crash-recovery and tenant-isolation mechanisms were not concretely demonstrated."
                  : "Implementation contribution was credible; end-to-end operational ownership remained shared.",
              },
            ],
            recommended_followups: strong
              ? [
                  "Design idempotency across write-before-ack process death.",
                  "Show concrete tenant-isolation enforcement and tests.",
                ]
              : [
                  "Probe crash recovery after a write-before-ack failure.",
                  "Validate multi-region operational ownership.",
                ],
          },
          evidencePacket: {
            schema_version: "final_evidence_packet_v2",
            evidence_turns: 16,
          },
          telemetrySummary: { total_events: strong ? 184 : 161 },
          transcript: Array.from({ length: strong ? 16 : 14 }, (_, index) => ({
            turn: index + 1,
          })),
          receivedAt: now,
          interview: {
            id: `${registration.userId}-interview-record`,
            jobRole: candidate.jobSeekerProfile?.targetJobTitle,
            totalScore: strong ? 60 : 74,
            badgeLevel: strong ? "developing" : "verified",
            finalVerdict: strong ? "MAYBE" : "HIRE WITH FOLLOW-UP",
            completedAt: now,
          },
          _count: { telemetryEvents: strong ? 184 : 161 },
        },
        history: [],
      },
    },
  };
}

export const preview = {
  registrations,
  dossiers: Object.fromEntries(
    registrations.map((registration, index) => [
      registration.userId,
      dossierFor(registration, index * 12),
    ]),
  ),
};

const rounds = [
  {
    icon: BrainCircuit,
    name: "Aptitude round",
    detail: "30 questions · 30 minutes",
    state: "Unlocked",
  },
  {
    icon: Code2,
    name: "Coding round",
    detail: "2 coding tasks · 60 minutes",
    state: "Unlocked",
  },
  {
    icon: Database,
    name: "SQL round",
    detail: "2 query tasks · 45 minutes",
    state: "Unlocked",
  },
  {
    icon: RadioTower,
    name: "AI interview",
    detail: "Adaptive voice interview · feedback within five minutes",
    state: "Unlocked",
  },
];

export default function WorkspaceLocalPreviewPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                Design preview
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Review the assessment, candidate list, and report experience
                using representative data. No production records are changed.
              </p>
            </div>
          </div>
        </div>

        <header className="rounded-xl border bg-background p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Assessment overview
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Backend Engineering Hiring Sprint
              </h1>
              <p className="mt-2 text-muted-foreground">
                ProvenHire · LOCAL-DEMO · 4 rounds
              </p>
            </div>
            <Badge className="bg-emerald-600">All rounds open</Badge>
          </div>
        </header>

        <section
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Assessment rounds"
        >
          {rounds.map(({ icon: Icon, name, detail, state }) => (
            <Card key={name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <Badge
                    variant="outline"
                    className="border-emerald-300 text-emerald-700"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {state}
                  </Badge>
                </div>
                <CardTitle className="pt-3 text-lg">{name}</CardTitle>
                <CardDescription>{detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Scores and feedback appear in each candidate's results.
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <WorkspaceRegistrationsTable
          workspaceId={workspaceId}
          readonly
          preview={preview}
        />
      </div>
    </main>
  );
}
