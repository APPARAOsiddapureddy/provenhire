import fs from "node:fs/promises";
import process from "node:process";

import {
  assertGroundedAssessmentReport,
  jsonSchemaFor,
  schemaFor,
  systemPrompt,
} from "../dist/src/services/assessmentReportAgent.service.js";

const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
if (!openRouterKey || !cerebrasKey) {
  throw new Error("OPENROUTER_API_KEY and CEREBRAS_API_KEY are required.");
}

const evidence = {
  candidate: { targetRole: "Senior Backend Engineer" },
  registration: { completedModules: ["aptitude", "dsa", "antigravity"] },
  deterministicSynthesis: {
    decisionStatus: "human_review_required",
    evidenceCompleteness: { aptitude: true, dsa: true, antigravity: true },
  },
  aptitude: {
    score: 91,
    correct: 27,
    incorrect: 2,
    skipped: 1,
    retainedQuestionCount: 30,
    weakestDomain: "Quantitative aptitude",
  },
  dsa: {
    score: 88,
    problemsPassed: 2,
    problemsTotal: 2,
    testCasesPassed: 21,
    testCasesTotal: 22,
    language: "TypeScript",
    problems: [
      {
        title: "Rate-limited event processor",
        status: "passed",
        score: 46,
        timeComplexity: "O(n log n)",
        approach: "Sort events, expire timestamps outside the rolling window, and maintain a bounded queue per key.",
        testCasesPassed: 11,
        testCasesTotal: 11,
        codeObservation: "The submitted implementation sorts input and stores active timestamps in a Map keyed by tenant.",
        followUpRead: "The candidate correctly identified sorting as the dominant cost and separated tenant queues.",
      },
      {
        title: "Idempotent delivery ledger",
        status: "partial",
        score: 42,
        timeComplexity: "O(n)",
        approach: "Map each idempotency key to its first payload hash and reject conflicting reuse.",
        testCasesPassed: 10,
        testCasesTotal: 11,
        codeObservation: "The submitted Map is process-local and does not survive process death.",
        followUpRead: "The candidate identified write-before-ack recovery only after prompting.",
      },
    ],
  },
  antigravity: {
    overallScore: 60,
    evidenceVerdict: "MAYBE",
    confidence: 0.6,
    coverageGate: { passed: true, coverageScore: 0.78 },
    verifiedStrengths: ["Explains bounded state and names failure conditions when prompted."],
    testedRisks: ["Durable crash recovery remained incomplete."],
    untestedDimensions: ["Multi-region consistency"],
  },
};

const allCandidates = [
  { id: "or-gpt-oss", provider: "openrouter", model: "openai/gpt-oss-120b", reasoning: { effort: "high", exclude: true } },
  { id: "or-gemma-4", provider: "openrouter", model: "google/gemma-4-31b-it", reasoning: { effort: "high", exclude: true } },
  { id: "or-gemini-2.5-flash", provider: "openrouter", model: "google/gemini-2.5-flash", reasoning: { effort: "high", exclude: true } },
  { id: "or-gemini-3-flash", provider: "openrouter", model: "google/gemini-3-flash-preview", reasoning: { effort: "high", exclude: true } },
  { id: "or-gemini-3.1-flash-lite", provider: "openrouter", model: "google/gemini-3.1-flash-lite", reasoning: { effort: "high", exclude: true } },
  { id: "cb-gpt-oss", provider: "cerebras", model: "gpt-oss-120b", reasoning_effort: "high" },
  { id: "cb-gemma-4", provider: "cerebras", model: "gemma-4-31b" },
];
const requestedCandidates = new Set((process.env.CALIBRATION_CANDIDATES || "").split(",").map((value) => value.trim()).filter(Boolean));
const candidates = requestedCandidates.size
  ? allCandidates.filter((candidate) => requestedCandidates.has(candidate.id))
  : allCandidates;

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    groundedness: { type: "integer", minimum: 1, maximum: 5 },
    decisionUsefulness: { type: "integer", minimum: 1, maximum: 5 },
    readability: { type: "integer", minimum: 1, maximum: 5 },
    nuance: { type: "integer", minimum: 1, maximum: 5 },
    unsupportedClaims: { type: "array", items: { type: "string" } },
    vagueOrSyntheticPhrases: { type: "array", items: { type: "string" } },
    strongestQuality: { type: "string" },
    largestProblem: { type: "string" },
    verdict: { type: "string", enum: ["reject", "usable_with_revision", "production_candidate"] },
  },
  required: ["groundedness", "decisionUsefulness", "readability", "nuance", "unsupportedClaims", "vagueOrSyntheticPhrases", "strongestQuality", "largestProblem", "verdict"],
};

