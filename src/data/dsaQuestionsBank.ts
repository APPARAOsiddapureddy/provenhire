/**
 * DSA Question Bank - Additional questions for DSA Round
 * Format compatible with the removed dsaQuestions module.
 */
import type { ProgrammingLanguage } from "./dsaRoundConfig";
import { startersForQuestionNumber } from "./dsaMultiLangStarters";

type DSAQuestion = {
  id: string;
  difficulty: "Easy" | "Medium" | "Hard";
  title: string;
  description: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  constraints: string[];
  testCases: Array<{ input: string; expectedOutput: string }>;
  hints: string[];
  topic: string;
  functionName: string;
  templates: Record<ProgrammingLanguage, string>;
};

export interface RawDSAQuestion {
  questionType: string;
  questionName: string;
  question: string;
  preBuiltFunction: { language: string; languageCode: string; code: string }[];
  testCases: { input: string; output: string }[];
  questionNumber?: number;
}

export function convertToDSAQuestion(raw: RawDSAQuestion, id: string, bankIndexZeroBased: number): DSAQuestion {
  const diff = raw.questionType as "Easy" | "Medium" | "Hard";
  const testCases = raw.testCases.map((t) => ({ input: t.input, expectedOutput: t.output }));
  // Use the first sample test case as Example I/O (same as first public case after seeding).
  const examples =
    testCases.length > 0
      ? testCases.slice(0, 2).map((t) => ({
        input: t.input,
        output: t.expectedOutput,
      }))
      : [
        {
          input: "No sample I/O defined for this question.",
          output: "Add test cases in the question bank.",
        },
      ];
  return {
    id,
    difficulty: diff,
    title: raw.questionName,
    description: raw.question,
    examples,
    constraints: [],
    testCases,
    hints: [],
    topic: "DSA",
    functionName: "solve",
    templates: startersForQuestionNumber(raw.questionNumber ?? bankIndexZeroBased + 1),
  };
}

