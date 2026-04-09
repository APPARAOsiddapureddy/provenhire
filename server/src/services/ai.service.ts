import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const openaiForResume = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
/** Chat Completions model for resume JSON extraction (requires billing on platform.openai.com). */
const RESUME_PARSER_MODEL = process.env.RESUME_PARSER_MODEL?.trim() || "gpt-4o-mini";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function geminiChat(messages: ChatMessage[]): Promise<string> {
  if (!gemini) throw new Error("GEMINI_API_KEY required for AI features");
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const fullPrompt = system ? `${system}\n\n${user}` : user;
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: fullPrompt,
    config: { temperature: 0.2 },
  });
  return (response as { text?: string })?.text ?? "";
}

/** Structured JSON from Gemini; returns null if API unavailable or parse fails. */
export async function runGeminiJson<T>(system: string, user: string): Promise<T | null> {
  if (!gemini) return null;
  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${system}\n\n${user}`,
      config: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const raw = ((response as { text?: string })?.text ?? "")
      .trim()
      .replace(/^```\w*\n?|\n?```$/g, "")
      .trim();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn("[runGeminiJson]", e);
    return null;
  }
}

/** Structured profile fields extracted from resume for auto-fill */
export type ParsedResumeProfile = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  about: string;
  currentRole: string;
  experienceYears: number;
  skills: string[];
  college: string;
  graduationYear: string;
  education: Array<{ institution: string; degree: string; year: string }>;
  workExperience: Array<{ company: string; role: string; years: string; bullets?: string[] }>;
  /** AI-suggested track: technical (eng/coding) vs non_technical (business, ops, etc.) */
  suggestedTrack?: "technical" | "non_technical";
};

const PARSE_RESUME_SYSTEM = `You extract structured profile data from resumes for job seeker onboarding. Return ONLY valid JSON with these exact keys (use empty string or 0 for missing):
{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "about": "2-4 sentence professional summary from experience",
  "currentRole": "most recent job title",
  "experienceYears": number (total years, integer),
  "skills": ["skill1", "skill2"],
  "college": "most recent institution name",
  "graduationYear": "YYYY or YYYY-YYYY",
  "education": [{"institution":"","degree":"","year":""}],
  "workExperience": [{"company":"","role":"","years":"","bullets":[]}],
  "suggestedTrack": "technical" or "non_technical"
}
Rules for suggestedTrack: Use "technical" for software/engineering/developer roles, programming skills (Python, Java, React, etc.), IT, data engineering, DevOps. Use "non_technical" for business, operations, marketing, HR, sales, customer support, content, design (non-coding), admin, finance, non-engineering. Be concise. Extract all skills. Infer experienceYears from work history. No markdown, no code blocks.`;

function normalizeParsed(parsed: Partial<ParsedResumeProfile>): ParsedResumeProfile {
  const track = parsed.suggestedTrack === "non_technical" ? "non_technical" : "technical";
  return {
    fullName: String(parsed.fullName ?? ""),
    email: String(parsed.email ?? ""),
    phone: String(parsed.phone ?? ""),
    location: String(parsed.location ?? ""),
    about: String(parsed.about ?? ""),
    currentRole: String(parsed.currentRole ?? ""),
    experienceYears: Number(parsed.experienceYears) || 0,
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
    college: String(parsed.college ?? ""),
    graduationYear: String(parsed.graduationYear ?? ""),
    education: Array.isArray(parsed.education) ? parsed.education : [],
    workExperience: Array.isArray(parsed.workExperience) ? parsed.workExperience : [],
    suggestedTrack: track,
  };
}

async function parseWithGemini(resumeText: string): Promise<ParsedResumeProfile | null> {
  if (!gemini) return null;
  try {
    const prompt = `${PARSE_RESUME_SYSTEM}\n\nResume text:\n${resumeText.slice(0, 30000)}`;
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const content = (response as { text?: string })?.text ?? "";
    return parseJsonToProfile(content);
  } catch (e) {
    console.warn("[parseWithGemini]", e);
    return null;
  }
}

function parseJsonToProfile(raw: string): ParsedResumeProfile | null {
  const cleaned = raw.trim().replace(/^```\w*\n?|\n?```$/g, "").trim();
  let parsed: Partial<ParsedResumeProfile>;
  try {
    parsed = JSON.parse(cleaned) as Partial<ParsedResumeProfile>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]) as Partial<ParsedResumeProfile>;
    } catch {
      return null;
    }
  }
  return normalizeParsed(parsed);
}

async function parseWithOpenAI(resumeText: string): Promise<ParsedResumeProfile | null> {
  if (!openaiForResume) return null;
  try {
    const completion = await openaiForResume.chat.completions.create({
      model: RESUME_PARSER_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PARSE_RESUME_SYSTEM },
        { role: "user", content: `Resume text:\n${resumeText.slice(0, 30000)}` },
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!content) return null;
    return parseJsonToProfile(content);
  } catch (e) {
    console.warn("[parseWithOpenAI]", e);
    return null;
  }
}

/**
 * Structured resume → profile for onboarding.
 * - `RESUME_PARSER_PROVIDER=openai` | `gemini` | `auto` (default **auto**).
 * - **auto**: OpenAI first if `OPENAI_API_KEY` is set, else Gemini if `GEMINI_API_KEY` is set; OpenAI failures fall back to Gemini when available.
 */
export async function parseResumeForProfile(resumeText: string): Promise<ParsedResumeProfile | null> {
  if (!resumeText?.trim()) return null;
  const provider = (process.env.RESUME_PARSER_PROVIDER || "auto").toLowerCase();

  if (provider === "gemini") {
    return gemini ? await parseWithGemini(resumeText) : null;
  }
  if (provider === "openai") {
    return openaiForResume ? await parseWithOpenAI(resumeText) : null;
  }

  if (openaiForResume) {
    const fromOa = await parseWithOpenAI(resumeText);
    if (fromOa) return fromOa;
    if (gemini) {
      console.warn("[parseResumeForProfile] OpenAI failed or returned null; falling back to Gemini");
      return await parseWithGemini(resumeText);
    }
    return null;
  }

  return gemini ? await parseWithGemini(resumeText) : null;
}

export async function analyzeResume(resumeText: string) {
  const system = "You are a senior technical recruiter. Provide a concise resume assessment with score 0-100 and bullet feedback.";
  const user = `Resume:\n${resumeText}`;
  return geminiChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ]
  );
}

export async function parseJobDescription(text: string) {
  const system = "Extract structured job info as JSON: {title, level, skills, location, salary_range, responsibilities, requirements}.";
  return geminiChat(
    [
      { role: "system", content: system },
      { role: "user", content: text },
    ]
  );
}

export async function generateLearningResources(profile: string) {
  const system = "Provide a concise learning plan with resources and milestones.";
  return geminiChat(
    [
      { role: "system", content: system },
      { role: "user", content: profile },
    ]
  );
}

export type QuestionAnswerPair = { question: string; keyPoints: string[]; answer: string };

export type EvaluateInterviewOptions = {
  experienceLevel?: string;
  jobRole?: string;
};

const CANONICAL_EVALUATION_FALLBACK = {
  technical_accuracy: 5,
  depth_of_knowledge: 5,
  problem_solving: 5,
  communication_clarity: 5,
  concept_score: 50,
  reasoning_score: 50,
  communication_score: 50,
  confidence_score: 50,
  strengths: ["Evaluation unavailable — interview flagged for manual review."],
  weaknesses: ["Evaluation unavailable — interview flagged for manual review."],
  final_verdict: "PENDING_MANUAL_REVIEW",
  confidence_level: "Low",
  fallback_triggered: true,
  fallback_reason: "gemini_error",
  per_question_scores: [] as unknown[],
  authenticity_concern: false,
  authenticity_reason: "",
};

function experienceCalibrationBlock(level: string | undefined): string {
  const l = (level || "mid").toLowerCase();
  if (l === "junior") {
    return `EXPERIENCE CALIBRATION (junior): Evaluate for foundational understanding, clear communication, and willingness to learn. Score 70+ for correct core concepts even if depth is limited. Do not penalize missing advanced edge cases.`;
  }
  if (l === "senior") {
    return `EXPERIENCE CALIBRATION (senior): Evaluate for depth, systems thinking, trade-off articulation, and mentoring signal. Score 70+ only if the candidate demonstrates ownership and architectural awareness. Penalize surface-level answers.`;
  }
  return `EXPERIENCE CALIBRATION (mid): Evaluate for solid practical application and trade-off reasoning. Expect familiarity with tooling and common patterns. Score 70+ for correct application with reasonable trade-off awareness.`;
}

export function canonicalEvaluationFallbackJson(reason: string): string {
  return JSON.stringify({ ...CANONICAL_EVALUATION_FALLBACK, fallback_reason: reason });
}

/** Strip markdown fences and parse evaluation JSON; returns null on failure. */
export function parseInterviewEvaluationJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/**
 * Evaluate interview answers against expected key points. For each Q&A, scores how well
 * the candidate's answer matches the ideal answer criteria (keyPoints). Marks are given
 * based on alignment with the main question's expected answer.
 */
export async function evaluateInterview(
  transcript: string,
  questionAnswerPairs?: QuestionAnswerPair[],
  options?: EvaluateInterviewOptions,
): Promise<string> {
  const rubric = questionAnswerPairs?.length
    ? `
SCORING RUBRIC (answer-based marks):
For each question, the candidate's answer must be compared against the KEY POINTS (ideal answer criteria).
- Per question: score_conceptual, score_reasoning, score_communication (each 0-100), rationale (1-2 sentences), key_points_hit, key_points_missed (string arrays).

QUESTION-ANSWER PAIRS WITH KEY POINTS:
${questionAnswerPairs
  .map(
    (p, i) =>
      `Q${i + 1} (question_index ${i}): ${p.question}
Key points (ideal answer should cover): ${p.keyPoints.join("; ")}
Candidate answer: ${p.answer}
---`
  )
  .join("\n")}

Then compute aggregate technical_accuracy, depth_of_knowledge, problem_solving, communication_clarity (0-10 each),
and concept_score, reasoning_score, communication_score, confidence_score (0-100 each) as interview-level summaries.
Also include per_question_scores: one object per question with question_index matching the Q index (0-based).`
    : `
Scoring rubric:
- concept_score reflects conceptual knowledge and technical understanding.
- reasoning_score reflects structured thinking and problem decomposition.
- communication_score reflects clarity, coherence, and articulation.
- confidence_score reflects answer structure and confidence under questioning.`;

  const authenticityBlock = `
AUTHENTICITY: Also assess answer authenticity. Flag if: (1) answers appear AI-generated (overly structured, formulaic intros like "Great question"), (2) answers share identical structure across questions, or (3) content is clearly off-topic.
Return "authenticity_concern": true/false and "authenticity_reason": brief string if true.`;

  const system = `You are a senior technical interviewer. Return STRICT JSON only (no markdown):
{
  "technical_accuracy": <0-10 number>,
  "depth_of_knowledge": <0-10>,
  "problem_solving": <0-10>,
  "communication_clarity": <0-10>,
  "concept_score": <0-100>,
  "communication_score": <0-100>,
  "reasoning_score": <0-100>,
  "confidence_score": <0-100>,
  "strengths": [<string>],
  "weaknesses": [<string>],
  "final_verdict": <string, max 3 sentences for candidate display>,
  "confidence_level": "Low"|"Medium"|"High",
  "authenticity_concern": <boolean>,
  "authenticity_reason": <string, empty if not concerned>,
  "per_question_scores": [
    {
      "question_index": <0-based int>,
      "score_conceptual": <0-100>,
      "score_reasoning": <0-100>,
      "score_communication": <0-100>,
      "rationale": <string>,
      "key_points_hit": [<string>],
      "key_points_missed": [<string>]
    }
  ]
}
${experienceCalibrationBlock(options?.experienceLevel)}
Role context: ${options?.jobRole || "Technical candidate"}
${rubric}
${authenticityBlock}`;

  const fullPrompt = `${system}\n\nTranscript:\n${transcript}`;

  try {
    if (!gemini) throw new Error("GEMINI_API_KEY required for AI features");
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: { temperature: 0.2, responseMimeType: "application/json" },
    });
    const text = (response as { text?: string })?.text ?? "";
    if (!text.trim()) throw new Error("empty_model_response");
    return text;
  } catch (e) {
    console.error("[evaluateInterview]", e);
    const msg = e instanceof Error ? e.message : "gemini_error";
    return canonicalEvaluationFallbackJson(msg);
  }
}

export async function conductInterviewPrompt(role: string, questionPlan: string, lastAnswer: string | null): Promise<string> {
  const system = `You are a professional technical interviewer. Be constructive and direct.
- Ask one clear line of inquiry at a time, in 2–4 sentences: brief setup so the candidate knows the angle, then one specific question (one main question mark).
- If the answer is thin, ask a medium-length follow-up that deepens the response — not a one-word prompt.
- Maintain a professional tone. No emojis. No thanks or praise openers — get to the question.
- Do not write multiple unrelated questions in one message.`;
  const prompt = `Role: ${role}\nPlanned topics: ${questionPlan}\nCandidate answer: ${lastAnswer ?? "N/A"}\nRespond with only the next question or follow-up (2–4 sentences).`;
  try {
    return await geminiChat([{ role: "system", content: system }, { role: "user", content: prompt }]);
  } catch (e) {
    console.error("[conductInterviewPrompt]", e);
    const fallbacks = [
      "Can you describe a project where you solved a challenging technical problem?",
      "How do you approach learning a new technology or framework?",
      "Tell me about a time you had to work with a difficult teammate or stakeholder.",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

/** Params for non-technical job assignment generation (AssignmentAI flow) */
export interface GenerateAssignmentParams {
  companyName: string;
  companyContext?: string;
  industry?: string;
  jobRole: string;
  jobDescription?: string;
  roleCategory?: string;
  experienceYears?: number;
  additionalContext?: string;
}

function mapExperienceLevel(years: number): string {
  if (years <= 2) return "Entry Level (0-2 years)";
  if (years <= 5) return "Mid Level (2-5 years)";
  if (years <= 8) return "Senior (5-8 years)";
  return "Lead/Principal (8+ years)";
}

/** Generate a professional take-home assignment for non-technical roles. Uses Gemini. */
export async function generateJobAssignment(params: GenerateAssignmentParams): Promise<string> {
  const {
    companyName,
    companyContext,
    industry,
    jobRole,
    jobDescription,
    roleCategory,
    experienceYears = 3,
    additionalContext,
  } = params;

  const experienceLevel = mapExperienceLevel(experienceYears);
  const industryOrCategory = industry || roleCategory || "General Business";

  const system = `You are an elite talent acquisition specialist with 15+ years of experience designing take-home assignments for non-technical roles.

Your expertise:
- Designing realistic, fair take-home assignments
- Creating unbiased assessments that reflect real job scenarios
- Balancing depth of assessment with candidate time investment

Design principles:
- Use realistic context (actual business challenges the company might face)
- Provide clear structure with explicit success criteria
- Focus on strategic thinking, communication, and problem-solving (not coding)
- Ensure assignments are fair and accessible
- Make evaluation criteria transparent

OUTPUT FORMAT: Return a single Markdown document. Do NOT wrap in code blocks.`;

  const userPrompt = `# Assignment Generation Request

## COMPANY CONTEXT
- Company Name: ${companyName}
- Industry/Role Category: ${industryOrCategory}
${companyContext ? `- About the Company: ${companyContext}` : ""}

## ROLE DETAILS
- Position: ${jobRole}
- Role Type: Non-Technical
- Experience Level: ${experienceLevel}
${jobDescription ? `- Job Description: ${jobDescription}` : ""}
${additionalContext ? `- Special Requirements: ${additionalContext}` : ""}

## GENERATE A COMPLETE ASSIGNMENT WITH THESE SECTIONS (in Markdown):
1. **Assignment Title** - Clear, role-specific
2. **Introduction & Purpose** - Brief context for the candidate
3. **Company Scenario** - Realistic scenario based on ${companyName}
4. **Assignment Tasks** - 2-4 concrete tasks appropriate for this role
5. **Resources Provided** - What the candidate will receive (e.g. data, documents)
6. **Submission Requirements** - Format, length, file types
7. **Time Allocation** - Suggested time (Entry: 2-3h, Mid: 3-4h, Senior/Lead: 4-6h)
8. **Evaluation Criteria** - How responses will be assessed
9. **Tips for Success** - Helpful guidance for candidates

Focus on non-technical skills: strategic analysis, stakeholder communication, process improvement, market research, and problem-solving. Keep the tone professional and the tasks achievable within the suggested time.`;

  try {
    return await geminiChat([{ role: "system", content: system }, { role: "user", content: userPrompt }]);
  } catch (e) {
    console.error("[generateJobAssignment]", e);
    throw new Error("Failed to generate assignment. Please try again.");
  }
}

export interface NonTechnicalAssignmentEvaluation {
  score: number;
  qualified: boolean;
  threshold: number;
  summary: string;
  strengths: string[];
  gaps: string[];
}

/**
 * Evaluate non-technical assignment answers (role assignment gate). Score 0–100.
 * Rubric: structure 25%, domain knowledge 30%, problem analysis 25%, actionability 20%.
 */
export async function evaluateNonTechnicalAssignment(params: {
  targetJobTitle?: string;
  subtrack?: string;
  prompt: string;
  response: string;
  threshold?: number;
}): Promise<NonTechnicalAssignmentEvaluation> {
  const threshold = Math.max(0, Math.min(100, params.threshold ?? 60));
  /** Extracted PDF/DOCX can be long; cap prompt size for the model. */
  const trimmedResponse = (params.response || "").trim().slice(0, 120_000);
  if (!trimmedResponse) {
    return {
      score: 0,
      qualified: false,
      threshold,
      summary: "No response submitted.",
      strengths: [],
      gaps: ["Response is empty"],
    };
  }

  // Fallback deterministic heuristic when Gemini is unavailable.
  if (!gemini) {
    const wordCount = trimmedResponse.split(/\s+/).filter(Boolean).length;
    const score = Math.max(0, Math.min(100, Math.round((wordCount / 350) * 100)));
    return {
      score,
      qualified: score >= threshold,
      threshold,
      summary: "AI evaluator unavailable; fallback rubric used based on response completeness.",
      strengths: score >= threshold ? ["Response has sufficient detail and structure"] : [],
      gaps: score < threshold ? ["Add more concrete examples and role-specific depth"] : [],
    };
  }

  const sub = params.subtrack ? `Subtrack: ${params.subtrack}\n` : "";
  const system = `You are an expert evaluator for non-technical hiring (PM, design, ops, marketing, people, business).
Score the written assignment 0-100 using this rubric (weights must guide the final score):
- Structure (25%): clear organization, logical flow, appropriate sections.
- Domain knowledge (30%): correct use of role-specific frameworks, terminology, concepts for the subtrack.
- Problem analysis (25%): identifies the right problem, sound hypotheses, sound reasoning.
- Actionability (20%): specific, realistic recommendations — not vague generalities.

Return ONLY strict JSON with keys:
{
  "score": number (0-100),
  "summary": "short paragraph",
  "strengths": ["..."],
  "gaps": ["..."]
}
Rules:
- Do not penalize writing style or grammar unless it obscures meaning. Judge quality of thinking.
- Be fair and strict. Do not inflate scores.
- No markdown, no extra text.`;

  const user = `Target role: ${params.targetJobTitle || "Non-technical role"}
${sub}
Assignment prompt:
${params.prompt}

Candidate response:
${trimmedResponse}`;

  try {
    const raw = await geminiChat([{ role: "system", content: system }, { role: "user", content: user }]);
    const clean = raw.trim().replace(/^```json\n?|```$/g, "").trim();
    const parsed = JSON.parse(clean) as {
      score?: number;
      summary?: string;
      strengths?: string[];
      gaps?: string[];
    };
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score ?? 0))));
    return {
      score,
      qualified: score >= threshold,
      threshold,
      summary: String(parsed.summary ?? ""),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
    };
  } catch (e) {
    console.error("[evaluateNonTechnicalAssignment]", e);
    const wordCount = trimmedResponse.split(/\s+/).filter(Boolean).length;
    const score = Math.max(0, Math.min(100, Math.round((wordCount / 350) * 100)));
    return {
      score,
      qualified: score >= threshold,
      threshold,
      summary: "Evaluation service was unstable; fallback rubric used.",
      strengths: score >= threshold ? ["Response appears reasonably complete"] : [],
      gaps: score < threshold ? ["Provide stronger structure and examples"] : [],
    };
  }
}
