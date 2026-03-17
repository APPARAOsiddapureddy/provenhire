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
    questionType: "Hard",
    questionName: "Custom Vertical Fill Matrix",
    question: `You are given a primary string S containing distinct lowercase letters, a sentence containing multiple words, and the dimensions of a matrix (rows and columns). Your task is to create a character matrix of the given size. Fill the matrix column-wise (top to bottom, then left to right) using the characters from S in the order they appear. If the string S does not have enough characters to fill the matrix, continue filling the remaining spaces with letters from 'a' to 'z' repeatedly, skipping any letters already present in S. For each word in the given sentence, check if it can be found horizontally (left to right) or vertically (top to bottom) in the matrix. Only keep the words that are FOUND, and return them in a space-separated string in the same order they appeared in the input sentence.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        # parse input and call Solution().solve(...)
        pass`
    }],
    testCases: [
    { input: "pineapplecake\npi pe\n3\n3", output: "pi pe" },
    { input: "abcdefgh\nabc gh cde\n3\n3", output: "abc gh" }
    ],
    questionNumber: 1
    },
    
    {
    questionType: "Hard",
    questionName: "GCD Territories",
    question: `There are n people in a family tree rooted at node 1 connected by n-1 edges, and each member has a cooking skill value. Any member k can either cook alone or with a group of its descendants forming a subtree rooted at k. A cooking group cooks perfect food only if the GCD of cooking skill values of all its members is 1. Determine for each member from 1 to n the number of distinct cooking groups they can form that cook perfect food.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "1\n5", output: "0" },
    { input: "3\n2 3 5\n1 2\n2 3", output: "2 1 0" }
    ],
    questionNumber: 2
    },
    
    {
    questionType: "Medium",
    questionName: "Peacock Stairs",
    question: `A peacock wants to reach the top of a staircase with N steps. It can jump exactly 1 stair or fly exactly 3 stairs. To cover 2 stairs it must take two consecutive jumps of 1. Find the total number of distinct ways to reach the Nth stair. Return the answer modulo 10^9+7.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, n):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "2", output: "1" },
    { input: "5", output: "4" }
    ],
    questionNumber: 3
    },
    
    {
    questionType: "Hard",
    questionName: "Subset Expression To Target",
    question: `You are given an array of integers arr and a target. You may choose any non-empty subset and arrange its elements in any order. Between the elements you can insert +, -, *, or /. Division is valid only when it results in an integer. Determine whether an expression can evaluate exactly to the target.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "3\n7 2 5\n9", output: "true" },
    { input: "1\n8\n5", output: "false" }
    ],
    questionNumber: 4
    },
    
    {
    questionType: "Easy",
    questionName: "Nearest Larger Negative",
    question: `You are given an array A of integers of size N and a target integer x. Find the index of the nearest negative element whose absolute value is strictly greater than x. Return the 0-based index or -1 if none exists.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "3\n1 -2 3\n5", output: "-1" },
    { input: "5\n-1 -50 -20 -5 -100\n10", output: "2" }
    ],
    questionNumber: 5
    },
    
    {
    questionType: "Medium",
    questionName: "Roman Numeral BST Search",
    question: `You are given a Binary Search Tree where each node value is a Roman numeral. The BST property is based on the integer value of the Roman numeral. Given a target Roman numeral, determine whether it exists in the BST. Output "Found" or "Not Found".`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "7\nX V XV NULL NULL NULL NULL\nV", output: "Found" },
    { input: "7\nX V XV NULL NULL NULL NULL\nIX", output: "Not Found" }
    ],
    questionNumber: 6
    },
    
    {
    questionType: "Medium",
    questionName: "Absolute walk",
    question: `For indices i and j define F(i,j) as the sum of absolute differences between consecutive elements from i to j. For each query determine if |arr[i]-arr[j]| equals F(i,j).`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "2 1\n5 9\n1 2", output: "YES" },
    { input: "3 1\n1 4 2\n1 3", output: "NO" }
    ],
    questionNumber: 7
    },
    
    {
    questionType: "Medium",
    questionName: "Find Us",
    question: `Given integers a and b, find divisors x of a and y of b such that x>1, y>1 and (x+y) divides both a and b. If multiple pairs exist choose smallest x then smallest y.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, a, b):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "12 18", output: "3 3" },
    { input: "7 11", output: "-1" }
    ],
    questionNumber: 8
    },
    
    {
    questionType: "Medium",
    questionName: "Greed of GCD",
    question: `You are given an array. Remove exactly two elements and compute the GCD of the remaining elements. Return the maximum possible GCD.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "4\n2 6 8 4", output: "4" },
    { input: "4\n12 15 18 9", output: "9" }
    ],
    questionNumber: 9
    },
    
    {
    questionType: "Medium",
    questionName: "Bottom-Up Largest Node Removal",
    question: `Given a complete binary tree stored as a level order array, process levels from bottom to top. At each level remove the largest node value only if it is a leaf node.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "3\n1 -1 -1", output: "-1 -1 -1" }
    ],
    questionNumber: 10
    },
    
    {
    questionType: "Hard",
    questionName: "Power Partition",
    question: `Split the array into contiguous parts where the product of each part is a perfect k-th power. Count the number of valid partitions modulo 1e9+7.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "2 2\n4 9", output: "2" },
    { input: "3 2\n2 2 2", output: "0" }
    ],
    questionNumber: 11
    },
    
    {
    questionType: "Medium",
    questionName: "Forwardbackwardmove",
    question: `You are given a circular doubly linked list and a starting index. Alternate between forward and backward moves based on the value at the current node until the same value appears twice consecutively.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "5\n3\n1 2 3 4 5", output: "3 1 5 5" }
    ],
    questionNumber: 12
    },
    
    {
    questionType: "Hard",
    questionName: "Chocolate Redistribution with Equal Sharing",
    question: `Simulate chocolate distribution among N children. Chocolates are distributed equally each round, eaten simultaneously based on speed, leftovers collected, and the process repeats until no equal share is possible. Return total time.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "4 100 3", output: "17" },
    { input: "4 100 4", output: "15" }
    ],
    questionNumber: 13
    },
    
    {
    questionType: "Medium",
    questionName: "Dual-Link List Traversal",
    question: `Each node has next and jump references. Starting from head perform a sequence of operations (jump or next) and output the node values visited after each operation.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" }
    ],
    questionNumber: 14
    },
    
    {
    questionType: "Medium",
    questionName: "Amusement Ride Circular Reservation",
    question: `Simulate a circular queue for amusement ride reservations. Each ride selects K people, checks confirmation status, and either seats them or sends them back to the queue.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" }
    ],
    questionNumber: 15
    },
    
    {
    questionType: "Easy",
    questionName: "Department Students",
    question: `Given department student data in the format Dept:G1,B1,G2,B2,G3,B3,G4,B4 compute total girls and boys per department. Then output the department with the maximum girls and the department with the maximum boys.`,
    preBuiltFunction: [{
    language: "Python",
    languageCode: "python",
    code: `class Solution:
        def solve(self, *args):
            # TODO: implement
            pass
    
    if __name__ == "__main__":
        pass`
    }],
    testCases: [
    { input: "3\nCSE:3,4,2,2,2,2,3,1\nIT:2,3,3,2,1,4,2,3\nMECH:1,2,2,3,3,1,2,2", output: "CSE:10:9\nIT:8:12\nMECH:8:8\nCSE 10\nIT 12" }
    ],
    questionNumber: 16
    },
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
    questionNumber: 17,
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
    questionNumber: 18,
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
    questionNumber: 19,
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
    questionNumber: 20,
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
    questionNumber: 21,
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
    questionNumber: 22,
  },
  {
    questionType: "Hard",
    questionName: "Custom Vertical Fill Matrix",
    question: `You are given a primary string S containing distinct lowercase letters, a sentence
containing multiple words, and the dimensions of a matrix (rows and columns). Your task is to
create a character matrix of the given size. Fill the matrix column-wise (top to bottom, then left to
right) using the characters from S in the order they appear. If the string S does not have enough
characters to fill the matrix, continue filling the remaining spaces with letters from 'a' to 'z'
repeatedly, skipping any letters already present in S. For each word in the given sentence,
check if it can be found horizontally (left to right) or vertically (top to bottom) in the matrix. Only
keep the words that are FOUND, and return them in a space-separated string in the same order
they appeared in the input sentence.

Expected Time Complexity: O(n*m + w*l)
Expected Space Complexity: O(n*m)

Constraints:
1<=n<=5
1<=m<=5
A, B consist of lower case alphabet from a to z only.`,
    preBuiltFunction: [
      {
        language: "Python",
        languageCode: "python",
        code: `def findWordsInMatrix(s, searchWords, R, C):
    # TODO: implement
    return ""

if __name__ == "__main__":
    s = input().strip()
    searchWords = input().split()
    R = int(input())
    C = int(input())
    print(findWordsInMatrix(s, searchWords, R, C))`,
      },
    ],
    testCases: [
      { input: "pineapplecake\npi pe\n3\n3", output: "pi pe" },
      { input: "abcdefgh\nabc gh cde\n3\n3", output: "abc gh" },
      { input: "kotlinjava\nkot lin ava\n4\n4", output: "kot" },
      { input: "programming\nram pro gin map\n5\n3", output: "pro" },
      { input: "helloworld\nlow row or ld\n4\n3", output: "ld" },
      { input: "datascience\ndat ien ace net cat\n4\n4", output: "dat ien" },
      { input: "machine\nmac hin ine chi\n3\n3", output: "mac hin" },
      { input: "machine\nmac hin eb\n3\n3", output: "mac hin eb" },
      { input: "chocolate\ncho col ate tea\n4\n3", output: "cho ate" },
      { input: "prayagrajriver\npray jive\n5\n5", output: "pray jive" },
      { input: "anacondasnake\nanac anc d s\n5\n5", output: "anc d s" },
      { input: "mississippi\nm s i p\n4\n4", output: "m s i p" },
    ],
    questionNumber: 23,
  },
];

export function getNewDSAQuestions(): DSAQuestion[] {
  return rawDSAQuestions.map((raw, i) =>
    convertToDSAQuestion(raw, `DSA_NEW_${String(i + 1).padStart(3, "0")}`)
  );
}
