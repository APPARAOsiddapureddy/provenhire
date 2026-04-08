/**
 * SEO landing page definitions — 5-layer architecture: core, feature, use-case, resources, programmatic.
 * Each entry maps to a route in App.tsx via SeoMarketingPage.
 */

export type SeoBlock =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export interface SeoPageDef {
  path: string;
  title: string;
  description: string;
  h1: string;
  heroSub: string;
  blocks: SeoBlock[];
  related?: { label: string; to: string }[];
}

const rel = (pairs: [string, string][]): { label: string; to: string }[] =>
  pairs.map(([label, to]) => ({ label, to }));

export const SEO_LANDING_PAGES: SeoPageDef[] = [
  {
    path: "/for-job-seekers",
    title: "For Job Seekers | Get Hired by Proving Your Skills | ProvenHire",
    description:
      "Get hired without relying only on your resume. Prove your skills with aptitude, coding, and AI interviews on India's skill-based hiring platform.",
    h1: "For job seekers: get hired by proving your skills",
    heroSub:
      "Stand out with a Skill Passport—verified scores employers trust. Skill-based hiring starts with evidence, not buzzwords.",
    blocks: [
      {
        type: "p",
        text: "Traditional applications bury great candidates. ProvenHire lets you **get hired without a resume carrying all the weight**—you demonstrate ability through structured assessments and interviews.",
      },
      {
        type: "h2",
        text: "How it works for candidates",
      },
      {
        type: "ul",
        items: [
          "Complete profile setup and verify your identity.",
          "Aptitude + DSA rounds show reasoning and coding depth.",
          "AI expert interview captures communication and technical judgment.",
          "Optional human expert round for the highest certification tier.",
        ],
      },
      {
        type: "h2",
        text: "Why skill-first hiring helps you",
      },
      {
        type: "ul",
        items: [
          "Employers see verified performance—not only formatting.",
          "Merit-based hiring rewards practice and problem solving.",
          "Your progress is portable across roles on the platform.",
        ],
      },
    ],
    related: rel([
      ["Get hired without a resume", "/get-hired-without-resume"],
      ["Prove your skills", "/prove-your-skills"],
      ["No-resume hiring (for employers)", "/no-resume-hiring"],
      ["Skill-based hiring guide", "/skill-based-hiring"],
      ["Start verification", "/auth?mode=signup"],
    ]),
  },
  {
    path: "/get-hired-without-resume",
    title: "Get Hired Without a Resume | Skill Proof That Opens Doors | ProvenHire",
    description:
      "Learn how to get hired without resume overload: verify skills with assessments and interviews so recruiters review proof, not just PDFs.",
    h1: "Get hired without a resume as your only signal",
    heroSub:
      "Pair a concise profile with verified aptitude, coding, and interview scores—so hiring teams evaluate what you can do.",
    blocks: [
      {
        type: "p",
        text: "If you've asked **how to get a job without a resume that shines**, the answer is to add **objective proof**: timed tests, code quality, and structured interview outcomes.",
      },
      {
        type: "h2",
        text: "What recruiters see instead",
      },
      {
        type: "ul",
        items: [
          "Weighted scores across verification stages.",
          "Consistency checks between written and spoken technical depth.",
          "Clear pass/fail thresholds and Skill Passport levels.",
        ],
      },
    ],
    related: rel([
      ["For job seekers", "/for-job-seekers"],
      ["Prove your skills", "/prove-your-skills"],
      ["Hiring without resumes (employers)", "/hiring-without-resume"],
    ]),
  },
  {
    path: "/prove-your-skills",
    title: "Prove Your Skills to Employers | Verification Pipeline | ProvenHire",
    description:
      "Prove your coding and cognitive skills through proctored rounds. Merit-based hiring rewards demonstrated ability.",
    h1: "Prove your skills—don't just list them",
    heroSub:
      "Walk through aptitude, live coding, and AI interview stages built for technical and non-technical tracks.",
    blocks: [
      {
        type: "h2",
        text: "What “proof” means here",
      },
      {
        type: "ul",
        items: [
          "Aptitude: timed, weighted MCQs aligned to role difficulty.",
          "DSA: execution-backed submissions against hidden tests.",
          "AI interview: multi-sprint technical dialogue with anti-gaming signals.",
        ],
      },
    ],
    related: rel([
      ["Skill verification (product)", "/skill-verification"],
      ["Coding assessment platform", "/coding-assessment-platform"],
      ["For job seekers", "/for-job-seekers"],
    ]),
  },
  {
    path: "/for-recruiters",
    title: "For Recruiters | Hire Pre-Assessed Candidates | Technical Hiring Platform India | ProvenHire",
    description:
      "Technical hiring platform for India: hire pre-assessed candidates with coding verification, AI interviews, and Skill Passport levels.",
    h1: "Hire pre-assessed candidates on the technical hiring platform built for India",
    heroSub:
      "Reduce time-to-hire with a pipeline of candidates who already cleared structured verification—not guesswork from keyword resumes.",
    blocks: [
      {
        type: "h2",
        text: "Why teams use ProvenHire",
      },
      {
        type: "ul",
        items: [
          "Filter by certification tier, scores, and skills.",
          "Post jobs and manage applicants in one recruiter workspace.",
          "Trust signals from live coding and recorded interview quality.",
        ],
      },
      {
        type: "h2",
        text: "Built for fast, defensible hiring",
      },
      {
        type: "p",
        text: "Whether you need **hire developers India** searches to convert or internal SLAs on screening, pre-verified candidates cut first-round noise.",
      },
    ],
    related: rel([
      ["Hire developers", "/hire-developers"],
      ["Verified candidates", "/verified-candidates"],
      ["No-resume hiring", "/no-resume-hiring"],
      ["Post a job", "/auth?role=recruiter"],
    ]),
  },
  {
    path: "/hire-developers",
    title: "Hire Developers | Pre-Verified Engineering Talent | ProvenHire",
    description:
      "Hire developers faster with coding assessment outcomes and AI interviews already on file. Technical hiring without resume roulette.",
    h1: "Hire developers with proof already on file",
    heroSub: "Use verified DSA + interview scores to shortlist before the first call.",
    blocks: [
      { type: "h2", text: "Shortlist with data" },
      {
        type: "ul",
        items: [
          "Compare candidates on consistent rubrics.",
          "See official vs practice submission integrity.",
          "Match minimum certification to role seniority.",
        ],
      },
    ],
    related: rel([
      ["Hire software developers", "/hire-software-developers"],
      ["Coding assessment platform", "/coding-assessment-platform"],
      ["Verified candidates", "/verified-candidates"],
    ]),
  },
  {
    path: "/verified-candidates",
    title: "Verified Candidates | Skill-Certified Talent Pool | ProvenHire",
    description:
      "Access verified candidates who completed aptitude, coding, and interview stages. Skill validation platform for serious hiring teams.",
    h1: "Browse verified candidates—not unvetted inbound",
    heroSub: "Skill Passport levels communicate how far each candidate progressed through verification.",
    blocks: [
      { type: "p", text: "Recruiters use ProvenHire to align with **skill validation platform** expectations: every stage leaves an auditable trail." },
    ],
    related: rel([
      ["For recruiters", "/for-recruiters"],
      ["Candidate search (login)", "/candidate-search"],
      ["Skill verification", "/skill-verification"],
    ]),
  },
  {
    path: "/ai-interview-platform",
    title: "AI Interview Platform | Automated Structured Interviews | ProvenHire",
    description:
      "AI interview platform with adversarial follow-ups, voice input, and proctoring—fairer signal than one-size screening calls.",
    h1: "AI interview platform with depth—not a static quiz",
    heroSub: "Structured sprints, weakness probes, and final evaluation tuned for technical roles.",
    blocks: [
      { type: "h2", text: "Accuracy vs. traditional screens" },
      {
        type: "ul",
        items: [
          "Consistent rubric for every candidate.",
          "Model-driven follow-ups based on answer quality.",
          "Session integrity signals for review.",
        ],
      },
    ],
    related: rel([
      ["Coding assessment", "/coding-assessment-platform"],
      ["Skill verification", "/skill-verification"],
      ["Features overview", "/features"],
    ]),
  },
  {
    path: "/coding-assessment-platform",
    title: "Coding Assessment Platform | Developer Assessment | ProvenHire",
    description:
      "Coding test platform for hiring: real execution, hidden tests, and integrity patterns. Compete with legacy assessor tools on fairness and depth.",
    h1: "Coding assessment platform built for real engineering signal",
    heroSub: "Timed problems, official attempts, and Judge-backed runs—developer assessment without toy trivia.",
    blocks: [
      { type: "p", text: "Teams comparing **HackerRank**-style breadth vs. depth trade-offs get both structure and proctoring context on ProvenHire." },
    ],
    related: rel([
      ["AI interview platform", "/ai-interview-platform"],
      ["Hire software developers", "/hire-software-developers"],
      ["Features", "/features"],
    ]),
  },
  {
    path: "/skill-verification",
    title: "Skill Verification | Validate Candidate Skills | ProvenHire",
    description:
      "Skill verification and validation platform: aptitude, coding, AI interview, and optional human expert—one progressive pipeline.",
    h1: "Skill verification end-to-end",
    heroSub: "Verify candidate skills with layers employers can trust and candidates can complete in days.",
    blocks: [
      { type: "h2", text: "Stages at a glance" },
      {
        type: "ul",
        items: ["Profile + resume intelligence", "Aptitude window", "DSA official scoring", "AI expert interview", "Human expert (eligible roles)"],
      },
    ],
    related: rel([
      ["Candidate analytics", "/candidate-analytics"],
      ["No-resume hiring", "/no-resume-hiring"],
      ["Skill-based hiring guide", "/skill-based-hiring"],
    ]),
  },
  {
    path: "/candidate-analytics",
    title: "Candidate Performance & Hiring Insights | ProvenHire",
    description:
      "Understand candidate performance analytics from verification scores—surface hiring insights before scheduling interviews.",
    h1: "Candidate analytics from verified scores",
    heroSub: "Turn stage outcomes into comparable hiring insights for your team.",
    blocks: [
      { type: "p", text: "Recruiters see certification level, stage marks, and pipeline history—supporting **hiring insights platform** workflows internally." },
    ],
    related: rel([
      ["Verified candidates", "/verified-candidates"],
      ["For recruiters", "/for-recruiters"],
    ]),
  },
  {
    path: "/hire-software-developers",
    title: "Hire Software Developers in India | Fast Technical Hiring | ProvenHire",
    description:
      "Hire software developers fast: filter by verified coding and AI interview scores. Hire developers India with less screening debt.",
    h1: "Hire software developers with verification already done",
    heroSub: "From Bangalore to remote—narrow to candidates who cleared DSA and technical dialogue.",
    blocks: [
      { type: "h2", text: "Why speed doesn’t mean compromise" },
      {
        type: "ul",
        items: ["Pre-assessed talent pool", "Role-aware certification floors", "Less back-and-forth on basic competence"],
      },
    ],
    related: rel([
      ["Jobs directory", "/jobs"],
      ["Software engineer (programmatic SEO)", "/jobs/software-engineer"],
      ["Startup hiring", "/startup-hiring"],
    ]),
  },
  {
    path: "/hire-freshers",
    title: "Hire Freshers | Fresher Hiring Platform | ProvenHire",
    description:
      "Fresher hiring platform: verify aptitude and coding without years of experience on a resume.",
    h1: "Hire freshers without resume guesswork",
    heroSub: "Objective rounds surface potential when experience is thin.",
    blocks: [
      {
        type: "ul",
        items: ["Weighted aptitude for logical speed", "DSA ramps appropriate to entry roles", "Clear badges for recruiters"],
      },
    ],
    related: rel([
      ["Hire software developers", "/hire-software-developers"],
      ["Skill-based hiring guide", "/skill-based-hiring"],
    ]),
  },
  {
    path: "/startup-hiring",
    title: "Startup Hiring | Fast Hiring Tools for Growing Teams | ProvenHire",
    description:
      "Hiring for startups: fast hiring tools with verified candidates so founding teams spend time on culture fit—not resume triage.",
    h1: "Startup hiring with a verified pipeline",
    heroSub: "Move quickly without skipping technical bar—perfect for lean recruiting teams.",
    blocks: [
      { type: "p", text: "Early-stage teams use ProvenHire as a **fast hiring platform** layer on top of their existing ATS habits." },
    ],
    related: rel([
      ["For recruiters", "/for-recruiters"],
      ["No-resume hiring", "/no-resume-hiring"],
    ]),
  },
  {
    path: "/no-resume-hiring",
    title: "No Resume Hiring | Resume Alternative Hiring | ProvenHire",
    description:
      "Resume alternative hiring: evaluate proof from assessments and interviews. Hiring without resumes as the primary filter.",
    h1: "No-resume hiring—lead with proof",
    heroSub: "Replace resume roulette with verified performance across stages.",
    blocks: [
      { type: "h2", text: "Why this page matters" },
      {
        type: "p",
        text: "**Hiring without resumes** doesn't mean zero context—it means resumes stop being the only gate. ProvenHire aligns with **resume alternative hiring** by forcing signal at each verification checkpoint.",
      },
    ],
    related: rel([
      ["Hiring without resume (guide)", "/hiring-without-resume"],
      ["For recruiters", "/for-recruiters"],
      ["Get hired without resume", "/get-hired-without-resume"],
    ]),
  },
  {
    path: "/skill-based-hiring",
    title: "What Is Skill-Based Hiring? Complete Guide | ProvenHire",
    description:
      "What is skill-based hiring: benefits, implementation, and how merit-based hiring reduces bias and time-to-hire.",
    h1: "Skill-based hiring guide",
    heroSub: "Definition, benefits, and how ProvenHire operationalizes merit-based hiring in one pipeline.",
    blocks: [
      { type: "h2", text: "Benefits of skill-based hiring" },
      {
        type: "ul",
        items: [
          "Fewer false positives from keyword stuffing.",
          "Fairer comparison across schools and brands.",
          "Faster onsite scheduling because basics are verified.",
        ],
      },
    ],
    related: rel([
      ["Technical hiring guide", "/technical-hiring-guide"],
      ["Resources", "/resources"],
      ["Blog", "/blog"],
    ]),
  },
  {
    path: "/technical-hiring-guide",
    title: "Technical Hiring Guide | India & Remote Teams | ProvenHire",
    description:
      "Technical hiring guide for engineering managers: combine coding assessment, AI interviews, and human expert validation.",
    h1: "Technical hiring guide for modern teams",
    heroSub: "A practical mental model for mixing automation and human judgment.",
    blocks: [
      { type: "h2", text: "Stack the stages" },
      {
        type: "ul",
        items: ["Screen with consistent coding bars", "Add AI dialogue for communication", "Close with expert interview for senior roles"],
      },
    ],
    related: rel([
      ["Skill-based hiring", "/skill-based-hiring"],
      ["Coding assessment platform", "/coding-assessment-platform"],
    ]),
  },
  {
    path: "/hiring-without-resume",
    title: "Hiring Without Resume | Employer Guide | ProvenHire",
    description:
      "Employer guide to hiring without resume dependency: use verified skill passports and structured evidence.",
    h1: "Hiring without resume dependency",
    heroSub: "Operational checklist for talent teams moving to evidence-first screening.",
    blocks: [
      { type: "p", text: "Pairs with our candidate-facing **get hired without resume** narrative—for a full-funnel **resume alternative hiring** story." },
    ],
    related: rel([
      ["No-resume hiring", "/no-resume-hiring"],
      ["For recruiters", "/for-recruiters"],
    ]),
  },
];

