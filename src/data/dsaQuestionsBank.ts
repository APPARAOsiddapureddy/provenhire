/**
 * DSA Question Bank - Additional questions for DSA Round
 * Format compatible with dsaQuestions structure
 */
import type { DSAQuestion, ProgrammingLanguage } from "./dsaQuestions";

const LANG_MAP: Record<string, ProgrammingLanguage> = {
  cplusplus: "cpp",
  javascript: "javascript",
  c: "c",
  csharp: "cpp", // Use cpp as fallback
  python: "python",
  java: "java",
  php: "javascript", // Use js as fallback
};

function buildTemplates(
  preBuilt: { languageCode: string; code: string }[]
): Record<ProgrammingLanguage, string> {
  const templates: Partial<Record<ProgrammingLanguage, string>> = {};
  for (const { languageCode, code } of preBuilt) {
    const lang = LANG_MAP[languageCode] || "python";
    if (!templates[lang] || languageCode === lang) {
      templates[lang] = code;
    }
  }
  return {
    javascript: templates.javascript ?? "// JavaScript - paste your solution",
    python: templates.python ?? "# Python - paste your solution",
    java: templates.java ?? "// Java - paste your solution",
    cpp: templates.cpp ?? "// C++ - paste your solution",
    c: templates.c ?? "// C - paste your solution",
  };
}

export interface RawDSAQuestion {
  questionType: string;
  questionName: string;
  question: string;
  preBuiltFunction: { language: string; languageCode: string; code: string }[];
  testCases: { input: string; output: string }[];
  questionNumber?: number;
}

export function convertToDSAQuestion(raw: RawDSAQuestion, id: string): DSAQuestion {
  const diff = raw.questionType as "Easy" | "Medium" | "Hard";
  return {
    id,
    difficulty: diff,
    title: raw.questionName,
    description: raw.question,
    examples: [],
    constraints: [],
    testCases: raw.testCases.map((t) => ({ input: t.input, expectedOutput: t.output })),
    hints: [],
    topic: "DSA",
    functionName: "solve",
    templates: buildTemplates(raw.preBuiltFunction),
  };
}

