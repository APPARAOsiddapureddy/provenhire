import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const geminiApiKey = process.env.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chatCompletion(messages: ChatMessage[], model = "gpt-4o-mini") {
  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
  });
  return response.choices[0]?.message?.content ?? "";
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
  "workExperience": [{"company":"","role":"","years":"","bullets":[]}]
}
Be concise. Extract all skills mentioned (tech, tools, soft). Infer experienceYears from work history. No markdown, no code blocks.`;

function normalizeParsed(parsed: Partial<ParsedResumeProfile>): ParsedResumeProfile {
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
  };
}

async function parseWithGemini(resumeText: string): Promise<ParsedResumeProfile | null> {
  if (!gemini) return null;
  const prompt = `${PARSE_RESUME_SYSTEM}\n\nResume text:\n${resumeText.slice(0, 30000)}`;
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });
  const content = (response as { text?: string })?.text ?? "";
  const raw = content.trim().replace(/^```\w*\n?|\n?```$/g, "").trim();
  let parsed: Partial<ParsedResumeProfile>;
  try {
    parsed = JSON.parse(raw) as Partial<ParsedResumeProfile>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
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
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const user = `Resume text:\n${resumeText.slice(0, 30000)}`;
    const content = await chatCompletion(
      [
        { role: "system", content: PARSE_RESUME_SYSTEM },
        { role: "user", content: user },
      ],
      "gpt-4o-mini"
    );
    const raw = content.trim().replace(/^```\w*\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(raw) as Partial<ParsedResumeProfile>;
    return normalizeParsed(parsed);
  } catch {
    return null;
  }
}

/** Parse resume: prefers Gemini (free tier) when GEMINI_API_KEY is set, else OpenAI */
export async function parseResumeForProfile(resumeText: string): Promise<ParsedResumeProfile | null> {
  if (!resumeText?.trim()) return null;
  let parsed = gemini ? await parseWithGemini(resumeText) : null;
  if (!parsed && process.env.OPENAI_API_KEY) parsed = await parseWithOpenAI(resumeText);
  return parsed;
}

export async function analyzeResume(resumeText: string) {
  const system = "You are a senior technical recruiter. Provide a concise resume assessment with score 0-100 and bullet feedback.";
  const user = `Resume:\n${resumeText}`;
  const content = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    "gpt-4o-mini"
  );
  return content;
}

export async function parseJobDescription(text: string) {
  const system = "Extract structured job info as JSON: {title, level, skills, location, salary_range, responsibilities, requirements}.";
  const content = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    "gpt-4o-mini"
  );
  return content;
}

export async function generateLearningResources(profile: string) {
  const system = "Provide a concise learning plan with resources and milestones.";
  const content = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: profile },
    ],
    "gpt-4o-mini"
  );
  return content;
}

async function llmChat(prompt: string, system: string): Promise<string> {
  if (gemini) {
    try {
      const fullPrompt = `${system}\n\n${prompt}`;
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: fullPrompt,
      });
      return (response as { text?: string })?.text ?? "";
    } catch {
      // fall through to OpenAI
    }
  }
  const content = await chatCompletion(
    [{ role: "system", content: system }, { role: "user", content: prompt }],
    "gpt-4o-mini"
  );
  return content;
}

export async function evaluateInterview(transcript: string): Promise<string> {
  const system = `You are a senior technical interviewer. Return STRICT JSON only:
{"technical_accuracy":0-10,"depth_of_knowledge":0-10,"problem_solving":0-10,"communication_clarity":0-10,"strengths":[],"weaknesses":[],"final_verdict":"","confidence_level":"Low|Medium|High"}`;
  try {
    return await llmChat(transcript, system);
  } catch (e) {
    console.error("[evaluateInterview]", e);
    return JSON.stringify({
      technical_accuracy: 5,
      depth_of_knowledge: 5,
      problem_solving: 5,
      communication_clarity: 5,
      strengths: ["Completed interview"],
      weaknesses: ["Evaluation unavailable"],
      final_verdict: "Interview completed. Evaluation service temporarily unavailable.",
      confidence_level: "Low",
    });
  }
}

export async function conductInterviewPrompt(role: string, questionPlan: string, lastAnswer: string | null): Promise<string> {
  const system = `You are a professional technical interviewer. Be encouraging and constructive.
- Ask one clear question at a time.
- If the answer is brief, ask a short follow-up to deepen the response.
- Maintain a warm, professional tone.
- No emojis. Be concise.`;
  const prompt = `Role: ${role}\nPlanned topics: ${questionPlan}\nCandidate answer: ${lastAnswer ?? "N/A"}\nRespond with the next question or a brief follow-up.`;
  try {
    return await llmChat(prompt, system);
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

/** Generate a professional take-home assignment for non-technical roles. Uses Gemini or OpenAI (no Lovable). */
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
    return await llmChat(userPrompt, system);
  } catch (e) {
    console.error("[generateJobAssignment]", e);
    throw new Error("Failed to generate assignment. Please try again.");
  }
}