export const SEO_PAGE_BY_PATH: Record<string, SeoPageDef> = Object.fromEntries(
  SEO_LANDING_PAGES.map((p) => [p.path, p])
);

/** Programmatic job slug → SEO content */
export const PROGRAMMATIC_JOB_PAGES: Record<
  string,
  { title: string; description: string; h1: string; heroSub: string; keywords: string }
> = {
  "software-engineer": {
    title: "Software Engineer Jobs & Verified Hiring | ProvenHire",
    description: "Explore software engineer hiring with skill-verified candidates. Technical hiring for backend, full stack, and product engineering.",
    h1: "Software engineer hiring—verified skills first",
    heroSub: "Connect ProvenHire verification with your open SDE and full-stack reqs.",
    keywords: "software engineer jobs, hire software engineer",
  },
  "frontend-developer": {
    title: "Frontend Developer Jobs | React & Web Hiring | ProvenHire",
    description: "Hire frontend developers with coding rounds and UI sense checks baked into verification.",
    h1: "Frontend developer hiring",
    heroSub: "Candidates prove implementation skill—not portfolio claims alone.",
    keywords: "frontend developer, react jobs",
  },
  "data-analyst": {
    title: "Data Analyst Hiring | Verified Quant & Logic | ProvenHire",
    description: "Data analyst roles: use aptitude and structured interviews to validate analytical thinking.",
    h1: "Data analyst hiring",
    heroSub: "Structured stages complement SQL and stats take-homes.",
    keywords: "data analyst jobs",
  },
  "bangalore-developers": {
    title: "Bangalore Developers | Hire in BLR with Skill Verification | ProvenHire",
    description: "Hire developers in Bangalore with pre-assessed candidates on ProvenHire.",
    h1: "Bangalore developers—hire with proof",
    heroSub: "India tech hub coverage with consistent verification rubric.",
    keywords: "bangalore developers, jobs bangalore",
  },
  "hyderabad-developers": {
    title: "Hyderabad Developers | Technical Hiring Telangana | ProvenHire",
    description: "Hyderabad developer hiring backed by skill passport verification.",
    h1: "Hyderabad developers",
    heroSub: "Scale screening without lowering the technical bar.",
    keywords: "hyderabad developers",
  },
  "python-developer-bangalore": {
    title: "Python Developer Bangalore | Skill-Verified Candidates | ProvenHire",
    description: "Hire Python developers in Bangalore: combine location filters with verified coding scores.",
    h1: "Python developer jobs in Bangalore",
    heroSub: "Programmatic landing for high-intent role + city combos.",
    keywords: "python developer bangalore",
  },
  "react-developer-india": {
    title: "React Developer India | Hire Front-End Talent | ProvenHire",
    description: "React developer India: pipeline of candidates with verified JS and system rounds.",
    h1: "React developer India",
    heroSub: "Remote and hybrid—verification travels with the candidate.",
    keywords: "react developer india",
  },
};