// Import question data - stored as JSON-like for brevity
export const rawDSAQuestions: RawDSAQuestion[] = [
  {
    questionType: "Medium",
    questionName: "MEX Fill-Ups",
    question: `You are given an array a of n non-negative integers and a target integer k.
In one operation you may pick any index i and replace a[i] with any integer x such that 0 ≤ x ≤ a[i]. Each replacement counts as one operation.
Make the array's MEX (minimum excluded non-negative integer) at least k — equivalently, after operations the array must contain all integers 0,1,2...,k-1. Compute the minimum number of operations required, or output -1 if it is impossible.

Expected Time Complexity: O(n log n)
Expected Space Complexity: O(n)

Constraints: 1 ≤ n ≤ 2·10^5, 0 ≤ a[i] ≤ 10^9, 0 ≤ k ≤ 2·10^5`,
    preBuiltFunction: [
      { language: "JavaScript", languageCode: "javascript", code: `function solve(n, k, a) {
  // CODE HERE
}

const fs = require('fs');
const data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);
if (data.length < 2) process.exit(0);
const n = parseInt(data[0], 10);
const k = parseInt(data[1], 10);
const a = [];
for (let i = 0; i < n; ++i) a.push(parseInt(data[2 + i], 10));
const ans = solve(n, k, a);
console.log(ans);` },
      { language: "Python", languageCode: "python", code: `def solve(n, k, a):
    # CODE HERE
    pass

if __name__ == "__main__":
    import sys
    data = sys.stdin.read().strip().split()
    n = int(data[0])
    k = int(data[1])
    a = list(map(int, data[2:2+n]))
    print(solve(n, k, a))` },
    ],
    testCases: [
      { input: "5 3\n1 2 3 4 5", output: "3" },
      { input: "5 5\n0 1 2 3 4", output: "0" },
      { input: "5 6\n0 1 2 3 4", output: "-1" },
    ],
    questionNumber: 2,
  },
  {
    questionType: "Easy",
    questionName: "Rearrange Books",
    question: `In a library, books are arranged in several stacks. You are given an array A where A[i] represents the number of books in the i-th stack. For neatness, the librarian wants all stacks to have the same height. Books can be moved from one stack to another.
Determine the minimum number of books that need to be moved so that all stacks end up with equal height. If it is not possible (e.g., total cannot be evenly divided), return -1.

Expected Time Complexity: O(n)
Expected Space Complexity: O(1)

Constraints: 1 ≤ n ≤ 10^5, 1 ≤ A[i] ≤ 10^5`,
    preBuiltFunction: [
      { language: "Python", languageCode: "python", code: `class Solution:
    def rearrangeBooks(self, n, A):
        # code here
        return 0

if __name__ == "__main__":
    n = int(input())
    A = list(map(int, input().split()))
    obj = Solution()
    answer = obj.rearrangeBooks(n, A)
    print(answer)` },
    ],
    testCases: [
      { input: "3\n4 1 7", output: "3" },
      { input: "4\n4 2 5 9", output: "4" },
      { input: "1\n1", output: "0" },
    ],
    questionNumber: 2,
  },
  {
    questionType: "Medium",
    questionName: "Skipped Questions",
    question: `You solve one question daily for n days. Each day has an effort value. You choose to skip exactly k days (cannot skip two consecutive). Determine the minimum total effort after optimally choosing k non-consecutive days to skip.

Expected Time Complexity: O(n*k)
Expected Space Complexity: O(n*k)

Constraints: 1 ≤ n ≤ 10^5, 0 ≤ effort[i] ≤ 10^4, 0 ≤ k ≤ n/2`,
    preBuiltFunction: [
      { language: "Python", languageCode: "python", code: `class Solution:
    def minEffort(self, n, effort, k):
        # Code Here
        return 0

if __name__ == "__main__":
    n = int(input())
    effort = list(map(int, input().split()))
    k = int(input())
    obj = Solution()
    result = obj.minEffort(n, effort, k)
    print(result)` },
    ],
    testCases: [
      { input: "4\n10 5 7 10\n2", output: "12" },
      { input: "6\n3 1 4 1 5 9\n2", output: "10" },
    ],
    questionNumber: 2,
  },
  {
    questionType: "Medium",
    questionName: "The Last Box",
    question: `Fruits are loaded into empty boxes from a conveyor belt. A string of lowercase letters represents fruit types arriving in order. Place each new type into the current box, skip if already placed. When you cannot add any fruit, seal the box and start a new one. The conveyor loops until empty. Return the fruit types in the last box in order.

Expected Time Complexity: O(|s|)
Expected Space Complexity: O(1)

Constraints: 1 ≤ |s| ≤ 2*10^5`,
    preBuiltFunction: [
      { language: "Python", languageCode: "python", code: `class Solution:
    def lastBoxString(self, s: str) -> str:
        # code here
        return ""

if __name__ == "__main__":
    s = input().strip()
    obj = Solution()
    ans = obj.lastBoxString(s)
    print(ans, end="")` },
    ],
    testCases: [
      { input: "ababacc", output: "a" },
      { input: "xyz", output: "xyz" },
      { input: "xxy", output: "x" },
    ],
    questionNumber: 2,
  },
  {
    questionType: "Medium",
    questionName: "Water Bucket Challenge",
    question: `You have one large empty bucket of capacity C liters and N filled buckets. You can take water from a filled bucket and pour into the large bucket, but if you take from one bucket you cannot take from its adjacent buckets. Determine the minimum number of buckets needed to accumulate at least C liters. Return -1 if impossible.

Expected Time Complexity: O(N * C)
Expected Space Complexity: O(N * C)

Constraints: 1 ≤ N ≤ 500, 1 ≤ C ≤ 10^4, 1 ≤ Ai ≤ 10^4`,
    preBuiltFunction: [
      { language: "Python", languageCode: "python", code: `def min_buckets(n, c, arr):
    # code here
    return -1

n, c = map(int, input().split())
arr = list(map(int, input().split()))
print(min_buckets(n, c, arr))` },
    ],
    testCases: [
      { input: "5 10\n4 2 7 5 9", output: "2" },
      { input: "4 15\n5 3 4 6", output: "-1" },
    ],
    questionNumber: 2,
  },
  {
    questionType: "Medium",
    questionName: "Matrix Gravity",
    question: `You are given a matrix A (N×M) of digits 1-9 and a query string B. Delete all occurrences of digits in B from the matrix, apply gravity upwards (compact remaining elements toward row 0), and return the 0th row. Use # for empty columns.

Expected Time Complexity: O(N*M)
Expected Space Complexity: O(N*M)

Constraints: 1 <= N, M <= 50`,
    preBuiltFunction: [
      { language: "Python", languageCode: "python", code: `def findremaining(n, m, s, queries):
    # code here
    return ""

n, m = map(int, input().split())
s = input().strip()
queries = input().strip()
res = findremaining(n, m, s, queries)
print(res)` },
    ],
    testCases: [
      { input: "3 3\n123 453 243\n543", output: "1 2 #" },
      { input: "3 3\n123 453 243\n2", output: "1 5 3" },
    ],
    questionNumber: 2,
  },
];

export function getNewDSAQuestions(): DSAQuestion[] {
  return rawDSAQuestions.map((raw, i) =>
    convertToDSAQuestion(raw, `DSA_NEW_${String(i + 1).padStart(3, "0")}`)
  );
}
