import assert from "node:assert/strict";

import {
  APTITUDE_QUESTION_COUNT,
  createWorkspaceMcqQuestionSet,
} from "../src/data/aptitude-loader.js";

const questionSet = createWorkspaceMcqQuestionSet({
  easyCount: 8,
  mediumCount: 8,
  hardCount: 4,
  allowPartial: false,
});

assert.equal(questionSet.questions.length, APTITUDE_QUESTION_COUNT);
assert.deepEqual(questionSet.shortage, { easy: 0, medium: 0, hard: 0 });
assert.equal(
  questionSet.questions.every(
    (question) => Boolean(question.domain) && Boolean(question.difficulty),
  ),
  true,
);
assert.deepEqual(
  questionSet.questions.reduce<Record<string, number>>((counts, question) => {
    const difficulty = question.difficulty ?? "missing";
    counts[difficulty] = (counts[difficulty] ?? 0) + 1;
    return counts;
  }, {}),
  { easy: 8, medium: 8, hard: 4 },
);
assert.equal(
  questionSet.questions.every((question) =>
    [
      "Quantitative",
      "Logical Reasoning",
      "Number System",
      "Verbal Reasoning",
    ].includes(question.domain ?? ""),
  ),
  true,
);

console.log("workspace aptitude contract: 5/5 passed");
