import type { ExperienceTier } from "../utils/experienceTier.js";
export type HobbyCategoryDef = {
  id: string;
  label: string;
  description: string;
  /** Shown to candidate and evaluator; optional extra for this vertical. */
  extraRequirement?: string;
};

/**
 * Candidate-chosen hobby / interest areas for the generic magazine-blog writing assessment.
 * Core process (brainstorm → outline → references → draft → polish) is the same for all.
 */
export const HOBBY_CATEGORIES: HobbyCategoryDef[] = [
  {
    id: "food_cooking",
    label: "Food & cooking",
    description: "Home cooking, ingredients, techniques, or food culture you care about.",
    extraRequirement:
      "Include one original recipe: a short headnote, ingredient list with amounts, and numbered steps.",
  },
  {
    id: "fitness_wellbeing",
    label: "Fitness & wellbeing",
    description: "Training, recovery, habits, or mindful movement for hobby readers (not medical advice).",
    extraRequirement:
      "Add a short disclaimer that readers should consult professionals for medical concerns.",
  },
  {
    id: "travel_places",
    label: "Travel & places",
    description: "A place, style of trip, or travel theme you could write about from experience or deep interest.",
  },
  {
    id: "tech_gadgets",
    label: "Tech & gadgets (enthusiast)",
    description: "Consumer tech, tools, or maker topics for curious hobby readers—not a job interview write-up.",
  },
  {
    id: "arts_crafts",
    label: "Arts & crafts",
    description: "Visual art, photography, knitting, woodworking, or another hands-on creative hobby.",
  },
  {
    id: "music_books_film",
    label: "Music, books, or film",
    description: "Recommendations, deep dives, or cultural commentary for fans like you.",
  },
  {
    id: "gaming",
    label: "Gaming",
    description: "Video or tabletop games: tips, retrospectives, or thoughtful critique for fellow players.",
  },
  {
    id: "nature_garden_pets",
    label: "Nature, gardening, or pets",
    description: "Plants, wildlife, outdoor hobbies, or companion animals you enjoy learning about.",
  },
  {
    id: "diy_home",
    label: "DIY & home",
    description: "Projects, repairs, organisation, or upgrades hobby readers could try.",
  },
  {
    id: "sports_fandom",
    label: "Sports & fandom",
    description: "A sport, team, or fan culture you follow—storytelling and insight for readers who share the interest.",
  },
];

const HOBBY_BY_ID = new Map(HOBBY_CATEGORIES.map((h) => [h.id, h]));

export function isValidHobbyCategoryId(id: string): boolean {
  return HOBBY_BY_ID.has(id);
}

export function getHobbyCategoryMeta(id: string): HobbyCategoryDef | undefined {
  return HOBBY_BY_ID.get(id);
}

/** Safe payload for GET /non-tech-assignment/prompt when asking the candidate to choose a topic. */
export function hobbyCategoriesForClient(): Pick<HobbyCategoryDef, "id" | "label" | "description">[] {
  return HOBBY_CATEGORIES.map(({ id, label, description }) => ({ id, label, description }));
}

function tierWordAndTimeGuide(tier: ExperienceTier): { words: string; time: string } {
  switch (tier) {
    case "fresher":
      return {
        words: "Aim for roughly **650–950 words** in the final polished article section (flexible if your outline and references are strong).",
        time: "**About 2–3 hours** including light research and revision — take a bit longer if you need it; clarity beats rushing.",
      };
    case "mid":
      return {
        words: "Aim for roughly **900–1,200 words** in the final polished article section (flexible).",
        time: "**About 3–4 hours** including research and refinement — adjust freely.",
      };
    case "senior":
    default:
      return {
        words: "Aim for roughly **1,100–1,600 words** in the final polished article section (flexible).",
        time: "**About 4–5 hours** including research and refinement — depth and judgment matter more than speed.",
      };
  }
}

function retakeNudge(attemptIndex: number): string {
  if (attemptIndex <= 0) return "";
  return "\n\n**Note:** If this is a retake, choose a fresh angle or subtopic within the same category so your submission does not repeat your previous attempt.";
}

/**
 * Generic writing assessment: blog post for an online hobby magazine (no employer-specific scenario).
 */
export function buildHobbyMagazineAssignmentPrompt(params: {
  hobbyCategoryId: string;
  experienceTier: ExperienceTier;
  attemptIndex: number;
}): string {
  const meta = HOBBY_BY_ID.get(params.hobbyCategoryId);
  if (!meta) return "";

  const { words, time } = tierWordAndTimeGuide(params.experienceTier);
  const extra =
    meta.extraRequirement?.trim() ||
    "Bring specific examples, small stories, or concrete details so readers feel your genuine expertise.";

  return `PROVENHIRE — WRITING ASSESSMENT (GENERIC)

This is **not** tied to a hiring company or role play. We are assessing **core writing skills** while you write about something you **enjoy and know**.

---

## Your topic area (you chose)

**${meta.label}** — ${meta.description}

---

## Publication & reader

Write as if for an **independent online hobby magazine** that publishes practical, trustworthy articles for enthusiasts.

**You must state clearly who your target reader is** (one short paragraph or a few bullets near the top of your document). Examples: “busy parents who batch-cook,” “beginner cyclists,” “retro RPG fans.”

**Category-specific expectation:** ${extra}

---

## Process — include all of these sections in one document

Work like a real editor would: **ideation → planning → sourcing → drafting → finessing.**

1. **Brainstorm** — Capture alternative angles or ideas you considered (short section or bullet list is fine).
2. **Outline** — Show the structure you intend before the polished piece (headings / bullets are fine).
3. **References** — List sources you used (articles, books, reputable sites, videos). Plain titles or URLs are enough; formal academic citations are not required.
4. **Draft — the blog post** — The main article for the magazine, written to your stated reader.
5. **Polish** — Your final pass should show in the finished post: clear hook, logical flow, scannable headings where helpful, and a satisfying close.

---

## Length & time (guidance only)

- ${words}
- ${time}

---

## How you will be evaluated (self-check before submit)

We score on **creativity**, **clarity**, **expertise** in your topic, **reader engagement**, and **polish** (grammar, spelling, formatting).

---

## Submit

One **PDF** or **Word (.docx)** file containing **all** sections above, in order, through the upload step in ProvenHire.
${retakeNudge(params.attemptIndex)}`;
}