export const PROGRAMMATIC_JOB_SLUGS = Object.keys(PROGRAMMATIC_JOB_PAGES);

export const PROGRAMMATIC_SKILL_PAGES: Record<
  string,
  { title: string; description: string; h1: string; heroSub: string }
> = {
  "react-jobs": {
    title: "React Jobs | Skill-Verified React Hiring | ProvenHire",
    description: "React jobs and hiring paths for verified component and performance engineering skills.",
    h1: "React jobs—skills first",
    heroSub: "Surface candidates who cleared DSA and technical dialogue relevant to modern React stacks.",
  },
  "python-jobs": {
    title: "Python Jobs | Backend & Data Hiring | ProvenHire",
    description: "Python jobs: hiring teams use ProvenHire to filter on verified coding plus interview depth.",
    h1: "Python jobs",
    heroSub: "From services to data—consistent verification tiers.",
  },
  "dsa-jobs": {
    title: "DSA Jobs | Algorithms-Strong Candidates | ProvenHire",
    description: "DSA-heavy roles: official submissions and scores on platform for transparent comparison.",
    h1: "DSA jobs & algorithm-strong hires",
    heroSub: "Ideal for competitive programming–sensitive teams.",
  },
};

export const PROGRAMMATIC_SKILL_SLUGS = Object.keys(PROGRAMMATIC_SKILL_PAGES);

export function allSeoPathsForSitemap(): string[] {
  const staticPaths = SEO_LANDING_PAGES.map((p) => p.path);
  const jobProg = PROGRAMMATIC_JOB_SLUGS.map((s) => `/jobs/${s}`);
  const skillProg = PROGRAMMATIC_SKILL_SLUGS.map((s) => `/skills/${s}`);
  return [...staticPaths, "/features", "/resources", "/blog", ...jobProg, ...skillProg];
}