function parseContent(body) {
  const content = body?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(body?.error?.message || "Empty model response");
  return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
}

async function completion(candidate, kind) {
  const started = performance.now();
  const openRouter = candidate.provider === "openrouter";
  const url = openRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.cerebras.ai/v1/chat/completions";
  const request = {
    model: candidate.model,
    messages: [
      { role: "system", content: systemPrompt(kind) },
      { role: "user", content: `Persisted evidence:\n${JSON.stringify(kind === "dsa" ? { candidate: evidence.candidate, registration: evidence.registration, deterministicSynthesis: evidence.deterministicSynthesis, dsa: evidence.dsa } : evidence)}` },
    ],
    temperature: 0,
    max_tokens: 10_000,
    response_format: { type: "json_schema", json_schema: { name: `${kind}_assessment_report`, strict: true, schema: jsonSchemaFor(kind) } },
  };
  if (openRouter) {
    request.provider = { require_parameters: true, data_collection: "deny" };
    request.reasoning = candidate.reasoning;
  } else if (candidate.reasoning_effort) {
    request.reasoning_effort = candidate.reasoning_effort;
    request.reasoning_format = "hidden";
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouter ? openRouterKey : cerebrasKey}`,
      "Content-Type": "application/json",
      ...(openRouter ? { "HTTP-Referer": "https://provenhire.in", "X-Title": "ProvenHire Report Calibration" } : {}),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `${candidate.model} returned ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`);
  const result = schemaFor(kind).parse(parseContent(body));
  const packet = kind === "dsa"
    ? { candidate: evidence.candidate, registration: evidence.registration, deterministicSynthesis: evidence.deterministicSynthesis, dsa: evidence.dsa }
    : evidence;
  let validationError = null;
  try {
    assertGroundedAssessmentReport(result, packet);
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error);
  }
  return { result, validationError, usage: body.usage ?? {}, latencyMs: Math.round(performance.now() - started) };
}

async function judge(kind, result) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cerebrasKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-oss-120b",
      reasoning_effort: "high",
      reasoning_format: "hidden",
      temperature: 0,
      max_tokens: 5000,
      response_format: { type: "json_schema", json_schema: { name: "report_quality_judgment", strict: true, schema: judgeSchema } },
      messages: [
        { role: "system", content: "Act as a strict assessment-product editor. Judge only the visible report, not hidden reasoning. Penalize unsupported inference, fake precision, vague AI prose, metric repetition without interpretation, and language that does not help a technical manager decide the next evidence-gathering action." },
        { role: "user", content: `Report kind: ${kind}\nPersisted evidence:\n${JSON.stringify(evidence)}\nReport:\n${JSON.stringify(result)}` },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Judge returned ${response.status}`);
  return { judgment: parseContent(body), usage: body.usage ?? {} };
}

const tasks = candidates.flatMap((candidate) => ["dsa", "unified"].map((kind) => ({ candidate, kind })));
const rows = [];
const artifact = `/tmp/provenhire_report_model_calibration_${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`;
async function persistArtifact() {
  const summary = rows.map((row) => ({
    candidate: row.candidate,
    provider: row.provider,
    model: row.model,
    kind: row.kind,
    status: row.status,
    latencyMs: row.latencyMs ?? null,
    totalTokens: row.usage?.total_tokens ?? row.usage?.totalTokens ?? null,
    cost: row.usage?.cost ?? null,
    judgment: row.judgment ?? null,
    validationError: row.validationError ?? null,
    error: row.error ?? null,
  }));
  await fs.writeFile(artifact, JSON.stringify({ generatedAt: new Date().toISOString(), evidence, summary, rows }, null, 2));
}
let nextTask = 0;
async function runWorker() {
  while (nextTask < tasks.length) {
    const { candidate, kind } = tasks[nextTask++];
    const row = { candidate: candidate.id, provider: candidate.provider, model: candidate.model, kind };
    try {
      Object.assign(row, await completion(candidate, kind));
      Object.assign(row, await judge(kind, row.result));
      row.status = row.validationError ? "failed_validation" : "passed";
    } catch (error) {
      row.status = "failed";
      row.error = error instanceof Error ? error.message : String(error);
    }
    rows.push(row);
    await persistArtifact();
    process.stdout.write(`${row.candidate} ${kind}: ${row.status}${row.judgment ? ` (${row.judgment.verdict})` : ""}\n`);
  }
}
await Promise.all([runWorker(), runWorker(), runWorker()]);
await persistArtifact();
process.stdout.write(`artifact=${artifact}\n`);
