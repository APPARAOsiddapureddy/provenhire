/**
 * PRD §8 — lightweight anti-gaming signals on user answers (before / merged with evaluator).
 */

export type UserAnswerRow = {
  message: string;
  questionType: string | null;
  timeToSubmitSeconds: number | null;
  pasteCount: number;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type AntiGamingMessagePatch = {
  flagAntiGaming: boolean;
  flagReason: string | null;
  riskPoints: number;
};

export function analyzeAnswerAntiGaming(rows: UserAnswerRow[]): AntiGamingMessagePatch[] {
  const patches: AntiGamingMessagePatch[] = rows.map(() => ({
    flagAntiGaming: false,
    flagReason: null,
    riskPoints: 0,
  }));

  const texts = rows.map((r) => r.message.trim());

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const len = row.message.length;
    const reasons: string[] = [];
    let pts = 0;

    if (len > 2000) {
      reasons.push("answer_too_long");
      pts += 20;
    }
    const isBehavioral = row.questionType === "behavioral";
    if (!isBehavioral && len > 0 && len < 20) {
      reasons.push("answer_too_short");
      pts += 5;
    }
    if (row.pasteCount >= 2) {
      reasons.push("high_paste_count");
      pts += 5;
    }
    if (row.timeToSubmitSeconds != null && row.timeToSubmitSeconds < 5) {
      reasons.push("fast_submit");
      pts += 10;
    }

    if (reasons.length) {
      patches[i] = {
        flagAntiGaming: true,
        flagReason: reasons.join(","),
        riskPoints: pts,
      };
    }
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (texts[i].length < 30 || texts[j].length < 30) continue;
      const sim = jaccard(tokenize(texts[i]), tokenize(texts[j]));
      if (sim > 0.6) {
        const r = "repetitive_answers_pair";
        patches[i] = {
          flagAntiGaming: true,
          flagReason: patches[i].flagReason ? `${patches[i].flagReason},${r}` : r,
          riskPoints: patches[i].riskPoints + 5,
        };
        patches[j] = {
          flagAntiGaming: true,
          flagReason: patches[j].flagReason ? `${patches[j].flagReason},${r}` : r,
          riskPoints: patches[j].riskPoints + 5,
        };
      }
    }
  }

  return patches;
}
