import type { ExperienceTier } from "../utils/experienceTier.js";
import type { NonTechSubtrack } from "../constants/verificationPipeline.js";

type PromptTier = "fresher" | "mid" | "senior";

function tierKey(t: ExperienceTier): PromptTier {
  return t;
}

const POOLS: Record<NonTechSubtrack, Record<PromptTier, string[]>> = {
  product: {
    fresher: [
      "You are a PM at a food delivery app. Your DAU has dropped 15% over the last 2 weeks. Write a structured plan for how you would investigate the root cause, what hypotheses you would form, and what immediate actions you would take. Be specific about the data you would look at.",
      "Your team shipped a redesign of the home screen aimed at increasing searches, but activation dropped slightly. Write how you would triage (instrumentation, cohorts, qualitative feedback), what decision framework you would use for rollback vs iterate, and how you would communicate to execs.",
    ],
    mid: [
      "You are the PM for a marketplace product with 2 million monthly active buyers. Engineering capacity is limited to 3 squads for the next quarter. You have been given 12 feature requests from sales, 5 from customer success, and 8 from your own product research. Describe how you would prioritize, what frameworks you would use, how you would communicate decisions to stakeholders, and what your north star metric is.",
      "A key enterprise customer demands a custom workflow that could fork your roadmap for a year. Write how you evaluate build-vs-partner, what discovery you would run with their team, and how you negotiate internally with sales and engineering.",
    ],
    senior: [
      "You are joining as Head of Product at a Series B fintech company. The product has strong PMF in Tier 1 cities but has failed twice to expand to Tier 2. Engineering is 25 people, and the CEO wants to see a 3x growth plan in 12 months. Write your 90-day plan: what you would learn, what you would change, how you would structure the product org, and how you would handle the expansion problem.",
    ],
  },
  business: {
    fresher: [
      "A retail company has seen a 20% increase in cart abandonment over the last month. Write a structured analysis of the possible causes, how you would quantify the impact, and what you would recommend to the product and engineering team.",
      "Monthly active vendors on a B2B platform plateaued while signups grew. Outline segmentation, metrics, hypotheses (supply vs demand vs activation), and a 30-day analytics plan.",
    ],
    mid: [
      "A logistics company's last-mile delivery costs have increased 30% YoY despite volume remaining flat. You have access to delivery logs, driver data, fuel costs, and customer complaint data. Write a complete analysis framework: what you would investigate first, what hypotheses you would test, what the likely root causes are, and what you would recommend.",
      "Two dashboards show different 'active customer' counts for the same quarter. Describe your reconciliation checklist, who you involve, and how you prevent recurrence.",
    ],
    senior: [
      "As CFO delegate / Finance leader at a high-growth SaaS, you discover reported churn conflicts with billing data. Outline how you would resolve definitions, align sales/finance/customer success, what board-ready narrative you would produce, and what guardrails you would add for future reporting.",
    ],
  },
  design: {
    fresher: [
      "You are designing the onboarding flow for a B2B SaaS tool used by operations teams. Describe your design process from discovery to final screens. What research methods would you use? What principles would guide your decisions? What would the key screens look like?",
      "Redesign the checkout for a subscription product with high drop-off at payment. Explain research, information architecture, accessibility checks, and validation plan.",
    ],
    mid: [
      "A product leader wants to add many advanced features to a mobile app that struggling first-time users already find overwhelming. Describe how you would push back with evidence, what UX outcomes you would propose, and how you would negotiate a phased release with PM and engineering.",
      "Engineering says your preferred interaction is technically infeasible on legacy mobile clients. Describe how you collaborate to find a solution, prototype alternatives, and communicate trade-offs to users.",
    ],
    senior: [
      "You lead design for a regulated enterprise product where legal and security constrain the UX. Describe how you would still deliver clarity and efficiency, how you partner with legal/engineering, and how you measure success despite constraints.",
    ],
  },
  operations: {
    fresher: [
      "Your team needs to migrate customer data from an old CRM to a new one within 6 weeks. There are 3 engineers available, a tight deadline, and incomplete documentation of the old system. Write a project plan including how you would handle risks, stakeholder communication, and success metrics.",
      "A recurring operational report takes 12 person-hours weekly and is often late. Describe how you would analyze the process, automate or streamline, and measure quality improvements.",
    ],
    mid: [
      "Two departments use conflicting workflows for the same customer handoff, causing SLA misses. Write how you would map current state, run workshops, pick a target process, and roll out with training and metrics.",
    ],
    senior: [
      "Halfway through a company-wide transformation, adoption stalls and executives disagree on priorities. Describe how you would reset governance, realign OKRs, and recover momentum without burning out teams.",
      "You inherit a program with no risk register and frequent firefighting. Describe how you introduce portfolio visibility, escalation paths, and cadence changes in 60 days.",
    ],
  },
  marketing: {
    fresher: [
      "You are launching a new B2C mobile app targeting college students. Write a 3-month go-to-market strategy. Include channel selection with rationale, key metrics you would track, and how you would know if the launch was successful.",
      "Organic social traction is high but sign-ups are low. Write a diagnosis framework (creative, landing page, product, tracking), and next experiments with success criteria.",
    ],
    mid: [
      "Paid acquisition costs rose sharply while conversion flatlined. Outline diagnostic tests (creative, audience, landing, product), what data cuts you would insist on, and how you would decide to reallocate budget.",
    ],
    senior: [
      "The CEO wants aggressive growth but brand sentiment is worsening on social. Write how you would balance performance and brand health, what leading indicators you would track, and how you would brief leadership on trade-offs.",
      "You must cut marketing spend 25% next quarter without losing pipeline coverage. Outline scenario planning, channel mix, and how you communicate to sales.",
    ],
  },
  people: {
    fresher: [
      "You must hire 8 support specialists in 60 days in a new city. Describe sourcing channels, assessment design (including structured rubric), interviewer training, and how you would monitor fairness and candidate experience.",
      "A people partner investigates recurring complaints about one manager. Describe steps, stakeholders, documentation, and how you balance fairness and urgency.",
    ],
    mid: [
      "Engagement survey scores dropped in one engineering org after a reorg. Describe your investigation plan, conversations you would run with managers, and interventions with measurable follow-up in 90 days.",
    ],
    senior: [
      "During a downturn you must reduce contractor spend while protecting core culture. Outline principles, stakeholder sequencing, communications, and how you would measure impact on retention and eNPS.",
    ],
  },
};

function hashPick(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return mod > 0 ? Math.abs(h) % mod : 0;
}

/**
 * Deterministic variant from subtrack + experience tier + attempt count so retakes see a different prompt when the pool grows.
 */
export function pickNonTechAssignmentPrompt(params: {
  subtrack: NonTechSubtrack;
  experienceTier: ExperienceTier;
  attemptIndex: number;
}): string {
  const tk = tierKey(params.experienceTier);
  const pool = POOLS[params.subtrack]?.[tk] ?? POOLS.business[tk];
  const idx = hashPick(`${params.subtrack}:${tk}:${params.attemptIndex}`, pool.length);
  return pool[idx] ?? pool[0] ?? "";
}