// Import question data - stored as JSON-like for brevity
export const rawDSAQuestions: RawDSAQuestion[] = [
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
    questionNumber: 1,
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
      { input: "3\n2 3 5\n1 2\n2 3", output: "2 1 0" },
      { input: "1\n1", output: "1" },
      { input: "2\n1 2\n1 2", output: "2 0" },
      { input: "2\n3 5\n1 2", output: "1 0" },
      { input: "3\n1 1 1\n1 2\n2 3", output: "3 2 1" },
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
      { input: "5", output: "4" },
      { input: "1", output: "1" },
      { input: "3", output: "2" },
      { input: "4", output: "3" },
      { input: "10", output: "28" },
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
      { input: "1\n8\n5", output: "false" },
      { input: "2\n3 5\n8", output: "true" },
      { input: "2\n1 1\n2", output: "true" },
      { input: "3\n1 2 3\n6", output: "true" },
      { input: "1\n0\n0", output: "true" },
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
      { input: "5\n-1 -50 -20 -5 -100\n10", output: "2" },
      { input: "1\n-5\n3", output: "0" },
      { input: "4\n-10 -20 -30 -5\n8", output: "1" },
      { input: "2\n-100 -1\n50", output: "0" },
      { input: "6\n-3 1 -9 2 -7 -2\n4", output: "4" },
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
      { input: "7\nX V XV NULL NULL NULL NULL\nIX", output: "Not Found" },
      { input: "7\nX V XV NULL NULL NULL NULL\nX", output: "Found" },
      { input: "7\nX V XV NULL NULL NULL NULL\nXV", output: "Found" },
      { input: "7\nX V XV NULL NULL NULL NULL\nI", output: "Not Found" },
      { input: "7\nX V XV NULL NULL NULL NULL\nM", output: "Not Found" },
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
      { input: "3 1\n1 4 2\n1 3", output: "NO" },
      { input: "2 1\n10 10\n1 2", output: "YES" },
      { input: "4 1\n1 2 3 10\n1 4", output: "YES" },
      { input: "5 1\n1 1 1 1 1\n1 5", output: "YES" },
      { input: "3 1\n5 1 5\n1 3", output: "NO" },
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
      { input: "7 11", output: "-1" },
      { input: "8 12", output: "2 2" },
      { input: "9 15", output: "-1" },
      { input: "15 20", output: "3 2" },
      { input: "4 6", output: "2 2" },
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
      { input: "4\n12 15 18 9", output: "9" },
      { input: "5\n1 2 3 4 6", output: "2" },
      { input: "3\n6 9 12", output: "12" },
      { input: "4\n4 4 4 4", output: "4" },
      { input: "5\n10 20 30 40 50", output: "10" },
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
      { input: "3\n1 -1 -1", output: "-1 -1 -1" },
      { input: "1\n5", output: "-1" },
      { input: "7\n1 2 3 4 5 6 7", output: "-1 -1 -1 -1 -1 -1 -1" },
      { input: "3\n10 20 -1", output: "-1 -1 -1" },
      { input: "3\n5 -1 -1", output: "-1 -1 -1" },
      { input: "4\n1 2 3 4", output: "-1 -1 -1 -1" },
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
      { input: "3 2\n2 2 2", output: "0" },
      { input: "1 3\n8", output: "1" },
      { input: "2 2\n1 1", output: "1" },
      { input: "3 2\n3 3 3", output: "0" },
      { input: "4 2\n2 2 2 2", output: "3" },
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
      { input: "5\n3\n1 2 3 4 5", output: "3 1 5 5" },
      { input: "5\n1\n1 2 3 4 5", output: "1 2 5 5" },
      { input: "3\n1\n1 2 3", output: "1 2 3 3" },
      { input: "4\n1\n1 2 1 2", output: "1 2 2" },
      { input: "4\n2\n1 2 3 4", output: "2 4 4" },
      { input: "3\n2\n1 2 3", output: "2 1 3 3" },
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
      { input: "4 100 4", output: "15" },
      { input: "4 100 3", output: "17" },
      { input: "4 100 4", output: "15" },
      { input: "4 100 3", output: "17" },
      { input: "4 100 4", output: "15" },
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
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
      { input: "4\n1 2 -1,2 3 1,3 4 -1,4 -1 -1\n4\njump next jump next", output: "1 2 1 2" },
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
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
      { input: "6\n3\nA B C D E F\n10\n1 0 1 1 1 0 1 0 1 1", output: "A C D E\nB F" },
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
      {
        input: "3\nCSE:3,4,2,2,2,2,3,1\nIT:2,3,3,2,1,4,2,3\nMECH:1,2,2,3,3,1,2,2",
        output: "CSE:10:9\nIT:8:12\nMECH:8:8\nCSE 10\nIT 12",
      },
      { input: "1\nEE:1,1,1,1,0,0,0,0", output: "EE:2:2\nEE 2\nEE 2" },
      { input: "2\nCS:2,0,0,0,0,0,0,0\nEE:0,0,1,1,0,0,0,0", output: "CS:2:0\nEE:1:1\nCS 2\nEE 1" },
      { input: "1\nX:0,0,0,0,0,0,0,1", output: "X:0:1\nX 0\nX 1" },
      { input: "2\nA:1,1,1,1,1,1,1,1\nB:0,0,0,0,0,0,0,0", output: "A:4:4\nB:0:0\nA 4\nA 4" },
      { input: "1\nSOLO:5,5,5,5,5,5,5,5", output: "SOLO:20:20\nSOLO 20\nSOLO 20" },
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
      {
        language: "JavaScript", languageCode: "javascript", code: `function solve(n, k, a) {
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
      {
        language: "Python", languageCode: "python", code: `def solve(n, k, a):
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
      { input: "1 0\n0", output: "0" },
      { input: "3 2\n0 1 3", output: "0" },
      { input: "4 4\n0 1 2 3", output: "0" },
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
      {
        language: "Python", languageCode: "python", code: `class Solution:
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
      { input: "2\n3 3", output: "0" },
      { input: "3\n1 2 6", output: "3" },
      { input: "5\n5 5 5 5 5", output: "0" },
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
      {
        language: "Python", languageCode: "python", code: `class Solution:
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
      { input: "1\n5\n0", output: "5" },
      { input: "3\n1 1 1\n1", output: "2" },
      { input: "4\n1 2 3 4\n2", output: "4" },
      { input: "5\n2 2 2 2 2\n2", output: "4" },
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
      {
        language: "Python", languageCode: "python", code: `class Solution:
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
      {
        language: "Python", languageCode: "python", code: `def min_buckets(n, c, arr):
    # code here
    return -1

n, c = map(int, input().split())
arr = list(map(int, input().split()))
print(min_buckets(n, c, arr))` },
    ],
    testCases: [
      { input: "5 10\n4 2 7 5 9", output: "2" },
      { input: "4 15\n5 3 4 6", output: "-1" },
      { input: "3 5\n2 2 2", output: "-1" },
      { input: "3 8\n3 1 5", output: "2" },
      { input: "4 12\n6 2 5 3", output: "-1" },
      { input: "5 20\n10 10 10 10 10", output: "2" },
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
      {
        language: "Python", languageCode: "python", code: `def findremaining(n, m, s, queries):
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
      { input: "3 3\n123 453 243\n543", output: "1 2 #" },
      { input: "3 3\n123 453 243\n2", output: "1 5 3" },
      { input: "3 3\n123 453 243\n543", output: "1 2 #" },
      { input: "3 3\n123 453 243\n2", output: "1 5 3" },
    ],
    questionNumber: 22,
  },
  {
    questionType: "Easy",
    questionName: "Game winner",
    question: `A gaming tournament stores the scores of players in an array called nums. 
Your task is to find the highest score achieved among all players.

Given an array of integers nums, return the value of the largest element present in the array.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "4\n3 3 6 1", output: "6" },
      { input: "5\n3 3 0 99 -40", output: "99" },
      { input: "1\n7", output: "7" },
      { input: "5\n-1 -5 -3 -2 -8", output: "-1" },
      { input: "6\n1 2 3 4 5 6", output: "6" },
      { input: "5\n10 10 10 10 10", output: "10" }
    ],

    questionNumber: 23
  },
  {
    questionType: "Easy",

    questionName: "Push Empty Boxes",

    question: `A warehouse conveyor belt is represented using an integer array nums. 
Non-zero numbers represent boxes with items, while 0 represents an empty box.

Your task is to move all empty boxes (0's) to the end of the conveyor belt while keeping the relative order of the non-empty boxes the same.

The operation must be performed in place without creating a copy of the array.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "6\n0 1 4 0 5 2", output: "1 4 5 2 0 0" },
      { input: "6\n0 0 0 1 3 -2", output: "1 3 -2 0 0 0" },
      { input: "5\n1 2 3 4 5", output: "1 2 3 4 5" },
      { input: "4\n0 0 1 0", output: "1 0 0 0" },
      { input: "3\n7 0 8", output: "7 8 0" },
      { input: "5\n0 2 0 3 0", output: "2 3 0 0 0" }
    ],

    questionNumber: 24
  },
  {
    questionType: "Easy",

    questionName: "Find Book Range",

    question: `A library stores book IDs in a sorted array nums arranged in non-decreasing order. 
You are given a target book ID, and your task is to find the first and last position where this book appears in the shelf list.

If the target book ID does not exist in the array, return [-1, -1].`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "6\n5 7 7 8 8 10\n8", output: "3 4" },
      { input: "6\n5 7 7 8 8 10\n6", output: "-1 -1" },
      { input: "5\n1 2 2 2 3\n2", output: "1 3" },
      { input: "4\n4 4 4 4\n4", output: "0 3" },
      { input: "5\n1 3 5 7 9\n1", output: "0 0" },
      { input: "3\n2 4 6\n5", output: "-1 -1" }
    ],

    questionNumber: 25
  },
  {
    questionType: "Easy",

    questionName: "Broken Clock Shift",

    question: `A digital clock stores its scheduled alarms in a sorted array nums containing distinct integers. 
Due to a system glitch, the array has been rotated to the right several times.

Your task is to determine how many right rotations were performed on the original sorted array.

The number of rotations will always be between 0 and n-1.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "8\n4 5 6 7 0 1 2 3", output: "4" },
      { input: "5\n3 4 5 1 2", output: "3" },
      { input: "5\n1 2 3 4 5", output: "0" },
      { input: "6\n5 6 1 2 3 4", output: "2" },
      { input: "4\n2 3 4 1", output: "3" },
      { input: "7\n7 1 2 3 4 5 6", output: "1" }
    ],

    questionNumber: 26
  },
  {
    questionType: "Easy",

    questionName: "Reverse Secret Message",

    question: `A spy agency stores secret messages as strings. 
Your task is to reverse the given message so the agents can decode it correctly.

Given a string s, return the reversed version of the string.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, s):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "hello", output: "olleh" },
      { input: "code", output: "edoc" },
      { input: "a", output: "a" },
      { input: "race", output: "ecar" },
      { input: "1234", output: "4321" },
      { input: "python", output: "nohtyp" }
    ],

    questionNumber: 27
  },
  {
    questionType: "Easy",

    questionName: "Climbing Stairs",

    question: `A child is climbing a staircase with n steps. 
The child can either climb 1 step or 2 steps at a time.

Find the total number of distinct ways the child can reach the top.`,

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
      { input: "1", output: "1" },
      { input: "2", output: "2" },
      { input: "3", output: "3" },
      { input: "4", output: "5" },
      { input: "5", output: "8" },
      { input: "6", output: "13" }
    ],

    questionNumber: 28
  },
  {
    questionType: "Easy",

    questionName: "Single Light Bulb",

    question: `In a hallway, every light bulb appears exactly twice except one bulb which appears only once.

Given an integer array nums, find and return the number that appears only once.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "5\n2 1 2 4 1", output: "4" },
      { input: "3\n7 8 7", output: "8" },
      { input: "1\n5", output: "5" },
      { input: "7\n1 2 3 2 1 4 4", output: "3" },
      { input: "5\n9 6 6 9 8", output: "8" },
      { input: "3\n0 1 0", output: "1" }
    ],

    questionNumber: 29
  },

  {
    questionType: "Easy",

    questionName: "Longest Fruit Basket",

    question: `A farmer collects fruits in a row represented by an array nums. 
You can collect fruits from a continuous segment, but you are allowed to keep at most 2 different types of fruits.

Find the length of the longest valid continuous segment.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "5\n1 2 1 2 3", output: "4" },
      { input: "3\n1 2 1", output: "3" },
      { input: "6\n1 2 3 2 2 1", output: "4" },
      { input: "4\n4 4 4 4", output: "4" },
      { input: "5\n1 2 3 4 5", output: "2" },
      { input: "7\n1 1 2 2 3 3 2", output: "4" }
    ],

    questionNumber: 30
  }
  ,
  {
    questionType: "Easy",

    questionName: "K Smallest Gifts",

    question: `A store owner has a collection of gift prices represented in an array nums. 
Your task is to find the k smallest gift prices in ascending order.

Return the k smallest elements.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "5\n5 1 3 2 4\n2", output: "1 2" },
      { input: "4\n9 7 8 6\n3", output: "6 7 8" },
      { input: "3\n1 2 3\n1", output: "1" },
      { input: "6\n10 5 2 8 1 3\n4", output: "1 2 3 5" },
      { input: "5\n4 4 2 2 1\n2", output: "1 2" },
      { input: "4\n7 6 5 4\n4", output: "4 5 6 7" }
    ],

    questionNumber: 31
  },
  {
    questionType: "Easy",

    questionName: "Minimum Coins for Candy",

    question: `A child wants to buy candies costing amount n. 
You are given coin values [1, 2, 5, 10]. 

Find the minimum number of coins required to make the exact amount.`,

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
      { input: "1", output: "1" },
      { input: "7", output: "2" },
      { input: "14", output: "3" },
      { input: "20", output: "2" },
      { input: "28", output: "5" },
      { input: "3", output: "2" }
    ],

    questionNumber: 32
  },
  {
    questionType: "Hard",

    questionName: "Twin River Water Balance",

    question: `Two ancient kingdoms store water measurements from their rivers in two separate sorted arrays riverA and riverB. 
Each value represents the water level recorded during a specific time period.

The royal engineers want to determine the central balanced water level after combining both records together.

Your task is to return the median value of the combined sorted measurements.

The overall time complexity of your solution should be O(log(m + n)).`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, riverA, riverB):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "2\n1 3\n1\n2",
        output: "2.0"
      },
      {
        input: "2\n1 2\n2\n3 4",
        output: "2.5"
      },
      {
        input: "3\n1 5 9\n4\n2 3 7 10",
        output: "5.0"
      },
      {
        input: "1\n100\n5\n1 2 3 4 5",
        output: "3.5"
      },
      {
        input: "0\n\n4\n2 4 6 8",
        output: "5.0"
      },
      {
        input: "5\n-5 -3 -1 0 2\n4\n3 6 8 10",
        output: "2.0"
      }
    ],

    questionNumber: 33
  },

  {
    questionType: "Hard",

    questionName: "Signal Distortion Count",

    question: `A futuristic communication system records signal strengths in an array signals.

A distortion occurs between two signals when an earlier signal is more than twice as strong as a later signal.

Formally, a distortion pair is defined as a pair (i, j) such that:

- 0 <= i < j < signals.length
- signals[i] > 2 * signals[j]

Your task is to determine the total number of distortion pairs present in the array.

The solution should be efficient enough to handle very large arrays.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, signals):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "5\n1 3 2 3 1",
        output: "2"
      },
      {
        input: "5\n2 4 3 5 1",
        output: "3"
      },
      {
        input: "6\n10 5 2 1 0 0",
        output: "13"
      },
      {
        input: "5\n1 2 3 4 5",
        output: "0"
      },
      {
        input: "5\n5 4 3 2 1",
        output: "4"
      },
      {
        input: "7\n40 25 19 8 4 2 1",
        output: "15"
      }
    ],

    questionNumber: 34
  },

  {
    questionType: "Hard",

    questionName: "Treasure Route Diversity",

    question: `An explorer is traveling through a long route of treasure zones represented by the array routes.

Each number represents a type of treasure found in that zone.

A route segment is considered valuable if it contains exactly k distinct treasure types.

Your task is to count the total number of valuable contiguous route segments.

A segment must consist of consecutive zones only.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, routes, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "5\n1 2 1 2 3\n2",
        output: "7"
      },
      {
        input: "5\n1 2 1 3 4\n3",
        output: "3"
      },
      {
        input: "6\n1 1 1 1 1 1\n1",
        output: "21"
      },
      {
        input: "7\n1 2 3 4 5 6 7\n4",
        output: "4"
      },
      {
        input: "8\n2 1 2 1 3 4 3 2\n3",
        output: "10"
      },
      {
        input: "5\n1 2 3 4 5\n2",
        output: "4"
      }
    ],

    questionNumber: 35
  },

  {
    questionType: "Hard",

    questionName: "Magic Spell Conversion",

    question: `In an ancient kingdom, wizards can transform one magic spell into another by changing exactly one character at a time.

You are given:
- a starting spell startSpell
- a target spell targetSpell
- a spell book spellBook containing valid spells

A valid transformation sequence must follow these rules:

- Only one character can be changed in each step.
- Every intermediate spell must exist in spellBook.
- The final spell must become targetSpell.

Your task is to find the length of the shortest possible transformation sequence.

If no valid sequence exists, return 0.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, startSpell, targetSpell, spellBook):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "hit\ncog\n6\nhot dot dog lot log cog",
        output: "5"
      },
      {
        input: "hit\ncog\n5\nhot dot dog lot log",
        output: "0"
      },
      {
        input: "cat\ndog\n6\ncot cog dog dat dot dag",
        output: "4"
      },
      {
        input: "aaa\nbbb\n5\naab abb bab bbb baa",
        output: "4"
      },
      {
        input: "game\nthem\n8\ngame came case cash dash dish this them",
        output: "0"
      },
      {
        input: "lost\ncost\n5\nmost cost host post lost",
        output: "2"
      }
    ],

    questionNumber: 36
  },

  {
    questionType: "Hard",

    questionName: "Portal Path Chronicles",

    question: `A group of adventurers travels through magical portals to reach a hidden kingdom.

Each portal code is represented by a word. 
The adventurers can move from one portal to another only if the two portal codes differ by exactly one character.

You are given:
- a starting portal startPortal
- a destination portal endPortal
- a list of valid portal codes portalBook

Your task is to find all shortest possible transformation paths from startPortal to endPortal.

Rules:
- Only one character may change at each step.
- Every intermediate portal code must exist in portalBook.
- Each returned path must represent one of the shortest valid sequences.

If no valid sequence exists, return an empty list.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, startPortal, endPortal, portalBook):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "hit\ncog\n6\nhot dot dog lot log cog",
        output: "[['hit','hot','dot','dog','cog'],['hit','hot','lot','log','cog']]"
      },
      {
        input: "hit\ncog\n5\nhot dot dog lot log",
        output: "[]"
      },
      {
        input: "cat\ndog\n6\ncot cog dog dat dot dag",
        output: "[['cat','cot','cog','dog'],['cat','dat','dot','dog']]"
      },
      {
        input: "aaa\nbbb\n5\naab abb bab bbb baa",
        output: "[['aaa','aab','abb','bbb'],['aaa','baa','bab','bbb']]"
      },
      {
        input: "lost\ncost\n5\nmost cost host post lost",
        output: "[['lost','cost']]"
      },
      {
        input: "red\ntax\n8\nted tex red tax tad den rex pee",
        output: "[['red','ted','tad','tax'],['red','ted','tex','tax'],['red','rex','tex','tax']]"
      }
    ],

    questionNumber: 37
  },

  {
    questionType: "Hard",

    questionName: "Flooded Temple Escape",

    question: `An ancient temple is represented as an n x n grid temple, where each cell contains a unique elevation value.

Heavy rain begins to flood the temple. 
At time t, the water level rises to t, meaning you may only travel through cells whose elevation is less than or equal to t.

You begin at the top-left chamber (0, 0) and must reach the sacred exit at the bottom-right chamber (n - 1, n - 1).

You may move only in four directions:
- up
- down
- left
- right

Your task is to determine the minimum time required before a path exists from the entrance to the exit.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, temple):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "2\n0 2\n1 3",
        output: "3"
      },
      {
        input: "5\n0 1 2 3 4\n24 23 22 21 5\n12 13 14 15 16\n11 17 18 19 20\n10 9 8 7 6",
        output: "16"
      },
      {
        input: "3\n0 1 2\n3 4 5\n6 7 8",
        output: "8"
      },
      {
        input: "3\n0 8 2\n1 7 3\n4 5 6",
        output: "6"
      },
      {
        input: "4\n0 2 1 3\n5 4 7 6\n8 9 10 11\n15 14 13 12",
        output: "12"
      },
      {
        input: "1\n0",
        output: "0"
      }
    ],

    questionNumber: 38
  },

  {
    questionType: "Hard",

    questionName: "Sacred Scroll Division",

    question: `A sacred scroll contains a magical string text.

The royal scholars want to divide the scroll into multiple sections such that every section reads the same forwards and backwards.

In other words, every resulting substring must be a palindrome.

Your task is to determine the minimum number of cuts required to divide the scroll according to these rules.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, text):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "aab",
        output: "1"
      },
      {
        input: "a",
        output: "0"
      },
      {
        input: "ab",
        output: "1"
      },
      {
        input: "racecar",
        output: "0"
      },
      {
        input: "banana",
        output: "1"
      },
      {
        input: "abcde",
        output: "4"
      }
    ],

    questionNumber: 39
  },

  {
    questionType: "Hard",

    questionName: "Laser Beam Barrier",

    question: `A giant energy barrier of length n protects a futuristic city.

Engineers must perform energy cuts at specific positions given in the array checkpoints.

You may perform the cuts in any order.

Whenever a cut is made, the cost equals the current length of the barrier segment being cut.

After each cut, the segment splits into two smaller independent segments.

Your task is to determine the minimum total energy cost required to complete all cuts.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, n, checkpoints):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "7\n4\n1 3 4 5",
        output: "16"
      },
      {
        input: "9\n5\n5 6 1 4 2",
        output: "22"
      },
      {
        input: "10\n3\n2 4 7",
        output: "20"
      },
      {
        input: "8\n2\n3 6",
        output: "14"
      },
      {
        input: "20\n4\n2 8 10 12",
        output: "42"
      },
      {
        input: "5\n1\n2",
        output: "5"
      }
    ],

    questionNumber: 40
  },

  {
    questionType: "Hard",

    questionName: "Crystal Orb Harvest",

    question: `A wizard has arranged several magical crystal orbs in a line, represented by the array orbs.

Each orb contains an energy value.

When you destroy the ith orb, you gain energy equal to:

orbs[i - 1] * orbs[i] * orbs[i + 1]

If there is no orb on the left or right side, assume there is an imaginary orb with value 1.

After destroying an orb, the remaining orbs become adjacent.

Your task is to determine the maximum energy that can be collected by destroying the orbs in the best possible order.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, orbs):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "4\n3 1 5 8",
        output: "167"
      },
      {
        input: "2\n1 5",
        output: "10"
      },
      {
        input: "4\n1 2 3 4",
        output: "40"
      },
      {
        input: "3\n7 9 8",
        output: "576"
      },
      {
        input: "5\n2 4 3 5 1",
        output: "120"
      },
      {
        input: "1\n10",
        output: "10"
      }
    ],

    questionNumber: 41
  },

  {
    questionType: "Hard",

    questionName: "Mirror Rune Restoration",

    question: `A mysterious rune sequence is written on an ancient wall as a string rune.

The kingdom's scholars want to restore symmetry to the rune by inserting additional characters anywhere in the sequence.

A rune is considered perfectly restored if it reads the same forward and backward.

In one operation, you may insert exactly one character at any position in the string.

Your task is to determine the minimum number of insertions required to make the rune perfectly symmetric.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, rune):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      {
        input: "zzazz",
        output: "0"
      },
      {
        input: "mbadm",
        output: "2"
      },
      {
        input: "leetcode",
        output: "5"
      },
      {
        input: "race",
        output: "3"
      },
      {
        input: "aabb",
        output: "2"
      },
      {
        input: "abcda",
        output: "2"
      }
    ],

    questionNumber: 42
  },
  {
    questionType: "Medium",

    questionName: "Minimum Eating Speed",

    question: `A monkey has several banana piles stored in an array piles. 
The monkey can decide an eating speed k, meaning it eats k bananas per hour from a single pile.

Find the minimum eating speed needed so that all bananas are eaten within h hours.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, piles, h):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "4\n3 6 7 11\n8", output: "4" },
      { input: "5\n30 11 23 4 20\n5", output: "30" },
      { input: "5\n30 11 23 4 20\n6", output: "23" },
      { input: "3\n5 5 5\n3", output: "5" },
      { input: "4\n1 2 3 4\n4", output: "4" },
      { input: "1\n10\n5", output: "2" }
    ],

    questionNumber: 43
  },
  {
    questionType: "Medium",

    questionName: "Longest Unique Signal",

    question: `A communication system sends signals represented as a string s. 
Find the length of the longest substring that contains no repeating characters.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, s):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "abcabcbb", output: "3" },
      { input: "bbbbb", output: "1" },
      { input: "pwwkew", output: "3" },
      { input: "abcdef", output: "6" },
      { input: "aab", output: "2" },
      { input: "dvdf", output: "3" }
    ],

    questionNumber: 44
  },
  {
    questionType: "Medium",

    questionName: "Closest Numbers Stream",

    question: `A data center continuously receives numbers in an array nums. 
Find the k largest numbers and return them in descending order.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "5\n3 1 5 2 4\n2", output: "5 4" },
      { input: "6\n10 9 8 7 6 5\n3", output: "10 9 8" },
      { input: "4\n1 1 1 1\n2", output: "1 1" },
      { input: "5\n7 2 9 4 1\n1", output: "9" },
      { input: "3\n5 6 7\n3", output: "7 6 5" },
      { input: "5\n8 3 2 10 6\n2", output: "10 8" }
    ],

    questionNumber: 45
  },
  {
    questionType: "Medium",

    questionName: "Smallest Window Sum",

    question: `A delivery truck records package weights in an array nums. 
Find the length of the smallest continuous subarray whose sum is greater than or equal to target.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "6\n2 3 1 2 4 3\n7", output: "2" },
      { input: "5\n1 1 1 1 1\n3", output: "3" },
      { input: "4\n1 4 4 1\n4", output: "1" },
      { input: "3\n1 2 3\n6", output: "3" },
      { input: "5\n5 1 1 1 1\n5", output: "1" },
      { input: "4\n1 2 1 1\n5", output: "-1" }
    ],

    questionNumber: 46
  },
  {
    questionType: "Medium",

    questionName: "Boats for Rescue",

    question: `A rescue team must evacuate people using boats. 
Each boat can carry at most 2 people and has a weight limit.

Given an array people and an integer limit, return the minimum number of boats required.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, people, limit):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "4\n3 2 2 1\n3", output: "3" },
      { input: "4\n1 2 2 3\n3", output: "3" },
      { input: "3\n3 5 3\n5", output: "3" },
      { input: "5\n1 1 1 1 1\n2", output: "3" },
      { input: "2\n2 2\n3", output: "2" },
      { input: "4\n1 2 3 4\n5", output: "2" }
    ],

    questionNumber: 47
  },
  {
    questionType: "Medium",

    questionName: "Next Greater Building",

    question: `A city skyline is represented using an array heights. 
For every building, find the next building to its right that is taller.

If no such building exists, return -1 for that position.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, heights):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "4\n2 1 2 4", output: "4 2 4 -1" },
      { input: "5\n1 3 2 4 1", output: "3 4 4 -1 -1" },
      { input: "3\n5 4 3", output: "-1 -1 -1" },
      { input: "4\n1 2 3 4", output: "2 3 4 -1" },
      { input: "5\n2 2 2 2 2", output: "-1 -1 -1 -1 -1" },
      { input: "4\n4 1 3 2", output: "-1 3 -1 -1" }
    ],

    questionNumber: 48
  },
  {
    questionType: "Medium",

    questionName: "First Negative in Window",

    question: `A weather station records temperature changes in an array nums. 
For every window of size k, find the first negative number in that window.

If a window does not contain a negative number, return 0.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "5\n-1 2 -3 4 5\n2", output: "-1 -3 -3 0" },
      { input: "6\n1 2 3 4 5 6\n3", output: "0 0 0 0" },
      { input: "5\n-5 -2 3 1 -1\n3", output: "-5 -2 -1" },
      { input: "4\n1 -1 2 -2\n2", output: "-1 -1 -2" },
      { input: "3\n-1 -2 -3\n2", output: "-1 -2" },
      { input: "5\n2 3 -1 4 -2\n3", output: "-1 -1 -1" }
    ],

    questionNumber: 49
  },
  {
    questionType: "Medium",

    questionName: "Minimum Pages Allocation",

    question: `A teacher wants to distribute books among students. 
Each book has a certain number of pages stored in nums.

Allocate books in continuous order such that the maximum pages assigned to a student is minimized.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums, students):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "4\n12 34 67 90\n2", output: "113" },
      { input: "4\n10 20 30 40\n2", output: "60" },
      { input: "3\n5 10 15\n1", output: "30" },
      { input: "5\n10 10 10 10 10\n5", output: "10" },
      { input: "4\n5 5 5 5\n2", output: "10" },
      { input: "3\n7 2 5\n2", output: "7" }
    ],

    questionNumber: 50
  },
  {
    questionType: "Medium",

    questionName: "Remove Adjacent Duplicates",

    question: `A machine processes strings one character at a time. 
Whenever two adjacent characters become equal, both are removed.

Return the final string after repeatedly removing adjacent duplicates.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, s):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "abbaca", output: "ca" },
      { input: "azxxzy", output: "ay" },
      { input: "aaaa", output: "" },
      { input: "abc", output: "abc" },
      { input: "aabccb", output: "" },
      { input: "mississippi", output: "m" }
    ],

    questionNumber: 51
  },
  {
    questionType: "Medium",

    questionName: "Longest Repeating Replacement",

    question: `A typing software stores text as a string s. 
You can replace at most k characters in the string.

Find the length of the longest substring that can be made of the same character after replacements.`,

    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, s, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],

    testCases: [
      { input: "ABAB\n2", output: "4" },
      { input: "AABABBA\n1", output: "4" },
      { input: "AAAA\n2", output: "4" },
      { input: "ABCDE\n1", output: "2" },
      { input: "BAAA\n0", output: "3" },
      { input: "ABBB\n2", output: "4" }
    ],

    questionNumber: 52
  },
];

export function getNewDSAQuestions(): DSAQuestion[] {
  return rawDSAQuestions.map((raw, i) =>
    convertToDSAQuestion(raw, `DSA_NEW_${String(i + 1).padStart(3, "0")}`, i)
  );
}
