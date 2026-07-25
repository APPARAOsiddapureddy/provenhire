import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getNewDSAQuestions } from "../../src/data/dsaQuestionsBank.js";

const DSA_RECOMMENDED_CASES = 8;
const SQL_RECOMMENDED_CASES = 6;

type BankIssue = {
  bank: "dsa" | "sql";
  title: string;
  issue: string;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n");
}

function duplicateCount(values: unknown[]) {
  const normalizedValues = values.map(normalized).filter(Boolean);
  return normalizedValues.length - new Set(normalizedValues).size;
}

const dsaQuestions = getNewDSAQuestions();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const sqlTasks = JSON.parse(
  readFileSync(
    join(scriptDir, "..", "src", "data", "data-round-tasks-seed.json"),
    "utf8",
  ),
) as Array<{
  title: string;
  taskType: string;
  testCases: Array<{ input: string; expected: string; isHidden: boolean }>;
}>;

const issues: BankIssue[] = [];
for (const question of dsaQuestions) {
  if (question.testCases.length < DSA_RECOMMENDED_CASES) {
    issues.push({
      bank: "dsa",
      title: question.title,
      issue: `${question.testCases.length}/${DSA_RECOMMENDED_CASES} recommended judge cases`,
    });
  }
  const duplicates = duplicateCount(question.testCases.map((test) => test.input));
  if (duplicates) {
    issues.push({
      bank: "dsa",
      title: question.title,
      issue: `${duplicates} duplicate judge input${duplicates === 1 ? "" : "s"}`,
    });
  }
  if (question.testCases.some((test) => !normalized(test.expectedOutput))) {
    issues.push({ bank: "dsa", title: question.title, issue: "empty expected output" });
  }
}

const sqlOnly = sqlTasks.filter((task) => task.taskType === "sql");
for (const task of sqlOnly) {
  if (task.testCases.length < SQL_RECOMMENDED_CASES) {
    issues.push({
      bank: "sql",
      title: task.title,
      issue: `${task.testCases.length}/${SQL_RECOMMENDED_CASES} recommended judge cases`,
    });
  }
  if (!task.testCases.some((test) => !test.isHidden)) {
    issues.push({ bank: "sql", title: task.title, issue: "no candidate-visible case" });
  }
  if (!task.testCases.some((test) => test.isHidden)) {
    issues.push({ bank: "sql", title: task.title, issue: "no hidden case" });
  }
  const duplicates = duplicateCount(task.testCases.map((test) => test.input));
  if (duplicates) {
    issues.push({
      bank: "sql",
      title: task.title,
      issue: `${duplicates} duplicate judge input${duplicates === 1 ? "" : "s"}`,
    });
  }
  if (task.testCases.some((test) => !normalized(test.expected))) {
    issues.push({ bank: "sql", title: task.title, issue: "empty expected output" });
  }
}

const summary = {
  thresholds: {
    dsaJudgeCasesPerProblem: DSA_RECOMMENDED_CASES,
    sqlJudgeCasesPerTask: SQL_RECOMMENDED_CASES,
  },
  dsa: {
    total: dsaQuestions.length,
    meetingRecommendedCoverage: dsaQuestions.filter(
      (question) => question.testCases.length >= DSA_RECOMMENDED_CASES,
    ).length,
    minimumCases: Math.min(...dsaQuestions.map((question) => question.testCases.length)),
  },
  sql: {
    total: sqlOnly.length,
    meetingRecommendedCoverage: sqlOnly.filter(
      (task) => task.testCases.length >= SQL_RECOMMENDED_CASES,
    ).length,
    minimumCases: Math.min(...sqlOnly.map((task) => task.testCases.length)),
  },
  issueCount: issues.length,
  issues,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (process.argv.includes("--strict") && issues.length) process.exitCode = 1;
