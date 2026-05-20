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
  scoreConfig: DSAScoreConfig;
  followUpQuestions: DSAFollowUpQuestion[];
};

type FollowUpOptionLabel = "A" | "B" | "C" | "D";

type DSAFollowUpQuestion = {
  question: string;
  options: Array<{ label: FollowUpOptionLabel; text: string }>;
  correctAnswer: FollowUpOptionLabel;
  explanation: string;
  scorePercentage: 10;
};

type DSAScoreConfig = {
  codingScorePercentage: 70;
  followUpScorePercentage: 30;
  eachFollowUpQuestionPercentage: 10;
};

const DSA_SCORE_CONFIG: DSAScoreConfig = {
  codingScorePercentage: 70,
  followUpScorePercentage: 30,
  eachFollowUpQuestionPercentage: 10,
};

export interface RawDSAQuestion {
  questionType: string;
  questionName: string;
  question: string;
  preBuiltFunction: { language: string; languageCode: string; code: string }[];
  testCases: { input: string; output: string }[];
  scoreConfig?: DSAScoreConfig;
  followUpQuestions?: DSAFollowUpQuestion[];
  questionNumber?: number;
}

function q(
  question: string,
  options: Array<{ label: FollowUpOptionLabel; text: string }>,
  correctAnswer: FollowUpOptionLabel,
  explanation: string
): DSAFollowUpQuestion {
  return { question, options, correctAnswer, explanation, scorePercentage: 10 };
}

const DSA_FOLLOW_UPS_BY_QUESTION_NUMBER: Record<number, DSAFollowUpQuestion[]> = {
  1: [
    q("Why does the matrix construction need a set of characters already used from S?", [{ label: "A", text: "To skip those letters when filling remaining cells from a to z" }, { label: "B", text: "To sort the matrix rows alphabetically" }, { label: "C", text: "To remove duplicate words from the sentence" }, { label: "D", text: "To decide whether a word can be searched diagonally" }], "A", "The filler alphabet must skip letters already present in S, so a set gives fast membership checks."),
    q("What is the expected time complexity if the matrix has R*C cells and the sentence has w words of average length L?", [{ label: "A", text: "O(R*C + w*L), after constructing the matrix and checking each word horizontally/vertically" }, { label: "B", text: "O((R*C)^2) because every cell must be compared with every other cell" }, { label: "C", text: "O(w log w) because words must be sorted first" }, { label: "D", text: "O(1) because the matrix size is fixed in all cases" }], "A", "The solution fills the matrix once and checks each word along rows/columns without pairwise cell comparisons."),
    q("Which edge case is most important for correctness?", [{ label: "A", text: "S has more characters than the matrix can hold" }, { label: "B", text: "S is too short, so filler letters must continue while skipping letters from S" }, { label: "C", text: "The sentence contains only uppercase words" }, { label: "D", text: "The matrix must be searched diagonally before horizontally" }], "B", "The special filler rule is easy to mishandle when S does not fill the entire matrix."),
  ],
  2: [
    q("What state is most useful while processing subtree GCD groups?", [{ label: "A", text: "Only the maximum value in the subtree" }, { label: "B", text: "Possible GCD values formed by descendant groups and their counts" }, { label: "C", text: "The sorted order of all node labels" }, { label: "D", text: "The depth of the root only" }], "B", "Combining children requires knowing which GCD values can be formed and how often they occur."),
    q("Why can recomputing every subtree from scratch be too slow?", [{ label: "A", text: "It can revisit the same descendant sets repeatedly, leading toward O(n^2) behavior" }, { label: "B", text: "It changes the tree structure permanently" }, { label: "C", text: "It cannot compute GCD values" }, { label: "D", text: "It only works for binary trees" }], "A", "A bottom-up DFS reuses child information instead of rebuilding each subtree calculation."),
    q("Which edge case should return a positive count for a single node?", [{ label: "A", text: "A single node with value 1" }, { label: "B", text: "A single node with value 5" }, { label: "C", text: "A two-node tree with no edge" }, { label: "D", text: "Any leaf node with an even value" }], "A", "A group containing only value 1 has GCD 1, so it forms a perfect group."),
  ],
  3: [
    q("What recurrence represents the number of ways to reach step n?", [{ label: "A", text: "dp[n] = dp[n-1] + dp[n-3]" }, { label: "B", text: "dp[n] = dp[n-1] + dp[n-2]" }, { label: "C", text: "dp[n] = n * dp[n-1]" }, { label: "D", text: "dp[n] = dp[n/3]" }], "A", "The peacock can arrive from n-1 by a 1-step jump or from n-3 by a 3-step flight."),
    q("Why should modulo 10^9+7 be applied during computation?", [{ label: "A", text: "To keep intermediate counts bounded while preserving the final modular answer" }, { label: "B", text: "To remove invalid jumps" }, { label: "C", text: "To sort the DP array" }, { label: "D", text: "To convert recursion into binary search" }], "A", "The number of ways grows quickly, so applying the modulus at each transition avoids overflow."),
    q("Which base case is required for this problem?", [{ label: "A", text: "dp[0] = 1, representing one way to stand at the starting point" }, { label: "B", text: "dp[0] = 0, because no jump was made" }, { label: "C", text: "dp[1] = 0, because 3-step flights are not possible" }, { label: "D", text: "dp[n] is always n" }], "A", "The empty path is the base from which valid jumps are counted."),
  ],
  4: [
    q("What algorithmic technique is most suitable for trying subsets, orders, and arithmetic results?", [{ label: "A", text: "Backtracking with memoization over used elements and reachable values" }, { label: "B", text: "A single left-to-right greedy scan" }, { label: "C", text: "Binary search on the target value" }, { label: "D", text: "Counting character frequencies" }], "A", "The expression space branches heavily, so memoizing states prevents repeated exploration."),
    q("Why must division be checked carefully?", [{ label: "A", text: "Division is valid only when it produces an integer and avoids division by zero" }, { label: "B", text: "Division should always be rounded down" }, { label: "C", text: "Division is equivalent to subtraction here" }, { label: "D", text: "Division can be ignored because multiplication covers it" }], "A", "The problem explicitly permits only integer division results, and zero divisors are invalid."),
    q("What is the main complexity risk in this problem?", [{ label: "A", text: "The number of subset/order/operator combinations can grow exponentially" }, { label: "B", text: "The input must be sorted after every operator" }, { label: "C", text: "Hash lookup is always O(n^2)" }, { label: "D", text: "Only one expression is possible" }], "A", "The search space is combinatorial, so pruning and memoization are essential."),
  ],
  5: [
    q("What condition must an array element satisfy to be considered?", [{ label: "A", text: "It must be negative and abs(value) must be strictly greater than x" }, { label: "B", text: "It must be positive and greater than x" }, { label: "C", text: "It must be the smallest absolute value" }, { label: "D", text: "It must appear at an even index" }], "A", "The problem asks specifically for a negative element whose absolute value is strictly greater than x."),
    q("What is the expected time complexity of the direct solution?", [{ label: "A", text: "O(n), scanning the array once" }, { label: "B", text: "O(log n), because the array is guaranteed sorted" }, { label: "C", text: "O(n^2), because every pair is checked" }, { label: "D", text: "O(1), because only the first element matters" }], "A", "A single pass is enough to locate the nearest valid index under the intended interpretation."),
    q("Which edge case should return -1?", [{ label: "A", text: "No negative element has absolute value greater than x" }, { label: "B", text: "The first element is negative" }, { label: "C", text: "The array has an odd length" }, { label: "D", text: "x is positive" }], "A", "If no element satisfies the condition, the required output is -1."),
  ],
  6: [
    q("Why should Roman numerals be converted to integer values before BST comparison?", [{ label: "A", text: "The BST ordering is based on numeric Roman value, not lexicographic string order" }, { label: "B", text: "Roman numerals cannot be stored in tree nodes" }, { label: "C", text: "It makes every search O(n)" }, { label: "D", text: "It removes the need to traverse the tree" }], "A", "A BST decision must compare the target's integer value with the node's integer value."),
    q("What is the expected search complexity in a balanced BST after conversion?", [{ label: "A", text: "O(log n) tree steps, plus Roman conversion cost per compared value" }, { label: "B", text: "O(n^2), because every node compares with every other node" }, { label: "C", text: "O(1), because the root is always the answer" }, { label: "D", text: "O(n log n), because nodes must be sorted first" }], "A", "A balanced BST halves the remaining search space at each step."),
    q("Which edge case is important for correctness?", [{ label: "A", text: "A target like IX whose numeric value falls between existing nodes but is absent" }, { label: "B", text: "Only targets larger than M" }, { label: "C", text: "A tree where all NULL tokens are ignored as valid Roman numerals" }, { label: "D", text: "Comparing Roman strings alphabetically" }], "A", "The search must return Not Found even when the target would fit between existing values."),
  ],
  7: [
    q("What condition makes |arr[i]-arr[j]| equal to the sum of adjacent absolute differences?", [{ label: "A", text: "The segment is monotonic between i and j" }, { label: "B", text: "The segment has an even number of elements" }, { label: "C", text: "The endpoints are equal only" }, { label: "D", text: "The array is circular" }], "A", "Equality holds when there is no backtracking in value; each step moves consistently in one direction."),
    q("How can multiple queries be answered efficiently?", [{ label: "A", text: "Precompute whether each adjacent move breaks monotonicity and use prefix sums" }, { label: "B", text: "Sort every queried subarray" }, { label: "C", text: "Run DFS from i to j" }, { label: "D", text: "Use a heap for all values" }], "A", "Prefix information over adjacent direction changes can avoid scanning the full segment per query."),
    q("Which segment should always return YES?", [{ label: "A", text: "A segment with two elements" }, { label: "B", text: "A segment that goes up then down" }, { label: "C", text: "A segment with three random values" }, { label: "D", text: "A segment containing both positive and negative values" }], "A", "For two endpoints, the adjacent path length equals the endpoint difference."),
  ],
  8: [
    q("Why is iterating divisors of a and b enough?", [{ label: "A", text: "x and y are required to be divisors of a and b respectively" }, { label: "B", text: "Every integer is a divisor of both numbers" }, { label: "C", text: "The pair must be prime" }, { label: "D", text: "The answer depends only on a+b" }], "A", "Candidate pairs outside the divisor sets cannot satisfy the problem constraints."),
    q("What ordering rule should be applied when multiple valid pairs exist?", [{ label: "A", text: "Choose the smallest x first, and among those the smallest y" }, { label: "B", text: "Choose the largest x+y" }, { label: "C", text: "Choose the pair with largest product" }, { label: "D", text: "Choose any pair randomly" }], "A", "The output requirement is lexicographic by x then y."),
    q("What is a safe complexity improvement for large a and b?", [{ label: "A", text: "Generate divisors up to square root and sort the candidates" }, { label: "B", text: "Try all numbers up to a*b" }, { label: "C", text: "Convert the numbers to strings" }, { label: "D", text: "Use BFS over divisor pairs" }], "A", "Divisors can be generated in O(sqrt n), which is much faster than scanning all values."),
  ],
  9: [
    q("What preprocessing helps compute GCD after removing two elements?", [{ label: "A", text: "Prefix and suffix GCD arrays" }, { label: "B", text: "Sorting values alphabetically" }, { label: "C", text: "A queue of negative numbers" }, { label: "D", text: "Binary search on indices only" }], "A", "Prefix/suffix GCD lets the remaining GCD around removed positions be combined efficiently."),
    q("Why is trying every pair naively risky?", [{ label: "A", text: "It leads to O(n^2) removals and can be too slow" }, { label: "B", text: "It changes the original array order permanently" }, { label: "C", text: "It cannot calculate GCD" }, { label: "D", text: "It only works when all numbers are prime" }], "A", "Removing every pair and recomputing GCD is quadratic or worse."),
    q("Which edge case must be handled carefully?", [{ label: "A", text: "When n is exactly 3, removing two elements leaves one value" }, { label: "B", text: "When all values are strings" }, { label: "C", text: "When there are no elements to remove" }, { label: "D", text: "When GCD is always zero" }], "A", "The remaining GCD for a single element is the element itself."),
  ],
  10: [
    q("Why are levels processed from bottom to top?", [{ label: "A", text: "A node can become a leaf only after its lower descendants are removed" }, { label: "B", text: "The root must always be removed first" }, { label: "C", text: "Array indices are sorted descending" }, { label: "D", text: "It avoids checking leaf status" }], "A", "Bottom-up processing reflects how removals can change leaf status at higher levels."),
    q("How can parent-child positions be determined in a level-order complete tree array?", [{ label: "A", text: "Children of index i are 2*i+1 and 2*i+2" }, { label: "B", text: "Children of index i are i-1 and i+1" }, { label: "C", text: "Children are found by value comparison" }, { label: "D", text: "Children are always at indices 0 and 1" }], "A", "Complete tree level-order indexing uses the standard 2*i+1 and 2*i+2 formulas."),
    q("What is an important edge case?", [{ label: "A", text: "Nodes marked -1 should be treated as already removed or absent" }, { label: "B", text: "The array must be sorted before processing" }, { label: "C", text: "Only negative values can be removed" }, { label: "D", text: "Leaf status never changes" }], "A", "Removed or absent nodes should not be considered valid candidates."),
  ],
  11: [
    q("What representation helps test whether a product is a perfect k-th power?", [{ label: "A", text: "Prime exponent vectors modulo k" }, { label: "B", text: "The decimal string length of the product" }, { label: "C", text: "The maximum array element only" }, { label: "D", text: "The parity of the index" }], "A", "A product is a k-th power when every prime exponent is divisible by k."),
    q("How can valid partitions be counted efficiently?", [{ label: "A", text: "Use DP over prefixes and states representing cumulative exponent signatures" }, { label: "B", text: "Try every permutation of the array" }, { label: "C", text: "Sort the array and count adjacent pairs only" }, { label: "D", text: "Use a single greedy cut after every element" }], "A", "Contiguous partitions can be counted with prefix-state DP rather than enumerating all cuts blindly."),
    q("Which edge case is important?", [{ label: "A", text: "Products containing 1, because it contributes no prime exponents" }, { label: "B", text: "Only arrays with negative indexes" }, { label: "C", text: "Only k equal to zero" }, { label: "D", text: "Only sorted arrays" }], "A", "Value 1 does not change the exponent signature and must not break a valid segment."),
  ],
  12: [
    q("What structure best models the movement rules?", [{ label: "A", text: "A circular doubly linked list with next and previous links" }, { label: "B", text: "A sorted binary search tree" }, { label: "C", text: "A priority queue by node value" }, { label: "D", text: "A hash map of word counts" }], "A", "Alternating forward and backward moves depend directly on circular next/previous links."),
    q("What condition stops the traversal?", [{ label: "A", text: "The same value appears twice consecutively in the output path" }, { label: "B", text: "The traversal reaches the largest value" }, { label: "C", text: "The start index is visited once" }, { label: "D", text: "The list length is odd" }], "A", "The problem explicitly stops when consecutive visited values match."),
    q("What edge case should be checked?", [{ label: "A", text: "A one-node or repeated-value cycle where termination can occur immediately" }, { label: "B", text: "A list with no circular links" }, { label: "C", text: "A sorted list only" }, { label: "D", text: "A list containing only strings" }], "A", "Small cycles can expose off-by-one or infinite-loop mistakes."),
  ],
  13: [
    q("What must be simulated in each redistribution round?", [{ label: "A", text: "Equal share calculation, eating time, and leftover collection" }, { label: "B", text: "Only sorting children by name" }, { label: "C", text: "Only one child's chocolate count" }, { label: "D", text: "A binary search over child indexes" }], "A", "The round state changes through share distribution, simultaneous eating, and leftover collection."),
    q("Why is careful termination needed?", [{ label: "A", text: "The process stops when no positive equal share can be distributed" }, { label: "B", text: "The process stops after exactly N rounds always" }, { label: "C", text: "The process never stops if speeds differ" }, { label: "D", text: "The process stops when children are sorted" }], "A", "Once the collected chocolates cannot produce an equal share, no further full round is possible."),
    q("What is the main implementation risk?", [{ label: "A", text: "Double-counting time when children eat simultaneously" }, { label: "B", text: "Ignoring all leftovers permanently" }, { label: "C", text: "Using integers for counts" }, { label: "D", text: "Reading N before C" }], "A", "Simultaneous eating means each round contributes the maximum required eating time, not the sum across children."),
  ],
  14: [
    q("How should a jump operation behave when a jump reference exists?", [{ label: "A", text: "Move to the referenced node instead of simply following next" }, { label: "B", text: "Delete the current node" }, { label: "C", text: "Sort the remaining nodes" }, { label: "D", text: "Restart from the tail" }], "A", "The traversal result depends on following jump links when requested."),
    q("What is the expected complexity for q operations after nodes are indexed?", [{ label: "A", text: "O(n + q)" }, { label: "B", text: "O(n*q) for every operation" }, { label: "C", text: "O(q log q) because operations must be sorted" }, { label: "D", text: "O(1) without reading the list" }], "A", "Build node references once, then each operation moves in constant time."),
    q("What edge case should be handled?", [{ label: "A", text: "A jump value of -1 should leave traversal behavior well-defined, usually staying or falling back as specified" }, { label: "B", text: "Every node must have both links non-null" }, { label: "C", text: "Node values must be unique strings" }, { label: "D", text: "The list must be circular" }], "A", "Missing jump references are common in the input and cannot be treated as valid node IDs."),
  ],
  15: [
    q("Which data structure naturally models the reservation process?", [{ label: "A", text: "A queue where unconfirmed riders can be appended back" }, { label: "B", text: "A stack that reverses all riders" }, { label: "C", text: "A sorted set by name" }, { label: "D", text: "A binary tree by confirmation status" }], "A", "The ride repeatedly takes from the front and can send people to the back."),
    q("What is the key simulation detail?", [{ label: "A", text: "Process up to K people per ride and preserve queue order for those sent back" }, { label: "B", text: "Remove all unconfirmed people permanently" }, { label: "C", text: "Sort confirmed riders alphabetically" }, { label: "D", text: "Always seat exactly K people" }], "A", "The queue order after each round determines future selections."),
    q("Which edge case matters?", [{ label: "A", text: "The queue may have fewer than K people remaining" }, { label: "B", text: "Confirmation values are always increasing" }, { label: "C", text: "Names are numeric only" }, { label: "D", text: "Every rider is always confirmed" }], "A", "The simulation must not over-read when the queue size is smaller than K."),
  ],
  16: [
    q("What must be computed for each department line?", [{ label: "A", text: "Total girls and total boys across all four groups" }, { label: "B", text: "Only the first girl count" }, { label: "C", text: "The alphabetical rank of the department" }, { label: "D", text: "The difference between group names" }], "A", "Each department has multiple girl/boy counts that must be summed."),
    q("What is the expected complexity for d departments?", [{ label: "A", text: "O(d), because each department has a fixed number of counts" }, { label: "B", text: "O(d^2), because every department must compare every group" }, { label: "C", text: "O(log d), because input is sorted" }, { label: "D", text: "O(1), regardless of input size" }], "A", "Each department row is parsed once with a constant amount of numeric data."),
    q("Which tie behavior should be consistent?", [{ label: "A", text: "If totals tie, keep the first department encountered unless the problem says otherwise" }, { label: "B", text: "Always choose the lexicographically largest name" }, { label: "C", text: "Ignore tied departments completely" }, { label: "D", text: "Choose the department with fewer groups" }], "A", "Stable first-maximum handling avoids accidental changes when equal totals appear."),
  ],
  17: [
    q("Why can values greater than or equal to k be useful for missing smaller values?", [{ label: "A", text: "They can be reduced to a missing number between 0 and k-1" }, { label: "B", text: "They directly increase MEX without changes" }, { label: "C", text: "They must be deleted from the array" }, { label: "D", text: "They are always impossible to use" }], "A", "An operation can replace a[i] with any smaller value, so surplus large values can fill missing required values."),
    q("What is the target condition for MEX at least k?", [{ label: "A", text: "Every value from 0 to k-1 must be present" }, { label: "B", text: "Only value k must be absent" }, { label: "C", text: "All values must be larger than k" }, { label: "D", text: "The array must be sorted" }], "A", "MEX at least k means none of 0..k-1 is missing."),
    q("What is an important impossible case?", [{ label: "A", text: "A missing required value cannot be formed from any available value at least that large" }, { label: "B", text: "k is zero" }, { label: "C", text: "The array contains duplicates" }, { label: "D", text: "n is odd" }], "A", "Because replacements can only decrease values, not every missing number can necessarily be created."),
  ],
  18: [
    q("What condition makes equal stack heights possible?", [{ label: "A", text: "The total number of books must be divisible by the number of stacks" }, { label: "B", text: "Every stack must already be equal" }, { label: "C", text: "The number of stacks must be even" }, { label: "D", text: "The tallest stack must be first" }], "A", "All stacks share a common target height equal to total/n, which must be integral."),
    q("How is the minimum number of moved books computed once the target height is known?", [{ label: "A", text: "Sum the excess books above the target" }, { label: "B", text: "Sum all books in every stack" }, { label: "C", text: "Count stacks below the target only" }, { label: "D", text: "Sort stacks and return the median" }], "A", "Only excess books need to be moved from taller stacks to shorter stacks."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(1) extra space" }, { label: "B", text: "O(n log n) because sorting is required" }, { label: "C", text: "O(n^2) because each book is moved individually" }, { label: "D", text: "O(1) because only the first stack matters" }], "A", "The total and excess can be computed in simple passes without sorting."),
  ],
  19: [
    q("What does the DP state need to remember?", [{ label: "A", text: "Current day, number of skips used, and whether the previous day was skipped" }, { label: "B", text: "Only the maximum effort value" }, { label: "C", text: "The sorted effort array" }, { label: "D", text: "Only whether k is even" }], "A", "The non-consecutive constraint depends on whether the previous day was skipped."),
    q("Why is a greedy choice of skipping the largest k efforts unsafe?", [{ label: "A", text: "Two largest efforts may be adjacent and cannot both be skipped" }, { label: "B", text: "Efforts are strings" }, { label: "C", text: "Skipping any day is always invalid" }, { label: "D", text: "The smallest effort must always be skipped" }], "A", "The adjacency constraint can invalidate locally attractive choices."),
    q("What is the intended time complexity?", [{ label: "A", text: "O(n*k)" }, { label: "B", text: "O(n!)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(k) without reading all days" }], "A", "The natural DP considers each day and each possible skip count."),
  ],
  20: [
    q("What should happen when a fruit type is already in the current box?", [{ label: "A", text: "Skip that occurrence and continue processing the conveyor" }, { label: "B", text: "Immediately return the current box" }, { label: "C", text: "Duplicate it in the box" }, { label: "D", text: "Sort all fruits in the box" }], "A", "The rule says each new type is placed once per box; duplicates for the same box are skipped."),
    q("Why is the extra space effectively O(1)?", [{ label: "A", text: "There are only 26 lowercase fruit types to track per box" }, { label: "B", text: "The string is never read" }, { label: "C", text: "All boxes are stored forever" }, { label: "D", text: "Sorting removes memory usage" }], "A", "A fixed-size character set is enough for lowercase letters."),
    q("Which edge case reveals whether the last box is tracked correctly?", [{ label: "A", text: "A string with all unique characters should make the whole string the last box" }, { label: "B", text: "A string with only uppercase letters" }, { label: "C", text: "An empty string if the constraints disallow it" }, { label: "D", text: "A string that is already sorted" }], "A", "If no duplicate blocks additions, the first and last box are the same."),
  ],
  21: [
    q("What DP state is suitable for the bucket selection problem?", [{ label: "A", text: "Index, current collected capacity up to C, and whether the previous bucket was selected" }, { label: "B", text: "Only the largest bucket value" }, { label: "C", text: "The sorted bucket order" }, { label: "D", text: "Only the number of adjacent pairs" }], "A", "The adjacency restriction and target capacity both affect the optimal choice."),
    q("Why can a simple greedy choice fail?", [{ label: "A", text: "Choosing a large bucket may block adjacent buckets that give a better total or fewer buckets" }, { label: "B", text: "Bucket values are always sorted" }, { label: "C", text: "The target capacity is always impossible" }, { label: "D", text: "Adjacent buckets must always be chosen together" }], "A", "The no-adjacent constraint means local largest choices are not always globally optimal."),
    q("What output is required when the capacity cannot be reached?", [{ label: "A", text: "-1" }, { label: "B", text: "0" }, { label: "C", text: "The number of buckets" }, { label: "D", text: "The largest bucket value" }], "A", "The problem explicitly requires -1 if no valid non-adjacent selection reaches C."),
  ],
  22: [
    q("After deleting queried digits, how should gravity be applied?", [{ label: "A", text: "For each column, compact remaining digits upward toward row 0" }, { label: "B", text: "For each row, sort digits ascending" }, { label: "C", text: "Move deleted digits to the top" }, { label: "D", text: "Rotate the whole matrix clockwise" }], "A", "Gravity upwards is column-local and pulls remaining elements toward the first row."),
    q("What is the expected complexity for an N by M matrix?", [{ label: "A", text: "O(N*M), scanning cells and rebuilding columns" }, { label: "B", text: "O((N*M)^2), comparing every cell pair" }, { label: "C", text: "O(log M), using binary search" }, { label: "D", text: "O(1), because only row 0 matters" }], "A", "Every cell may need to be inspected once to delete and compact."),
    q("Which edge case should produce # in row 0?", [{ label: "A", text: "A column where all digits were deleted" }, { label: "B", text: "A column containing digit 1" }, { label: "C", text: "A matrix with more rows than columns" }, { label: "D", text: "A query string of length one" }], "A", "If a column has no remaining digits, the top cell is empty and represented by #."),
  ],
  23: [
    q("What initialization avoids mistakes when all scores are negative?", [{ label: "A", text: "Initialize the maximum with the first array element" }, { label: "B", text: "Initialize the maximum with 0" }, { label: "C", text: "Initialize the maximum with the array length" }, { label: "D", text: "Initialize the maximum with infinity" }], "A", "Starting at 0 would incorrectly return 0 for an all-negative array."),
    q("What is the expected time complexity?", [{ label: "A", text: "O(n), scanning scores once" }, { label: "B", text: "O(n log n), because sorting is required" }, { label: "C", text: "O(n^2), checking every pair" }, { label: "D", text: "O(1), because the answer is always first" }], "A", "The maximum can be found with one pass."),
    q("Which edge case must return the only value present?", [{ label: "A", text: "An array of length 1" }, { label: "B", text: "An array of only positive values" }, { label: "C", text: "An array with duplicates" }, { label: "D", text: "An array sorted ascending" }], "A", "With one element, that element is necessarily the maximum."),
  ],
  24: [
    q("How can zeroes be moved in place while preserving non-zero order?", [{ label: "A", text: "Write non-zero values forward with a pointer, then fill the rest with zeroes" }, { label: "B", text: "Sort the array numerically" }, { label: "C", text: "Reverse the array twice" }, { label: "D", text: "Delete all zeroes and shrink the array" }], "A", "A write pointer keeps the relative order of non-zero elements and uses constant extra space."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(1) extra space" }, { label: "B", text: "O(n log n) time due to sorting" }, { label: "C", text: "O(n^2) time due to shifting every zero one step" }, { label: "D", text: "O(1) time without reading the array" }], "A", "Each element is inspected and written at most a constant number of times."),
    q("Which edge case should leave the array unchanged?", [{ label: "A", text: "An array with no zeroes" }, { label: "B", text: "An array with negative non-zero values" }, { label: "C", text: "An array with one zero" }, { label: "D", text: "An array with duplicate non-zero values" }], "A", "If no empty boxes exist, the original order already satisfies the requirement."),
  ],
  25: [
    q("Why are two binary searches useful for finding the target range?", [{ label: "A", text: "One finds the first occurrence and one finds the last occurrence" }, { label: "B", text: "One sorts the array and one reverses it" }, { label: "C", text: "One checks even values and one checks odd values" }, { label: "D", text: "One searches the target and one searches the index" }], "A", "The range endpoints require different boundary movement rules."),
    q("What is the expected complexity?", [{ label: "A", text: "O(log n)" }, { label: "B", text: "O(n), because every value must be counted" }, { label: "C", text: "O(n log n), because the input must be sorted" }, { label: "D", text: "O(1), because duplicates are fixed" }], "A", "The array is already sorted, so binary search can locate boundaries logarithmically."),
    q("Which case should return [-1, -1]?", [{ label: "A", text: "The target is not present in the array" }, { label: "B", text: "The target appears once" }, { label: "C", text: "The target appears at index 0" }, { label: "D", text: "The target appears at the last index" }], "A", "If the target does not exist, both endpoints are invalid."),
  ],
  26: [
    q("What does the number of right rotations correspond to in a rotated sorted array?", [{ label: "A", text: "The index of the minimum element" }, { label: "B", text: "The index of the maximum element" }, { label: "C", text: "The array length minus one always" }, { label: "D", text: "The value at index 0" }], "A", "Right rotations move the smallest original element to the rotation count index."),
    q("How can the rotation count be found efficiently?", [{ label: "A", text: "Binary search for the minimum element" }, { label: "B", text: "Sort the array and compare all elements" }, { label: "C", text: "Use a stack of all values" }, { label: "D", text: "Count duplicate values" }], "A", "The rotated sorted structure allows binary search in O(log n)."),
    q("Which edge case should return 0?", [{ label: "A", text: "The array is already sorted and not rotated" }, { label: "B", text: "The array has two elements" }, { label: "C", text: "The minimum is at the last index" }, { label: "D", text: "All values are negative" }], "A", "No rotation means the minimum remains at index 0."),
  ],
  27: [
    q("What is the simplest correct strategy for reversing the message?", [{ label: "A", text: "Swap characters from both ends or build the string from the end" }, { label: "B", text: "Sort characters alphabetically" }, { label: "C", text: "Remove vowels first" }, { label: "D", text: "Count character frequencies only" }], "A", "Reversal requires characters to appear in opposite positional order."),
    q("What is the time complexity?", [{ label: "A", text: "O(n)" }, { label: "B", text: "O(log n)" }, { label: "C", text: "O(n^2) always" }, { label: "D", text: "O(1) regardless of string length" }], "A", "Each character must be read or moved once."),
    q("Which edge case should return the same string?", [{ label: "A", text: "A one-character string" }, { label: "B", text: "Any string with vowels" }, { label: "C", text: "Any numeric string" }, { label: "D", text: "Any lowercase string" }], "A", "A single character is identical when reversed."),
  ],
  28: [
    q("What recurrence solves climbing stairs with 1 or 2 steps?", [{ label: "A", text: "ways[n] = ways[n-1] + ways[n-2]" }, { label: "B", text: "ways[n] = ways[n-1] * 2" }, { label: "C", text: "ways[n] = n!" }, { label: "D", text: "ways[n] = ways[n/2]" }], "A", "The last move is either from step n-1 or from step n-2."),
    q("Why is naive recursion risky for larger n?", [{ label: "A", text: "It recomputes the same subproblems exponentially many times" }, { label: "B", text: "It cannot represent integer answers" }, { label: "C", text: "It always returns zero" }, { label: "D", text: "It ignores the base case n=1" }], "A", "Without memoization or iteration, overlapping subproblems cause exponential time."),
    q("What base case is correct under the given samples?", [{ label: "A", text: "ways[1] = 1 and ways[2] = 2" }, { label: "B", text: "ways[1] = 2 and ways[2] = 1" }, { label: "C", text: "ways[1] = 0 and ways[2] = 0" }, { label: "D", text: "ways[n] is always n" }], "A", "There is one way to climb 1 step and two ways to climb 2 steps."),
  ],
  29: [
    q("Which operation can find the single value when every other value appears twice?", [{ label: "A", text: "XOR all numbers" }, { label: "B", text: "Multiply all numbers" }, { label: "C", text: "Sort characters in each number" }, { label: "D", text: "Divide the sum by two" }], "A", "x XOR x cancels to 0 and 0 XOR single leaves the unique value."),
    q("What is the optimal complexity with XOR?", [{ label: "A", text: "O(n) time and O(1) extra space" }, { label: "B", text: "O(n log n) time and O(n) space" }, { label: "C", text: "O(n^2) time" }, { label: "D", text: "O(1) time without reading values" }], "A", "Each element is processed once and only one accumulator is needed."),
    q("Which edge case is handled naturally by XOR?", [{ label: "A", text: "The array has exactly one element" }, { label: "B", text: "Every element appears three times" }, { label: "C", text: "There are two single values" }, { label: "D", text: "The array is empty" }], "A", "XORing a single value returns that value."),
  ],
  30: [
    q("What sliding-window condition must be maintained?", [{ label: "A", text: "The window contains at most two distinct fruit types" }, { label: "B", text: "The window contains exactly two of every fruit" }, { label: "C", text: "The window sum is at least k" }, { label: "D", text: "The window is sorted" }], "A", "A valid basket segment allows no more than two fruit types."),
    q("Why does the sliding-window solution run in O(n)?", [{ label: "A", text: "Both left and right pointers move only forward" }, { label: "B", text: "Every window is sorted once" }, { label: "C", text: "The array has only two elements" }, { label: "D", text: "A heap removes all duplicates" }], "A", "Each pointer advances at most n times, so total work is linear."),
    q("Which edge case should return the full length?", [{ label: "A", text: "The entire array has at most two distinct values" }, { label: "B", text: "The array has all unique values" }, { label: "C", text: "The first value is the largest" }, { label: "D", text: "The array length is odd" }], "A", "If the whole sequence satisfies the distinct-type rule, it is the longest valid segment."),
  ],
  31: [
    q("What is a straightforward way to return the k smallest prices in ascending order?", [{ label: "A", text: "Sort the array and take the first k values" }, { label: "B", text: "Take the last k values without sorting" }, { label: "C", text: "Use XOR on all prices" }, { label: "D", text: "Return any k prices" }], "A", "Sorting places the smallest elements first in ascending order."),
    q("What alternative is useful when k is much smaller than n?", [{ label: "A", text: "Maintain a max-heap of size k" }, { label: "B", text: "Use a stack to reverse the array" }, { label: "C", text: "Run BFS over indexes" }, { label: "D", text: "Convert prices to strings" }], "A", "A size-k max-heap can keep only the k smallest seen so far."),
    q("Which edge case should return the entire sorted array?", [{ label: "A", text: "k equals the number of elements" }, { label: "B", text: "k equals 1" }, { label: "C", text: "All numbers are positive" }, { label: "D", text: "The array contains duplicates" }], "A", "If k is n, every element belongs in the result, ordered ascending."),
  ],
  32: [
    q("Why is a greedy strategy valid for coin values [1, 2, 5, 10]?", [{ label: "A", text: "This canonical coin system lets larger denominations reduce the count optimally" }, { label: "B", text: "Greedy works for every possible coin system" }, { label: "C", text: "The amount is always a multiple of 10" }, { label: "D", text: "Only coin 1 is ever used" }], "A", "For these denominations, taking as many larger coins as possible gives an optimal minimum count."),
    q("What is the complexity when using arithmetic division by denominations?", [{ label: "A", text: "O(1), because the number of denominations is fixed" }, { label: "B", text: "O(n), where n is the amount" }, { label: "C", text: "O(n^2)" }, { label: "D", text: "O(log n) due to binary search" }], "A", "There are always four denominations, so the loop length is constant."),
    q("Which edge case verifies the use of coin 1?", [{ label: "A", text: "Amounts that are not divisible by 2, 5, or 10" }, { label: "B", text: "Amount 20 only" }, { label: "C", text: "Negative amounts" }, { label: "D", text: "Amount zero if not included by constraints" }], "A", "Coin 1 handles remaining values after larger denominations are used."),
  ],
  33: [
    q("Why should binary search be applied on the smaller array?", [{ label: "A", text: "It reduces the search range and prevents invalid partition indexes" }, { label: "B", text: "The smaller array always contains the median" }, { label: "C", text: "The larger array is unsorted" }, { label: "D", text: "Binary search cannot run on long arrays" }], "A", "Searching the smaller array keeps partition boundaries easier and safer."),
    q("What condition confirms a valid median partition?", [{ label: "A", text: "leftA <= rightB and leftB <= rightA" }, { label: "B", text: "leftA <= rightA only" }, { label: "C", text: "leftA + leftB equals rightA + rightB" }, { label: "D", text: "rightA is always less than leftB" }], "A", "All left-side values must be less than or equal to all right-side values across both arrays."),
    q("How is the median computed when total length is even?", [{ label: "A", text: "Average of max(left side) and min(right side)" }, { label: "B", text: "Maximum of the left side only" }, { label: "C", text: "Minimum of the right side only" }, { label: "D", text: "First element of the larger array" }], "A", "For even total length, the two central values are the largest left value and smallest right value."),
  ],
  34: [
    q("Which technique efficiently counts pairs where signals[i] > 2*signals[j]?", [{ label: "A", text: "Modified merge sort while counting cross pairs" }, { label: "B", text: "A single stack without ordering" }, { label: "C", text: "Sorting only and returning n" }, { label: "D", text: "Checking only adjacent elements" }], "A", "Merge sort keeps halves sorted so cross distortion pairs can be counted efficiently."),
    q("What is the expected time complexity of the efficient approach?", [{ label: "A", text: "O(n log n)" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1)" }], "A", "Each merge level counts pairs in linear work, with logarithmic levels."),
    q("Why should pair counting happen before merging the two sorted halves?", [{ label: "A", text: "The original left-before-right index relationship is still represented by the halves" }, { label: "B", text: "Merging deletes all values" }, { label: "C", text: "Counting after merging is always O(1)" }, { label: "D", text: "The array must stay unsorted forever" }], "A", "Cross pairs rely on elements from the left half having original indexes before elements from the right half."),
  ],
  35: [
    q("How can subarrays with exactly k distinct values be counted efficiently?", [{ label: "A", text: "countAtMost(k) - countAtMost(k-1)" }, { label: "B", text: "Sort the array and count equal groups" }, { label: "C", text: "Use binary search on k only" }, { label: "D", text: "Check only subarrays of length k" }], "A", "The difference between at-most counts isolates subarrays with exactly k distinct values."),
    q("What data structure tracks the current window?", [{ label: "A", text: "A frequency map of treasure types" }, { label: "B", text: "A min-heap of indexes" }, { label: "C", text: "A stack of sorted values" }, { label: "D", text: "A tree of all subarrays" }], "A", "Distinct count changes when frequencies enter or drop to zero."),
    q("What edge case should return n*(n+1)/2?", [{ label: "A", text: "All elements are the same and k is 1" }, { label: "B", text: "All elements are unique and k is 1" }, { label: "C", text: "k is larger than n" }, { label: "D", text: "The array is empty under positive constraints" }], "A", "Every contiguous segment has exactly one distinct type when all values match and k=1."),
  ],
  36: [
    q("Which traversal finds the shortest spell transformation length?", [{ label: "A", text: "BFS over words differing by one character" }, { label: "B", text: "DFS until any path is found" }, { label: "C", text: "Sorting the spell book lexicographically" }, { label: "D", text: "Greedy changing the first different character only" }], "A", "BFS explores transformations by distance, so the first target reach is shortest."),
    q("Why is a visited set important?", [{ label: "A", text: "It prevents revisiting spells and creating cycles" }, { label: "B", text: "It sorts the output path" }, { label: "C", text: "It stores only vowels" }, { label: "D", text: "It makes every word one character long" }], "A", "Word transformations can cycle, so visited tracking avoids repeated work."),
    q("What should happen if targetSpell is not in the spell book?", [{ label: "A", text: "Return 0 because no valid sequence can end at the target" }, { label: "B", text: "Return 1 because startSpell is valid" }, { label: "C", text: "Return the spell book size" }, { label: "D", text: "Ignore the target and return any path" }], "A", "Every intermediate and final spell must be in the valid spell book."),
  ],
  37: [
    q("Why is BFS usually performed before backtracking all paths?", [{ label: "A", text: "BFS identifies shortest distances or parent links for shortest paths only" }, { label: "B", text: "BFS sorts every path alphabetically" }, { label: "C", text: "BFS guarantees all possible paths, including longer ones, are returned" }, { label: "D", text: "BFS removes the need for adjacency checks" }], "A", "Shortest path generation needs distance layers; backtracking then reconstructs only shortest sequences."),
    q("What must be preserved to return all shortest paths?", [{ label: "A", text: "All valid parents from the previous BFS level" }, { label: "B", text: "Only one parent per word" }, { label: "C", text: "The sorted list of word lengths" }, { label: "D", text: "The largest alphabetical word" }], "A", "Multiple shortest parents can lead to different valid shortest sequences."),
    q("Why should words be marked visited by level rather than immediately discarding same-level alternatives?", [{ label: "A", text: "Same-level alternatives may produce additional shortest paths" }, { label: "B", text: "It makes paths longer" }, { label: "C", text: "It avoids checking word differences" }, { label: "D", text: "It changes all words to lowercase" }], "A", "Premature removal can lose alternate parents at the same shortest depth."),
  ],
  38: [
    q("What algorithmic idea solves minimum flood time efficiently?", [{ label: "A", text: "Binary search time with reachability check, or Dijkstra/minimax path" }, { label: "B", text: "Sort each row independently" }, { label: "C", text: "Greedy always move right first" }, { label: "D", text: "Count cells lower than the start only" }], "A", "The answer is the smallest maximum elevation along a path."),
    q("In a binary-search solution, what does the feasibility check test?", [{ label: "A", text: "Whether start can reach end using only cells with elevation <= t" }, { label: "B", text: "Whether all cells have elevation exactly t" }, { label: "C", text: "Whether the diagonal is sorted" }, { label: "D", text: "Whether t is even" }], "A", "At water level t, only cells up to elevation t are traversable."),
    q("Which edge case should return 0?", [{ label: "A", text: "A 1x1 grid containing elevation 0" }, { label: "B", text: "Any grid with a zero somewhere" }, { label: "C", text: "Any grid with sorted rows" }, { label: "D", text: "A grid where start is blocked by walls" }], "A", "Start and end are the same cell, so no waiting beyond its elevation is needed."),
  ],
  39: [
    q("What preprocessing helps compute minimum palindrome cuts?", [{ label: "A", text: "A table indicating whether text[i..j] is a palindrome" }, { label: "B", text: "Sorting all characters" }, { label: "C", text: "A heap of character codes" }, { label: "D", text: "A BFS over ASCII values" }], "A", "Cut DP needs fast checks for whether each candidate substring is a palindrome."),
    q("What is the DP transition idea?", [{ label: "A", text: "dp[i] is the minimum cuts for prefix ending at i, using palindromic suffixes" }, { label: "B", text: "dp[i] is always i*i" }, { label: "C", text: "dp[i] stores only the character frequency" }, { label: "D", text: "dp[i] is the longest non-palindrome" }], "A", "If a suffix is palindrome, combine the best cuts before it with one additional cut as needed."),
    q("Which input should require zero cuts?", [{ label: "A", text: "The entire string is already a palindrome" }, { label: "B", text: "The string has all distinct characters" }, { label: "C", text: "The string length is even" }, { label: "D", text: "The string contains no vowels" }], "A", "A fully palindromic string needs no division."),
  ],
  40: [
    q("What DP interval should be used for minimum cut cost?", [{ label: "A", text: "Minimum cost to perform all cuts inside a segment between two existing boundaries" }, { label: "B", text: "Maximum checkpoint value only" }, { label: "C", text: "Number of cuts already sorted descending" }, { label: "D", text: "Cost of cutting every position from left to right greedily" }], "A", "Each chosen cut splits a segment into independent left and right subsegments."),
    q("Why are 0 and n added to the checkpoint list?", [{ label: "A", text: "They define the outer boundaries for segment lengths" }, { label: "B", text: "They must be cut first" }, { label: "C", text: "They remove duplicate checkpoints" }, { label: "D", text: "They make the answer zero" }], "A", "Segment cost is based on the distance between neighboring boundaries."),
    q("What is the typical complexity for interval DP over c cuts?", [{ label: "A", text: "O(c^3)" }, { label: "B", text: "O(log c)" }, { label: "C", text: "O(1)" }, { label: "D", text: "O(n!) always" }], "A", "For each interval, every possible first cut may be tried."),
  ],
  41: [
    q("What is the key interval DP idea for destroying orbs?", [{ label: "A", text: "Choose which orb is destroyed last inside an interval" }, { label: "B", text: "Always destroy the largest orb first" }, { label: "C", text: "Sort orbs before destroying" }, { label: "D", text: "Destroy from left to right only" }], "A", "Choosing the last orb keeps the interval boundaries fixed, making subproblems independent."),
    q("Why are imaginary orbs with value 1 useful?", [{ label: "A", text: "They simplify boundary multiplication at both ends" }, { label: "B", text: "They must be destroyed for extra points" }, { label: "C", text: "They make all orbs equal" }, { label: "D", text: "They remove the need for DP" }], "A", "Padding with 1 avoids special cases for edge orbs."),
    q("What is the usual complexity of this interval DP?", [{ label: "A", text: "O(n^3)" }, { label: "B", text: "O(n)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1)" }], "A", "Each interval tries every possible last orb."),
  ],
  42: [
    q("How can minimum insertions to form a palindrome be derived?", [{ label: "A", text: "n - length of the longest palindromic subsequence" }, { label: "B", text: "Number of unique characters" }, { label: "C", text: "Length of the shortest prefix" }, { label: "D", text: "Number of vowels" }], "A", "Characters not in a longest palindromic subsequence must be mirrored by insertions."),
    q("What DP relation is used when characters at both ends match?", [{ label: "A", text: "dp[l][r] = dp[l+1][r-1]" }, { label: "B", text: "dp[l][r] = dp[l][r-1] + dp[l+1][r]" }, { label: "C", text: "dp[l][r] = 0 always" }, { label: "D", text: "dp[l][r] = r-l+1 always" }], "A", "Matching ends can be kept together without extra insertion between them."),
    q("Which edge case requires zero insertions?", [{ label: "A", text: "A string that is already a palindrome" }, { label: "B", text: "Any string of even length" }, { label: "C", text: "Any string with duplicate letters" }, { label: "D", text: "Any string containing z" }], "A", "If the rune is already symmetric, no inserted characters are needed."),
  ],
  43: [
    q("What search space is used for minimum eating speed?", [{ label: "A", text: "Speeds from 1 to max(piles)" }, { label: "B", text: "Hours from 1 to h" }, { label: "C", text: "Pile indexes only" }, { label: "D", text: "Only prime speeds" }], "A", "The speed cannot need to exceed the largest pile and must be at least 1."),
    q("How is the feasibility of a speed k checked?", [{ label: "A", text: "Sum ceil(pile/k) for all piles and compare with h" }, { label: "B", text: "Check whether k divides every pile exactly" }, { label: "C", text: "Sort piles and take the median" }, { label: "D", text: "Count piles smaller than h" }], "A", "Each pile takes ceiling(pile/k) hours at speed k."),
    q("Why does binary search work here?", [{ label: "A", text: "If a speed works, any larger speed also works" }, { label: "B", text: "Only one pile changes during search" }, { label: "C", text: "The piles are already sorted" }, { label: "D", text: "The answer is always h" }], "A", "The feasibility predicate is monotonic."),
  ],
  44: [
    q("What should the left pointer do when a repeated character appears inside the window?", [{ label: "A", text: "Move just past the previous occurrence of that character" }, { label: "B", text: "Move back to index 0" }, { label: "C", text: "Always move by one regardless of previous index" }, { label: "D", text: "Stop scanning immediately" }], "A", "The window must exclude the earlier duplicate while preserving as much valid length as possible."),
    q("What data structure is typically used?", [{ label: "A", text: "A map from character to its most recent index" }, { label: "B", text: "A min-heap of substring lengths" }, { label: "C", text: "A sorted array of characters" }, { label: "D", text: "A stack of vowels" }], "A", "Last-seen indexes let the algorithm jump the left boundary correctly."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(k) space for distinct characters" }, { label: "B", text: "O(n^2) time always" }, { label: "C", text: "O(log n) time" }, { label: "D", text: "O(1) without reading the string" }], "A", "Each character is processed once while the map stores current character positions."),
  ],
  45: [
    q("Which approach returns the k largest values in descending order?", [{ label: "A", text: "Sort descending and take the first k, or maintain a min-heap of size k then sort result" }, { label: "B", text: "Return the first k input values" }, { label: "C", text: "Use XOR on all values" }, { label: "D", text: "Sort ascending and take the first k" }], "A", "Both sorting and a size-k heap can identify the largest k values."),
    q("What is the heap-based complexity?", [{ label: "A", text: "O(n log k) plus output ordering" }, { label: "B", text: "O(n^2) always" }, { label: "C", text: "O(1)" }, { label: "D", text: "O(k!)" }], "A", "Maintaining a heap of k elements costs log k per processed number."),
    q("Which edge case should preserve duplicates?", [{ label: "A", text: "All values are equal and k is less than n" }, { label: "B", text: "k is zero under positive constraints" }, { label: "C", text: "The array is strictly increasing" }, { label: "D", text: "The array contains no largest value" }], "A", "The k largest numbers are positions/values from the multiset, so duplicates remain."),
  ],
  46: [
    q("Why does the standard sliding window work for this problem?", [{ label: "A", text: "The weights are positive, so increasing right only increases or maintains the sum" }, { label: "B", text: "The array is sorted" }, { label: "C", text: "Negative numbers cancel the sum" }, { label: "D", text: "The target is always the first element" }], "A", "With positive values, shrinking while sum >= target is safe and monotonic."),
    q("When should the best length be updated?", [{ label: "A", text: "Each time the current window sum is at least target before shrinking" }, { label: "B", text: "Only after the loop ends" }, { label: "C", text: "Only when the sum equals target exactly" }, { label: "D", text: "Only when the window has length one" }], "A", "Any window meeting or exceeding target is a valid candidate."),
    q("What should be returned if no valid subarray exists?", [{ label: "A", text: "-1" }, { label: "B", text: "0" }, { label: "C", text: "n" }, { label: "D", text: "target" }], "A", "The test cases expect -1 when no continuous segment reaches the target."),
  ],
  47: [
    q("After sorting people by weight, what greedy pairing is optimal?", [{ label: "A", text: "Try pairing the lightest remaining person with the heaviest remaining person" }, { label: "B", text: "Always pair the two heaviest people" }, { label: "C", text: "Always pair the two lightest people" }, { label: "D", text: "Pair people in original input order" }], "A", "If the lightest cannot fit with the heaviest, nobody else can fit with the heaviest."),
    q("What is the complexity dominated by?", [{ label: "A", text: "Sorting, O(n log n)" }, { label: "B", text: "The two-pointer scan, O(n^2)" }, { label: "C", text: "Binary conversion, O(log n)" }, { label: "D", text: "A constant-time lookup" }], "A", "The two-pointer scan is linear after sorting."),
    q("Which edge case is important?", [{ label: "A", text: "One unpaired person remains and still needs one boat" }, { label: "B", text: "Every person weighs zero" }, { label: "C", text: "Boat limit is ignored" }, { label: "D", text: "Input order must be preserved in output" }], "A", "A single remaining person cannot be discarded; they occupy a boat."),
  ],
  48: [
    q("Which data structure efficiently finds the next greater building?", [{ label: "A", text: "A monotonic decreasing stack of unresolved indices" }, { label: "B", text: "A queue sorted by input order only" }, { label: "C", text: "A hash set of heights" }, { label: "D", text: "A binary tree of all pairs" }], "A", "When a taller height appears, it resolves shorter heights waiting on the stack."),
    q("Why is the algorithm O(n)?", [{ label: "A", text: "Each building is pushed and popped at most once" }, { label: "B", text: "Every building compares with every later building" }, { label: "C", text: "The stack is sorted after every insertion" }, { label: "D", text: "Only one building is processed" }], "A", "The total number of stack operations is linear."),
    q("What should happen to indices left in the stack at the end?", [{ label: "A", text: "Their answer remains -1" }, { label: "B", text: "Their answer becomes the last height" }, { label: "C", text: "They are removed from the output" }, { label: "D", text: "They are assigned zero" }], "A", "Remaining buildings have no taller building to their right."),
  ],
  49: [
    q("What should be stored to answer first negative in each window?", [{ label: "A", text: "A deque of indices of negative numbers" }, { label: "B", text: "A sorted list of all positive values" }, { label: "C", text: "Only the sum of the window" }, { label: "D", text: "A stack of window sizes" }], "A", "The front of the deque gives the earliest negative still inside the current window."),
    q("When should an index be removed from the front of the deque?", [{ label: "A", text: "When it falls outside the current window" }, { label: "B", text: "When it is still negative" }, { label: "C", text: "Whenever a positive number appears" }, { label: "D", text: "Only after all windows are processed" }], "A", "Old indices cannot contribute to later windows."),
    q("What output should a window with no negative number produce?", [{ label: "A", text: "0" }, { label: "B", text: "-1" }, { label: "C", text: "The first positive number" }, { label: "D", text: "The window size" }], "A", "The problem explicitly uses 0 when no negative number exists in a window."),
  ],
  50: [
    q("What is the search space for minimizing maximum pages?", [{ label: "A", text: "From max(nums) to sum(nums)" }, { label: "B", text: "From 0 to number of students" }, { label: "C", text: "Only the first and last book" }, { label: "D", text: "All permutations of books" }], "A", "No student can receive less than the largest single book, and one student could receive all pages."),
    q("How is a candidate maximum page limit checked?", [{ label: "A", text: "Greedily allocate contiguous books and count required students" }, { label: "B", text: "Sort books and split evenly" }, { label: "C", text: "Assign every other book to the same student" }, { label: "D", text: "Use a stack of pages" }], "A", "For a fixed limit, the greedy contiguous scan determines if the limit is feasible."),
    q("Why does binary search work?", [{ label: "A", text: "If a page limit is feasible, any larger limit is also feasible" }, { label: "B", text: "The books are already unique" }, { label: "C", text: "The answer is always the average" }, { label: "D", text: "Students can reorder books" }], "A", "Feasibility is monotonic over the maximum allowed pages."),
  ],
  51: [
    q("What does the stack represent in adjacent duplicate removal?", [{ label: "A", text: "The current string after resolving removals so far" }, { label: "B", text: "All duplicate positions only" }, { label: "C", text: "Characters sorted alphabetically" }, { label: "D", text: "Only the last input character" }], "A", "The stack holds characters that remain after processing removals up to the current point."),
    q("When should the top of the stack be popped?", [{ label: "A", text: "When it equals the current character" }, { label: "B", text: "When it is smaller than the current character" }, { label: "C", text: "At every vowel" }, { label: "D", text: "Only at the end" }], "A", "Equal adjacent characters cancel each other."),
    q("Why can removals cascade correctly with a stack?", [{ label: "A", text: "After a pop, the new top becomes adjacent to future characters" }, { label: "B", text: "The stack prevents all future removals" }, { label: "C", text: "The stack sorts the string" }, { label: "D", text: "The stack stores only duplicates" }], "A", "Cascading removals emerge naturally from the current unresolved prefix."),
  ],
  52: [
    q("What condition makes a replacement window valid?", [{ label: "A", text: "windowLength - maxCharacterFrequency <= k" }, { label: "B", text: "windowLength equals k" }, { label: "C", text: "All characters are already distinct" }, { label: "D", text: "The first and last characters differ" }], "A", "All non-majority characters in the window can be replaced to match the majority character."),
    q("Why can the window be processed in O(n)?", [{ label: "A", text: "The right pointer advances once and the left pointer only moves forward when invalid" }, { label: "B", text: "Every substring is generated" }, { label: "C", text: "The string is sorted first" }, { label: "D", text: "k is always zero" }], "A", "Sliding-window pointer movement is monotonic."),
    q("Which edge case should return the longest existing run when k=0?", [{ label: "A", text: "No replacements are allowed" }, { label: "B", text: "All characters can be replaced" }, { label: "C", text: "The input is empty" }, { label: "D", text: "Only lowercase letters are present" }], "A", "With zero replacements, the window must already contain one repeated character only."),
  ],
  53: [
    q("What does dp[i][j] represent for interleaving strings?", [{ label: "A", text: "Whether first[0..i) and second[0..j) can form target[0..i+j)" }, { label: "B", text: "The longest common substring length" }, { label: "C", text: "The sorted order of both strings" }, { label: "D", text: "The number of vowels used" }], "A", "The target prefix length is determined by how many characters are taken from each source string."),
    q("What early check avoids unnecessary DP?", [{ label: "A", text: "len(first) + len(second) must equal len(target)" }, { label: "B", text: "first and second must have equal length" }, { label: "C", text: "target must be sorted" }, { label: "D", text: "first must be a prefix of target" }], "A", "If lengths do not add up, interleaving is impossible."),
    q("What is the typical complexity?", [{ label: "A", text: "O(len(first) * len(second))" }, { label: "B", text: "O(n!)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1)" }], "A", "The DP table has one state for each pair of prefix lengths."),
  ],
  54: [
    q("Which operations are considered in edit distance DP?", [{ label: "A", text: "Insert, delete, and replace" }, { label: "B", text: "Only swap adjacent characters" }, { label: "C", text: "Only delete vowels" }, { label: "D", text: "Only sort both strings" }], "A", "The problem allows exactly these three operation types."),
    q("What happens when source[i-1] equals target[j-1]?", [{ label: "A", text: "No new operation is needed, so use dp[i-1][j-1]" }, { label: "B", text: "Always add one replacement" }, { label: "C", text: "Delete both strings" }, { label: "D", text: "Restart DP from zero" }], "A", "Matching characters can be carried over without edit cost."),
    q("What is the time complexity for lengths m and n?", [{ label: "A", text: "O(m*n)" }, { label: "B", text: "O(m+n) always" }, { label: "C", text: "O(log(m+n))" }, { label: "D", text: "O(1)" }], "A", "Each pair of prefixes is evaluated once."),
  ],
  55: [
    q("What state is useful for at most two stock transactions?", [{ label: "A", text: "Best values after first buy, first sell, second buy, and second sell" }, { label: "B", text: "Only the maximum price" }, { label: "C", text: "Only the minimum price after the final day" }, { label: "D", text: "A sorted copy of prices" }], "A", "The four-state DP tracks the best profit after each transaction phase."),
    q("Why can the answer be zero?", [{ label: "A", text: "If prices never allow profitable selling after buying" }, { label: "B", text: "Because two transactions are mandatory" }, { label: "C", text: "Because prices are always negative" }, { label: "D", text: "Because buying creates profit immediately" }], "A", "The trader may choose not to trade when every transaction would lose money."),
    q("What is the optimal time complexity?", [{ label: "A", text: "O(n)" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(n log n)" }, { label: "D", text: "O(1) without reading prices" }], "A", "The four DP states can be updated in one pass."),
  ],
  56: [
    q("What DP state is common for at most k stock transactions?", [{ label: "A", text: "Transaction count and whether currently holding a stock" }, { label: "B", text: "Only the largest price seen" }, { label: "C", text: "Sorted prices and day names" }, { label: "D", text: "Number of equal adjacent prices" }], "A", "Buying/selling decisions depend on remaining transactions and holding state."),
    q("What optimization applies when k is very large relative to days?", [{ label: "A", text: "Treat it like unlimited transactions and sum positive price differences" }, { label: "B", text: "Return zero immediately" }, { label: "C", text: "Sort prices descending" }, { label: "D", text: "Use only the first k prices" }], "A", "If k >= n/2, the transaction limit no longer constrains profitable trades."),
    q("What is the typical DP complexity before unlimited-transaction optimization?", [{ label: "A", text: "O(n*k)" }, { label: "B", text: "O(n!)" }, { label: "C", text: "O(log k)" }, { label: "D", text: "O(1)" }], "A", "Each day updates states for each possible transaction count."),
  ],
  57: [
    q("What DP value is stored for each cell in the maximal square problem?", [{ label: "A", text: "The side length of the largest all-1 square ending at that cell" }, { label: "B", text: "The number of 1s in the entire row" }, { label: "C", text: "The distance to the nearest zero" }, { label: "D", text: "The sorted column index" }], "A", "A square ending at a cell depends on its top, left, and top-left neighbors."),
    q("What transition is used when matrix[i][j] is 1?", [{ label: "A", text: "1 + min(top, left, top-left)" }, { label: "B", text: "1 + max(top, left, top-left)" }, { label: "C", text: "row index + column index" }, { label: "D", text: "Always 1" }], "A", "The smallest neighboring square limits how large the new square can be."),
    q("Why return area instead of side length?", [{ label: "A", text: "The problem asks for area, so square the maximum side length" }, { label: "B", text: "The side length is always zero" }, { label: "C", text: "Area is the same as perimeter" }, { label: "D", text: "The matrix is always 1x1" }], "A", "Area of a square is side length squared."),
  ],
  58: [
    q("What recurrence counts stairway paths?", [{ label: "A", text: "ways[n] = ways[n-1] + ways[n-2]" }, { label: "B", text: "ways[n] = n * ways[n-1]" }, { label: "C", text: "ways[n] = ways[n-3]" }, { label: "D", text: "ways[n] = 1 for all n" }], "A", "The final move is either one step or two steps."),
    q("What is the efficient complexity using iteration?", [{ label: "A", text: "O(n) time and O(1) space with two previous values" }, { label: "B", text: "O(2^n) time" }, { label: "C", text: "O(n^2) space" }, { label: "D", text: "O(log n) using sorting" }], "A", "Only the previous two counts are needed."),
    q("Which base case matches the examples?", [{ label: "A", text: "n=2 has 2 ways" }, { label: "B", text: "n=2 has 1 way" }, { label: "C", text: "n=3 has 2 ways" }, { label: "D", text: "n=1 has 0 ways" }], "A", "For two steps, the paths are 1+1 and 2."),
  ],
  59: [
    q("What choice is made at each house in the DP?", [{ label: "A", text: "Rob it and add best up to i-2, or skip it and keep best up to i-1" }, { label: "B", text: "Always rob the larger of current and next" }, { label: "C", text: "Rob every even index only" }, { label: "D", text: "Sort houses by treasure" }], "A", "The adjacent-house restriction creates the classic include/exclude recurrence."),
    q("What is the optimal space usage?", [{ label: "A", text: "O(1), keeping only two previous DP values" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(n!)" }, { label: "D", text: "O(log n) because of binary search" }], "A", "Each DP state depends only on the previous two states."),
    q("Which edge case should return the only house value?", [{ label: "A", text: "A single-house input" }, { label: "B", text: "All houses equal" }, { label: "C", text: "Houses sorted ascending" }, { label: "D", text: "Two adjacent houses" }], "A", "With one house, robbing it is the best valid choice."),
  ],
  60: [
    q("What does dp[i] represent in word break?", [{ label: "A", text: "Whether text[0:i] can be segmented into dictionary words" }, { label: "B", text: "The number of characters in the dictionary" }, { label: "C", text: "Whether text[i] is a vowel" }, { label: "D", text: "The sorted order of dictionary words" }], "A", "The segmentation decision is naturally expressed over prefixes."),
    q("Why should dictionary words be stored in a set?", [{ label: "A", text: "For fast membership checks of candidate substrings" }, { label: "B", text: "To preserve duplicate words" }, { label: "C", text: "To sort by length automatically" }, { label: "D", text: "To prevent using a word more than once" }], "A", "Set lookup avoids scanning the whole dictionary for every substring."),
    q("Which edge case is important?", [{ label: "A", text: "Words may be reused multiple times" }, { label: "B", text: "The dictionary must be empty" }, { label: "C", text: "Only one-character text is allowed" }, { label: "D", text: "The answer is always true if the first word matches" }], "A", "The DP must not remove words from availability after using them."),
  ],
  61: [
    q("What does dp[amount] store in coin change?", [{ label: "A", text: "Minimum number of coins needed to make that amount" }, { label: "B", text: "Maximum coin denomination seen so far" }, { label: "C", text: "Number of sorted coin orders" }, { label: "D", text: "Whether the amount is prime" }], "A", "Each state keeps the best known minimum coin count for an amount."),
    q("Why initialize unreachable states to infinity?", [{ label: "A", text: "So impossible amounts do not look better than valid solutions" }, { label: "B", text: "So every amount returns infinity" }, { label: "C", text: "To force greedy selection" }, { label: "D", text: "To sort the coins" }], "A", "Infinity marks states that have not yet been formed."),
    q("What should be returned if the target cannot be formed?", [{ label: "A", text: "-1" }, { label: "B", text: "0" }, { label: "C", text: "amount" }, { label: "D", text: "The largest coin" }], "A", "The problem requires -1 for impossible amounts."),
  ],
  62: [
    q("What does the O(n log n) LIS approach maintain?", [{ label: "A", text: "tails[i], the smallest possible tail value for an increasing subsequence of length i+1" }, { label: "B", text: "A sorted copy of the full input only" }, { label: "C", text: "The sum of all increasing pairs" }, { label: "D", text: "A stack of duplicate values" }], "A", "The tails array supports binary replacement while preserving possible subsequence lengths."),
    q("Why use lower_bound for strictly increasing subsequences?", [{ label: "A", text: "Equal values should replace an existing tail, not extend the length" }, { label: "B", text: "Equal values always create a longer subsequence" }, { label: "C", text: "It sorts the original array" }, { label: "D", text: "It removes negative numbers" }], "A", "Strict increase does not allow equal adjacent values in the subsequence."),
    q("Which edge case should return 1?", [{ label: "A", text: "All values are equal and the array is non-empty" }, { label: "B", text: "The array is strictly increasing" }, { label: "C", text: "The array has no numbers" }, { label: "D", text: "All values are negative" }], "A", "Only one of equal repeated values can be chosen in a strictly increasing subsequence."),
  ],
  63: [
    q("What should binary search return when the target is absent?", [{ label: "A", text: "The lower_bound insertion index" }, { label: "B", text: "-1 always" }, { label: "C", text: "The last index always" }, { label: "D", text: "The target value" }], "A", "The required insertion point is the first index with value >= target."),
    q("What is the expected complexity?", [{ label: "A", text: "O(log n)" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(n log n) due to sorting" }, { label: "D", text: "O(1)" }], "A", "The array is sorted and distinct, allowing binary search."),
    q("Which edge case should return n?", [{ label: "A", text: "The target is greater than every array element" }, { label: "B", text: "The target equals the first element" }, { label: "C", text: "The target is smaller than all elements" }, { label: "D", text: "The array has length one" }], "A", "If target belongs after the last element, the insertion index is n."),
  ],
  64: [
    q("How can the matrix be searched as one sorted structure?", [{ label: "A", text: "Treat index mid as row = mid / cols and col = mid % cols" }, { label: "B", text: "Search only the first column" }, { label: "C", text: "Sort every row again" }, { label: "D", text: "Use DFS from the top-left cell" }], "A", "The row ordering makes the matrix equivalent to a flattened sorted array."),
    q("What is the expected complexity?", [{ label: "A", text: "O(log(rows * cols))" }, { label: "B", text: "O(rows * cols)" }, { label: "C", text: "O(rows^2 * cols^2)" }, { label: "D", text: "O(1)" }], "A", "Binary search over all cells uses logarithmic comparisons."),
    q("Which edge case matters?", [{ label: "A", text: "A 1x1 matrix where the only value may or may not be the target" }, { label: "B", text: "A matrix with unsorted rows" }, { label: "C", text: "A target that is always positive" }, { label: "D", text: "A matrix with duplicate rows only" }], "A", "Small dimensions often expose boundary errors in index conversion."),
  ],
  65: [
    q("What comparison guides binary search for a peak?", [{ label: "A", text: "Compare nums[mid] with nums[mid+1]" }, { label: "B", text: "Compare nums[0] with nums[-1]" }, { label: "C", text: "Compare every pair of elements" }, { label: "D", text: "Sort the array first" }], "A", "If nums[mid] < nums[mid+1], a peak must exist to the right; otherwise one exists at mid or left."),
    q("Why is it valid to return any peak?", [{ label: "A", text: "The problem accepts the index of any element greater than its neighbors" }, { label: "B", text: "There is always exactly one peak" }, { label: "C", text: "The first element is always a peak" }, { label: "D", text: "The array is always sorted" }], "A", "The requirement does not demand the leftmost or largest peak."),
    q("Which edge case should return index 0?", [{ label: "A", text: "A single-element array" }, { label: "B", text: "Any decreasing array must return the last index" }, { label: "C", text: "Any increasing array must return index 0" }, { label: "D", text: "An array with duplicates only" }], "A", "With outside values considered smaller, the sole element is a peak."),
  ],
  66: [
    q("How do you decide which half of a rotated sorted array is sorted?", [{ label: "A", text: "Compare nums[left] with nums[mid]" }, { label: "B", text: "Compare target with array length" }, { label: "C", text: "Sort both halves first" }, { label: "D", text: "Check only nums[mid] parity" }], "A", "At least one half is sorted when values are distinct, and this comparison identifies it."),
    q("What is the expected complexity?", [{ label: "A", text: "O(log n)" }, { label: "B", text: "O(n)" }, { label: "C", text: "O(n log n)" }, { label: "D", text: "O(n^2)" }], "A", "The search discards half the array each step."),
    q("Which edge case is important?", [{ label: "A", text: "A one-element rotated array" }, { label: "B", text: "An array with unsorted random values" }, { label: "C", text: "A target that is always present" }, { label: "D", text: "Duplicate values in every position" }], "A", "Single-element arrays test boundary handling for left, right, and mid."),
  ],
  67: [
    q("What data structure is best for tracking magazine characters?", [{ label: "A", text: "A frequency map or fixed-size character count array" }, { label: "B", text: "A stack of words" }, { label: "C", text: "A sorted list of indexes only" }, { label: "D", text: "A graph of characters" }], "A", "Each note character consumes one available magazine count."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n+m), where n and m are note and magazine lengths" }, { label: "B", text: "O(n*m) always" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1) without reading strings" }], "A", "Counting magazine characters and consuming note characters are linear operations."),
    q("Which edge case should return false?", [{ label: "A", text: "The note needs a character more times than the magazine provides" }, { label: "B", text: "The magazine is longer than the note" }, { label: "C", text: "The note has one character" }, { label: "D", text: "Both strings share a character" }], "A", "Availability is based on frequency, not just existence."),
  ],
  68: [
    q("Why are two maps or a map plus used set needed?", [{ label: "A", text: "To enforce both forward mapping and one-to-one reverse uniqueness" }, { label: "B", text: "To count vowels in both strings" }, { label: "C", text: "To sort the strings" }, { label: "D", text: "To allow multiple first characters to map to one second character" }], "A", "Isomorphism requires consistent mapping with no two source characters sharing one target character."),
    q("What early condition should be checked?", [{ label: "A", text: "The two strings must have the same length" }, { label: "B", text: "Both strings must be sorted" }, { label: "C", text: "Both strings must have no duplicates" }, { label: "D", text: "The first character must match exactly" }], "A", "A character-by-character mapping is impossible for unequal lengths."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time with O(k) space for distinct characters" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(n log n) because sorting is required" }, { label: "D", text: "O(1) for all strings" }], "A", "Each character pair is processed once."),
  ],
  69: [
    q("What must be true for a sentence to follow a pattern?", [{ label: "A", text: "Each pattern character maps to one word and each word maps back to one character" }, { label: "B", text: "All words must be unique" }, { label: "C", text: "Pattern length can differ from word count" }, { label: "D", text: "Words must be sorted alphabetically" }], "A", "The relationship is bijective between pattern symbols and words."),
    q("What early validation is necessary?", [{ label: "A", text: "The number of words must equal the pattern length" }, { label: "B", text: "The sentence must contain no spaces" }, { label: "C", text: "The pattern must contain only a and b" }, { label: "D", text: "Every word must have equal length" }], "A", "A one-to-one mapping cannot exist if counts differ."),
    q("Which case should fail?", [{ label: "A", text: "Two pattern letters map to the same word" }, { label: "B", text: "The same pattern letter appears multiple times with the same word" }, { label: "C", text: "The sentence has four words" }, { label: "D", text: "The pattern has repeated letters" }], "A", "Reverse uniqueness is required for the mapping to be valid."),
  ],
  70: [
    q("What does an anagram check compare?", [{ label: "A", text: "Character frequencies in both strings" }, { label: "B", text: "Only string lengths" }, { label: "C", text: "Only first and last characters" }, { label: "D", text: "Alphabetical order of original strings" }], "A", "Anagrams require identical counts of every character."),
    q("What is a useful early rejection?", [{ label: "A", text: "Different string lengths" }, { label: "B", text: "Both strings start with the same letter" }, { label: "C", text: "The strings are lowercase" }, { label: "D", text: "The strings contain duplicate characters" }], "A", "Different lengths cannot contain the same character multiset."),
    q("What is the expected complexity for lowercase strings?", [{ label: "A", text: "O(n) time and O(1) extra space with a fixed count array" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(n!)" }], "A", "A fixed-size alphabet count array is constant space."),
  ],
  71: [
    q("What key should be used to group anagrams while preserving input order?", [{ label: "A", text: "A normalized signature such as sorted characters or frequency tuple" }, { label: "B", text: "The original word index only" }, { label: "C", text: "The first character only" }, { label: "D", text: "The word length only" }], "A", "Anagrams share the same sorted-character or frequency signature."),
    q("How should deterministic group order be preserved?", [{ label: "A", text: "Create groups when their signature first appears and append words in input order" }, { label: "B", text: "Sort groups by size descending" }, { label: "C", text: "Reverse every group before returning" }, { label: "D", text: "Use a random hash order" }], "A", "The requirement is based on first occurrence and original word order."),
    q("What is the typical complexity using sorted-string keys?", [{ label: "A", text: "O(totalChars log maxWordLength)" }, { label: "B", text: "O(1)" }, { label: "C", text: "O(numberOfWords!)" }, { label: "D", text: "O(log numberOfWords)" }], "A", "Each word key may require sorting its characters."),
  ],
  72: [
    q("What should be stored while scanning for two-sum indices?", [{ label: "A", text: "Previously seen value to index" }, { label: "B", text: "Only the largest value" }, { label: "C", text: "A sorted list of all outputs" }, { label: "D", text: "The target repeated n times" }], "A", "For each value, the complement may already have been seen."),
    q("Why check the complement before storing the current index?", [{ label: "A", text: "To avoid using the same element twice" }, { label: "B", text: "To sort the indices" }, { label: "C", text: "To remove duplicate targets" }, { label: "D", text: "To force the first index to be larger" }], "A", "The same array element cannot form the pair with itself."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) average time with a hash map" }, { label: "B", text: "O(n^2) necessarily" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1) without reading input" }], "A", "Hash lookups for complements are average constant time."),
  ],
  73: [
    q("How can cycles be detected in the joyful number process?", [{ label: "A", text: "Use a seen set or Floyd's cycle detection" }, { label: "B", text: "Sort the digits every round" }, { label: "C", text: "Stop after one replacement" }, { label: "D", text: "Check whether n is even" }], "A", "Non-joyful numbers eventually repeat a previous value."),
    q("What is the success condition?", [{ label: "A", text: "The process reaches 1" }, { label: "B", text: "The process reaches any single digit" }, { label: "C", text: "The process reaches an even number" }, { label: "D", text: "The number of digits increases" }], "A", "By definition, a joyful number eventually becomes 1."),
    q("Which edge case should return true?", [{ label: "A", text: "n = 1" }, { label: "B", text: "n = 2" }, { label: "C", text: "Any prime number" }, { label: "D", text: "Any two-digit number" }], "A", "The process is already at the target value 1."),
  ],
  74: [
    q("What should be stored for each value to check nearby repeats?", [{ label: "A", text: "The most recent index where the value appeared" }, { label: "B", text: "The first value in the array only" }, { label: "C", text: "The sorted position of the value" }, { label: "D", text: "The count of all values after sorting" }], "A", "The nearest previous occurrence is enough to check distance <= k."),
    q("When can the algorithm return true?", [{ label: "A", text: "When currentIndex - previousIndex <= k for the same value" }, { label: "B", text: "When any two values differ by k" }, { label: "C", text: "When the array length is greater than k" }, { label: "D", text: "When all values are distinct" }], "A", "The condition is about equal values at nearby indexes."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time with a hash map" }, { label: "B", text: "O(n^2) always" }, { label: "C", text: "O(n log n) due to required sorting" }, { label: "D", text: "O(1)" }], "A", "Each value is checked and updated once."),
  ],
  75: [
    q("Why start counting only from numbers whose predecessor is absent?", [{ label: "A", text: "They are starts of consecutive chains" }, { label: "B", text: "They are always the smallest array elements" }, { label: "C", text: "They must be duplicates" }, { label: "D", text: "They are sorted by input order" }], "A", "Starting only at chain beginnings prevents recounting the same sequence."),
    q("What data structure enables O(1) average membership checks?", [{ label: "A", text: "A hash set of all numbers" }, { label: "B", text: "A queue of indexes" }, { label: "C", text: "A sorted string" }, { label: "D", text: "A stack of duplicates" }], "A", "The set lets the algorithm test x-1 and x+1 quickly."),
    q("What edge case should not inflate the answer?", [{ label: "A", text: "Duplicate numbers in the input" }, { label: "B", text: "Negative numbers" }, { label: "C", text: "A sequence starting at zero" }, { label: "D", text: "A sequence of length one" }], "A", "Duplicates should be collapsed by the set and not counted as extra chain length."),
  ],
  76: [
    q("What should be ignored before comparing characters?", [{ label: "A", text: "Non-alphanumeric characters and case differences" }, { label: "B", text: "All vowels" }, { label: "C", text: "All digits" }, { label: "D", text: "Only spaces, but not punctuation" }], "A", "The palindrome rule compares only normalized alphanumeric characters."),
    q("Which pointer movement is correct?", [{ label: "A", text: "Move inward, skipping invalid characters before comparing" }, { label: "B", text: "Move both pointers only when characters are equal, without skipping" }, { label: "C", text: "Sort the string and compare ends" }, { label: "D", text: "Compare only adjacent characters" }], "A", "Two pointers can validate the normalized phrase without building a new string."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(1) extra space with two pointers" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(n!)" }], "A", "Each character is skipped or compared at most once."),
  ],
  77: [
    q("How should the subsequence pointer for small move?", [{ label: "A", text: "Advance only when the current large character matches it" }, { label: "B", text: "Advance at every character in large" }, { label: "C", text: "Move backward from the end only" }, { label: "D", text: "Reset to zero after every mismatch" }], "A", "A subsequence preserves order but may skip unmatched characters."),
    q("What is the expected complexity?", [{ label: "A", text: "O(len(large))" }, { label: "B", text: "O(len(small) * len(large)) always" }, { label: "C", text: "O(log len(large))" }, { label: "D", text: "O(1)" }], "A", "A single scan of the larger string is enough."),
    q("Which edge case should return true?", [{ label: "A", text: "An empty small string, if allowed" }, { label: "B", text: "A small string longer than large" }, { label: "C", text: "A character not present in large" }, { label: "D", text: "Reversed order only" }], "A", "The empty string is a subsequence of any string under the standard definition."),
  ],
  78: [
    q("Why can two pointers solve sorted two-sum?", [{ label: "A", text: "The sorted order tells whether to increase the left pointer or decrease the right pointer" }, { label: "B", text: "The answer is always at the ends" }, { label: "C", text: "Values must be unique" }, { label: "D", text: "Sorting is required after every move" }], "A", "If the sum is too small move left up; if too large move right down."),
    q("What index format should be returned?", [{ label: "A", text: "1-based indices with the first smaller than the second" }, { label: "B", text: "0-based indices in any order" }, { label: "C", text: "Values instead of indices" }, { label: "D", text: "Only the first index" }], "A", "The problem explicitly asks for 1-based coordinates."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n)" }, { label: "B", text: "O(n log n) because sorting is needed" }, { label: "C", text: "O(n^2)" }, { label: "D", text: "O(1)" }], "A", "The input is already sorted, so a linear two-pointer scan is sufficient."),
  ],
  79: [
    q("What counts as a segment?", [{ label: "A", text: "A continuous group of non-space characters" }, { label: "B", text: "Every character including spaces" }, { label: "C", text: "Only alphabetic words without punctuation" }, { label: "D", text: "Every vowel group" }], "A", "Segments are separated by spaces and may contain punctuation."),
    q("How can segments be counted in one pass?", [{ label: "A", text: "Count a character when it is non-space and either at index 0 or preceded by a space" }, { label: "B", text: "Count every space" }, { label: "C", text: "Sort words first" }, { label: "D", text: "Use binary search over characters" }], "A", "Segment starts identify each continuous non-space block exactly once."),
    q("Which edge case should be handled?", [{ label: "A", text: "Leading or multiple spaces should not create empty segments" }, { label: "B", text: "All letters must be lowercase" }, { label: "C", text: "Punctuation must be removed" }, { label: "D", text: "A segment can contain only digits" }], "A", "Counting starts avoids treating empty gaps as segments."),
  ],
  80: [
    q("What mathematical condition defines k complete rows?", [{ label: "A", text: "k*(k+1)/2 <= n" }, { label: "B", text: "k^2 <= n" }, { label: "C", text: "2*k <= n" }, { label: "D", text: "k! <= n" }], "A", "The first k rows require the sum 1+2+...+k coins."),
    q("How can the maximum k be found efficiently?", [{ label: "A", text: "Binary search on k" }, { label: "B", text: "Sort all coins" }, { label: "C", text: "Use a hash map of coin labels" }, { label: "D", text: "Always return n" }], "A", "The predicate k rows can be built is monotonic."),
    q("Which edge case should return 1?", [{ label: "A", text: "n = 1" }, { label: "B", text: "n = 2" }, { label: "C", text: "n = 0 under positive constraints" }, { label: "D", text: "Any odd n" }], "A", "One coin builds exactly one complete row."),
  ],
  81: [
    q("How can missing numbers be found in O(n) without extra sorting?", [{ label: "A", text: "Mark seen values by index or sign in the array" }, { label: "B", text: "Try every pair of values" }, { label: "C", text: "Use binary search on unsorted input" }, { label: "D", text: "Return all duplicate values" }], "A", "Values are constrained to 1..n, so each value maps to an index."),
    q("Why are duplicates not a problem for marking?", [{ label: "A", text: "Marking an already marked index again does not change the result" }, { label: "B", text: "Duplicates must be removed from the input first" }, { label: "C", text: "Duplicates always indicate all values are present" }, { label: "D", text: "Duplicates are impossible" }], "A", "Repeated values simply point to the same seen index."),
    q("Which indices correspond to missing values after marking?", [{ label: "A", text: "Unmarked positions, converted back to value index+1" }, { label: "B", text: "Positions containing the largest values" }, { label: "C", text: "Only index 0" }, { label: "D", text: "Marked positions only" }], "A", "If a position was never marked, its corresponding value did not appear."),
  ],
  82: [
    q("What greedy strategy maximizes satisfied children?", [{ label: "A", text: "Sort greed and cookies, then assign the smallest sufficient cookie to the least greedy remaining child" }, { label: "B", text: "Give the largest cookie to the least greedy child always" }, { label: "C", text: "Assign cookies in original order only" }, { label: "D", text: "Ignore cookie sizes" }], "A", "Using the smallest sufficient cookie preserves larger cookies for greedier children."),
    q("What is the complexity dominated by?", [{ label: "A", text: "Sorting both arrays, O(n log n + m log m)" }, { label: "B", text: "Pair checking, O(n*m), necessarily" }, { label: "C", text: "A constant-time formula" }, { label: "D", text: "Binary conversion" }], "A", "After sorting, the two-pointer assignment is linear."),
    q("Which edge case should return 0?", [{ label: "A", text: "No cookie is large enough for any child" }, { label: "B", text: "There are more cookies than children" }, { label: "C", text: "All greed values are equal" }, { label: "D", text: "All cookies are sorted" }], "A", "A child is satisfied only if assigned a cookie meeting their greed value."),
  ],
  83: [
    q("What property identifies a repeating substring pattern?", [{ label: "A", text: "The string appears inside (text + text) with the first and last characters removed" }, { label: "B", text: "The string has at least one duplicate character" }, { label: "C", text: "The string length is prime" }, { label: "D", text: "The string is a palindrome" }], "A", "This classic check detects whether the string is composed of repeated smaller blocks."),
    q("What should be tested for candidate block lengths in a direct approach?", [{ label: "A", text: "Only lengths that divide the full string length" }, { label: "B", text: "Only length 1" }, { label: "C", text: "All lengths greater than n" }, { label: "D", text: "Only odd lengths" }], "A", "A repeated block must fit an integer number of times."),
    q("Which edge case should return false?", [{ label: "A", text: "A non-empty string with no smaller block repetition" }, { label: "B", text: "A string like abab" }, { label: "C", text: "A string made of the same character repeated" }, { label: "D", text: "A string with even length always" }], "A", "The string must be constructible by repeating a proper substring."),
  ],
  84: [
    q("What operation highlights differing bit positions?", [{ label: "A", text: "x XOR y" }, { label: "B", text: "x AND y" }, { label: "C", text: "x OR y only" }, { label: "D", text: "x + y" }], "A", "XOR has 1s exactly where the two inputs differ."),
    q("How is the answer obtained after XOR?", [{ label: "A", text: "Count the set bits" }, { label: "B", text: "Count decimal digits" }, { label: "C", text: "Reverse the binary string" }, { label: "D", text: "Find the largest bit only" }], "A", "Each set bit in the XOR corresponds to one different position."),
    q("What is the complexity in terms of integer bit width?", [{ label: "A", text: "O(number of bits) or O(set bits) with Brian Kernighan's method" }, { label: "B", text: "O(x*y)" }, { label: "C", text: "O(n log n) with sorting" }, { label: "D", text: "O(1) only for all languages regardless of representation" }], "A", "The algorithm processes bits of the XOR value."),
  ],
  85: [
    q("How does each land cell contribute to perimeter?", [{ label: "A", text: "Add one for each side touching water or the grid boundary" }, { label: "B", text: "Always add four, ignoring neighbors" }, { label: "C", text: "Add one only for diagonal water" }, { label: "D", text: "Subtract water cells from total cells" }], "A", "Perimeter is based on exposed horizontal and vertical sides."),
    q("What is the expected complexity?", [{ label: "A", text: "O(rows * cols)" }, { label: "B", text: "O((rows * cols)^2)" }, { label: "C", text: "O(log rows)" }, { label: "D", text: "O(1)" }], "A", "Each cell is checked with its four neighbors."),
    q("Which edge case should return 4?", [{ label: "A", text: "A 1x1 grid containing land" }, { label: "B", text: "A 1x1 grid containing water" }, { label: "C", text: "Two adjacent land cells" }, { label: "D", text: "A diagonal-only land pair" }], "A", "A single land cell has all four sides exposed."),
  ],
  86: [
    q("What mask is needed to flip only significant bits?", [{ label: "A", text: "A mask of all 1s with the same bit length as num" }, { label: "B", text: "A mask of all 0s" }, { label: "C", text: "A mask with only the sign bit" }, { label: "D", text: "A mask equal to num squared" }], "A", "Leading zeroes are ignored, so only the significant bit range should be flipped."),
    q("How can the complement be computed once the mask is known?", [{ label: "A", text: "mask XOR num, or mask - num" }, { label: "B", text: "num OR mask equals the answer always" }, { label: "C", text: "num AND mask equals the answer always" }, { label: "D", text: "num plus mask" }], "A", "Within the mask, XOR flips every significant bit."),
    q("Which edge case should return 0?", [{ label: "A", text: "num = 1" }, { label: "B", text: "num = 2" }, { label: "C", text: "num = 10" }, { label: "D", text: "Any even number" }], "A", "The significant bits of 1 are just '1', which flips to '0'."),
  ],
  87: [
    q("What preprocessing is required before grouping the license key?", [{ label: "A", text: "Remove dashes and convert letters to uppercase" }, { label: "B", text: "Sort all characters alphabetically" }, { label: "C", text: "Remove all digits" }, { label: "D", text: "Reverse every group first" }], "A", "The formatted key is based on cleaned uppercase alphanumeric characters."),
    q("How should group sizes be arranged?", [{ label: "A", text: "All groups have length k except possibly the first" }, { label: "B", text: "All groups have length k except the last" }, { label: "C", text: "Groups are random sizes" }, { label: "D", text: "Each group contains exactly one character" }], "A", "Grouping from the end ensures the first group is the only shorter group."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n)" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(n!)" }], "A", "The key is cleaned and grouped in linear time."),
  ],
  88: [
    q("What running values are needed to find the longest streak of 1s?", [{ label: "A", text: "Current streak length and best streak length" }, { label: "B", text: "A sorted copy of the array" }, { label: "C", text: "The number of zeros only" }, { label: "D", text: "A queue of all indexes" }], "A", "Reset current streak on 0 and update the best on 1s."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(1) space" }, { label: "B", text: "O(n log n)" }, { label: "C", text: "O(n^2)" }, { label: "D", text: "O(1) without scanning" }], "A", "One pass with two counters is sufficient."),
    q("Which edge case should return 0?", [{ label: "A", text: "An array containing only 0s" }, { label: "B", text: "An array containing only 1s" }, { label: "C", text: "An array starting with 1" }, { label: "D", text: "An array ending with 1" }], "A", "No consecutive 1s exist when every value is 0."),
  ],
  89: [
    q("Where should the search for width start to minimize L-W?", [{ label: "A", text: "At floor(sqrt(area)) and move downward until a divisor is found" }, { label: "B", text: "At 1 and stop immediately" }, { label: "C", text: "At area and move upward" }, { label: "D", text: "At a random factor" }], "A", "The factor closest to the square root gives the most balanced rectangle."),
    q("Why must L be area / W once W is chosen?", [{ label: "A", text: "Because L * W must equal area" }, { label: "B", text: "Because L must always equal W" }, { label: "C", text: "Because W must be prime" }, { label: "D", text: "Because area is always even" }], "A", "A valid rectangle factor pair must multiply exactly to the area."),
    q("Which edge case produces [area, 1]?", [{ label: "A", text: "A prime area" }, { label: "B", text: "A perfect square" }, { label: "C", text: "An even area" }, { label: "D", text: "Area equal to 4" }], "A", "Prime numbers have no factor pair other than 1 and themselves."),
  ],
  90: [
    q("How should overlapping poison intervals be counted?", [{ label: "A", text: "Add only the non-overlapping extension caused by each attack" }, { label: "B", text: "Add duration for every attack without checking overlap" }, { label: "C", text: "Ignore attacks after the first" }, { label: "D", text: "Sort durations instead of attack times" }], "A", "Overlapping poisoned time should not be counted twice."),
    q("What formula is used between consecutive attack times?", [{ label: "A", text: "Add min(duration, nextAttack - currentAttack)" }, { label: "B", text: "Add max(duration, nextAttack + currentAttack)" }, { label: "C", text: "Add duration only if attacks are equal" }, { label: "D", text: "Add zero for every gap" }], "A", "Only the time until the next attack or the full duration contributes."),
    q("What final addition is required?", [{ label: "A", text: "Add the full duration of the last attack" }, { label: "B", text: "Subtract the last duration" }, { label: "C", text: "Add the number of attacks only" }, { label: "D", text: "Add the first attack time" }], "A", "The final poison interval is not cut short by a later attack."),
  ],
  91: [
    q("How can next greater values in nums2 be precomputed?", [{ label: "A", text: "Use a monotonic stack and map each value to its next greater value" }, { label: "B", text: "Sort nums2 and use adjacent values" }, { label: "C", text: "Use XOR on nums1 and nums2" }, { label: "D", text: "Check only the first element of nums2" }], "A", "A stack resolves next greater values while scanning nums2."),
    q("Why is a map useful after processing nums2?", [{ label: "A", text: "It answers each nums1 value in O(1) average time" }, { label: "B", text: "It stores nums1 in sorted order" }, { label: "C", text: "It removes all -1 answers" }, { label: "D", text: "It reverses nums2" }], "A", "Each nums1 query can directly look up the precomputed result."),
    q("What should be assigned when no greater value exists?", [{ label: "A", text: "-1" }, { label: "B", text: "0" }, { label: "C", text: "The value itself" }, { label: "D", text: "The last element of nums2" }], "A", "The problem specifies -1 when there is no greater value to the right."),
  ],
  92: [
    q("When should the printer move to a new line?", [{ label: "A", text: "When adding the next character would make the current width exceed 100" }, { label: "B", text: "After every word" }, { label: "C", text: "Only after 26 characters" }, { label: "D", text: "Whenever a vowel appears" }], "A", "The width limit controls line breaks character by character."),
    q("What is tracked during the scan?", [{ label: "A", text: "Number of lines and current line width" }, { label: "B", text: "Sorted character frequencies only" }, { label: "C", text: "A stack of previous lines" }, { label: "D", text: "The maximum letter width only" }], "A", "The output requires both final line count and last-line width."),
    q("What is the expected complexity?", [{ label: "A", text: "O(length of text)" }, { label: "B", text: "O(26 * length^2)" }, { label: "C", text: "O(log length)" }, { label: "D", text: "O(1) for any text" }], "A", "Each character is processed once."),
  ],
  93: [
    q("What formula computes the area of a triangle from three points?", [{ label: "A", text: "Half the absolute cross product/determinant" }, { label: "B", text: "The sum of all x coordinates" }, { label: "C", text: "The Manhattan distance between two points" }, { label: "D", text: "The product of the largest x and y" }], "A", "The shoelace/cross-product formula gives triangle area from coordinates."),
    q("What is the straightforward complexity for n points?", [{ label: "A", text: "O(n^3), checking all triples" }, { label: "B", text: "O(log n)" }, { label: "C", text: "O(1) without reading points" }, { label: "D", text: "O(n!)" }], "A", "The simple solution tries every combination of three points."),
    q("Which edge case should return 0.0?", [{ label: "A", text: "All points are collinear" }, { label: "B", text: "The triangle is right-angled" }, { label: "C", text: "Coordinates are positive" }, { label: "D", text: "There are exactly three non-collinear points" }], "A", "Collinear points form no area."),
  ],
  94: [
    q("What normalization is required before counting words?", [{ label: "A", text: "Lowercase words and remove punctuation" }, { label: "B", text: "Sort the paragraph characters" }, { label: "C", text: "Remove all repeated words" }, { label: "D", text: "Uppercase only banned words" }], "A", "Comparison ignores punctuation and case."),
    q("Why store banned words in a set?", [{ label: "A", text: "To skip banned words with O(1) average lookup" }, { label: "B", text: "To count banned words more often" }, { label: "C", text: "To preserve paragraph order" }, { label: "D", text: "To sort output alphabetically" }], "A", "A set makes repeated banned checks efficient."),
    q("What should determine the answer?", [{ label: "A", text: "The highest frequency among non-banned normalized words" }, { label: "B", text: "The longest word regardless of banned list" }, { label: "C", text: "The first word only" }, { label: "D", text: "The most frequent banned word" }], "A", "The required result is the most common allowed word."),
  ],
  95: [
    q("How can shortest distance to a target character be computed efficiently?", [{ label: "A", text: "Two passes, left-to-right and right-to-left" }, { label: "B", text: "Sort all characters" }, { label: "C", text: "Run BFS on every index separately" }, { label: "D", text: "Use only the first occurrence" }], "A", "One pass captures nearest target on the left and the other captures nearest on the right."),
    q("What should be stored during each pass?", [{ label: "A", text: "The most recent target index and distance from it" }, { label: "B", text: "The count of vowels" }, { label: "C", text: "Only the target character code" }, { label: "D", text: "A sorted list of all non-targets" }], "A", "Distances are computed from the nearest seen target in that direction."),
    q("What is the expected complexity?", [{ label: "A", text: "O(n) time and O(n) output space" }, { label: "B", text: "O(n^2)" }, { label: "C", text: "O(log n)" }, { label: "D", text: "O(1) output space including returned array" }], "A", "The algorithm scans the string twice and returns one distance per character."),
  ],
  96: [
    q("How does a word beginning with a consonant change in Goat Latin?", [{ label: "A", text: "Move the first letter to the end, then append ma and position-based a's" }, { label: "B", text: "Leave it unchanged and append nothing" }, { label: "C", text: "Remove the first and last letters" }, { label: "D", text: "Sort the letters alphabetically" }], "A", "The consonant rule moves the first letter before adding the suffix."),
    q("What must increase for each successive word?", [{ label: "A", text: "The number of appended 'a' characters" }, { label: "B", text: "The number of removed characters" }, { label: "C", text: "The word length before conversion" }, { label: "D", text: "The number of spaces before the word" }], "A", "The first word gets one a, the second gets two, and so on."),
    q("What is the expected complexity?", [{ label: "A", text: "O(total characters in the sentence)" }, { label: "B", text: "O(number of words squared) always" }, { label: "C", text: "O(log words)" }, { label: "D", text: "O(1)" }], "A", "Each word is transformed once with suffix work proportional to output size."),
  ],
  97: [
    q("What index parity property is used before the single element?", [{ label: "A", text: "Pairs start at even indexes before the single value" }, { label: "B", text: "Pairs start at odd indexes before the single value" }, { label: "C", text: "Every value appears at an even index" }, { label: "D", text: "The single value is always at index 0" }], "A", "In a properly paired sorted prefix, first occurrences of pairs are at even indexes."),
    q("How does binary search decide which side to keep?", [{ label: "A", text: "Compare mid with its pair neighbor after aligning mid to an even index" }, { label: "B", text: "Compare only the first and last values" }, { label: "C", text: "Sort the array again" }, { label: "D", text: "Count every value with a hash map" }], "A", "If the pair at mid is intact, the single lies to the right; otherwise left."),
    q("What edge case must return immediately?", [{ label: "A", text: "An array of length 1" }, { label: "B", text: "An array of all triples" }, { label: "C", text: "An unsorted array" }, { label: "D", text: "An array with two singles" }], "A", "The only element is the unique value."),
  ],
  98: [
    q("Why is multi-source BFS appropriate for nearest zero distances?", [{ label: "A", text: "All zero cells start at distance 0 and expand outward simultaneously" }, { label: "B", text: "Each one cell must run a separate DFS to every zero" }, { label: "C", text: "The matrix must be sorted first" }, { label: "D", text: "Only diagonal movement is allowed" }], "A", "Starting BFS from all zeros finds the nearest zero for every cell in increasing distance order."),
    q("When should a cell's distance be assigned?", [{ label: "A", text: "When it is first reached/enqueued by BFS" }, { label: "B", text: "Every time it is seen, even if already visited" }, { label: "C", text: "Only after all BFS levels end" }, { label: "D", text: "Before reading zero cells" }], "A", "The first BFS visit is the shortest path in an unweighted grid."),
    q("What is the expected complexity?", [{ label: "A", text: "O(rows * cols)" }, { label: "B", text: "O((rows * cols)^2)" }, { label: "C", text: "O(log rows)" }, { label: "D", text: "O(1)" }], "A", "Each cell is enqueued and processed at most once."),
  ],
};

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
    scoreConfig: raw.scoreConfig ?? DSA_SCORE_CONFIG,
    followUpQuestions:
      raw.followUpQuestions ??
      DSA_FOLLOW_UPS_BY_QUESTION_NUMBER[raw.questionNumber ?? bankIndexZeroBased + 1] ??
      [],
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
  {
    questionType: "Medium",
    questionName: "Merged Weave Verification",
    question: `You are given three strings first, second, and target.

Your task is to determine whether target can be formed by interleaving first and second.

An interleaving must preserve the original character order of both first and second.

Return true if target can be created this way, otherwise return false.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, first, second, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "aabcc\ndbbca\naadbbcbcac", output: "true" },
      { input: "aabcc\ndbbca\naadbbbaccc", output: "false" },
      { input: "abc\ndef\nadbcef", output: "true" }
    ],
    questionNumber: 53
  },
  {
    questionType: "Medium",
    questionName: "Ancient Script Correction Cost",
    question: `Two ancient scripts are written as strings source and target.

In one operation, you may insert one character, delete one character, or replace one character.

Your task is to find the minimum number of operations required to convert source into target.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, source, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "horse\nros", output: "3" },
      { input: "intention\nexecution", output: "5" },
      { input: "abc\nabc", output: "0" }
    ],
    questionNumber: 54
  },
  {
    questionType: "Hard",
    questionName: "Two Deal Market Profit",
    question: `A trader records the price of a stock over several days in the array prices.

The trader may complete at most two buy-sell transactions.

A new stock cannot be bought before the previously bought stock is sold.

Your task is to return the maximum profit the trader can earn.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, prices):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "8\n3 3 5 0 0 3 1 4", output: "6" },
      { input: "5\n1 2 3 4 5", output: "4" },
      { input: "5\n7 6 4 3 1", output: "0" }
    ],
    questionNumber: 55
  },
  {
    questionType: "Hard",
    questionName: "Limited Deal Market Profit",
    question: `A trader is given an array prices, where prices[i] represents the stock price on day i.

The trader may complete at most k buy-sell transactions.

A transaction consists of buying once and selling once, and another stock cannot be bought until the current one is sold.

Your task is to return the maximum possible profit.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, k, prices):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "2\n6\n3 2 6 5 0 3", output: "7" },
      { input: "2\n3\n2 4 1", output: "2" },
      { input: "3\n10\n1 2 4 2 5 7 2 4 9 0", output: "15" }
    ],
    questionNumber: 56
  },
  {
    questionType: "Medium",
    questionName: "Largest Rune Square",
    question: `A binary grid is given, where each cell contains either 0 or 1.

Your task is to find the largest square that contains only 1s.

Return the area of that square.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, matrix):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "4 5\n1 0 1 0 0\n1 0 1 1 1\n1 1 1 1 1\n1 0 0 1 0", output: "4" },
      { input: "2 2\n1 1\n1 1", output: "4" },
      { input: "3 4\n0 1 1 1\n1 1 1 1\n0 1 1 1", output: "9" }
    ],
    questionNumber: 57
  },
  {
    questionType: "Easy",
    questionName: "Stairway Step Count",
    question: `A staircase has n steps.

You can climb either 1 step or 2 steps at a time.

Your task is to determine how many distinct ways exist to reach the top of the staircase.`,
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
      { input: "2", output: "2" },
      { input: "3", output: "3" },
      { input: "5", output: "8" }
    ],
    questionNumber: 58
  },
  {
    questionType: "Medium",
    questionName: "Silent House Treasure",
    question: `A thief wants to collect treasure from houses arranged in a straight line.

Each house contains some amount of treasure, represented by the array houses.

The thief cannot rob two adjacent houses.

Your task is to return the maximum total treasure that can be collected without robbing neighboring houses.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, houses):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "4\n1 2 3 1", output: "4" },
      { input: "5\n2 7 9 3 1", output: "12" },
      { input: "1\n5", output: "5" }
    ],
    questionNumber: 59
  },
  {
    questionType: "Medium",
    questionName: "Dictionary Path Split",
    question: `You are given a string text and a dictionary of valid words.

Your task is to determine whether text can be split into one or more dictionary words.

Words from the dictionary may be reused multiple times.

Return true if such a split is possible, otherwise return false.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, text, dictionary):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "leetcode\n2\nleet code", output: "true" },
      { input: "applepenapple\n2\napple pen", output: "true" },
      { input: "catsandog\n5\ncats dog sand and cat", output: "false" }
    ],
    questionNumber: 60
  },
  {
    questionType: "Medium",
    questionName: "Minimum Coin Treasury",
    question: `A treasury contains coins with different denominations.

You are given the array coins and a target amount.

Each coin denomination may be used any number of times.

Your task is to return the minimum number of coins needed to make exactly the target amount.

If it is impossible, return -1.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, coins, amount):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "3\n1 2 5\n11", output: "3" },
      { input: "1\n2\n3", output: "-1" },
      { input: "3\n2 5 10\n6", output: "3" }
    ],
    questionNumber: 61
  },
  {
    questionType: "Medium",
    questionName: "Rising Sequence Length",
    question: `You are given an integer array nums.

A subsequence is formed by deleting zero or more elements without changing the order of the remaining elements.

Your task is to return the length of the longest strictly increasing subsequence.`,
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
      { input: "8\n10 9 2 5 3 7 101 18", output: "4" },
      { input: "6\n0 1 0 3 2 3", output: "4" },
      { input: "4\n7 7 7 7", output: "1" }
    ],
    questionNumber: 62
  },
  {
    questionType: "Easy",
    questionName: "Archive Slot Finder",
    question: `You are given a sorted array nums containing distinct integers and a target value.

Your task is to return the index where target is found.

If target is not present, return the index where it should be inserted so that nums remains sorted.`,
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
      { input: "4\n1 3 5 6\n5", output: "2" },
      { input: "4\n1 3 5 6\n2", output: "1" },
      { input: "4\n1 3 5 6\n7", output: "4" }
    ],
    questionNumber: 63
  },
  {
    questionType: "Medium",
    questionName: "Hidden Matrix Search",
    question: `A matrix is arranged so that each row is sorted in increasing order.

The first value of each row is greater than the last value of the previous row.

You are given this matrix and a target value.

Your task is to determine whether the target exists in the matrix.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, matrix, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "3 4\n1 3 5 7\n10 11 16 20\n23 30 34 60\n3", output: "true" },
      { input: "3 4\n1 3 5 7\n10 11 16 20\n23 30 34 60\n13", output: "false" },
      { input: "1 1\n5\n5", output: "true" }
    ],
    questionNumber: 64
  },
  {
    questionType: "Medium",
    questionName: "Mountain Signal Peak",
    question: `You are given an array nums where a peak element is an element strictly greater than its neighbors.

Elements outside the array are considered smaller than any element inside the array.

Your task is to return the index of any peak element.`,
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
      { input: "4\n1 2 3 1", output: "2" },
      { input: "1\n1", output: "0" },
      { input: "6\n1 2 3 4 3 2", output: "3" }
    ],
    questionNumber: 65
  },
  {
    questionType: "Medium",
    questionName: "Rotated Archive Search",
    question: `You are given a sorted array that has been rotated at an unknown position.

All values in the array are distinct.

Your task is to find the index of target in the array.

If target does not exist, return -1.`,
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
      { input: "7\n4 5 6 7 0 1 2\n0", output: "4" },
      { input: "7\n4 5 6 7 0 1 2\n3", output: "-1" },
      { input: "1\n1\n1", output: "0" }
    ],
    questionNumber: 66
  },
  {
    questionType: "Easy",
    questionName: "Message Scrap Builder",
    question: `A message note must be built using characters from a larger magazine text.

Each character from the magazine can be used at most once.

Your task is to return true if the note can be constructed from the magazine, otherwise return false.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, note, magazine):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "a\nb", output: "false" },
      { input: "aa\naab", output: "true" },
      { input: "abc\ncbaab", output: "true" }
    ],
    questionNumber: 67
  },
  {
    questionType: "Easy",
    questionName: "Twin Code Mapping",
    question: `You are given two strings first and second.

The strings are considered matching if each character in first can be consistently replaced to form second.

Different characters in first must map to different characters in second.

Your task is to return true if such a one-to-one mapping exists, otherwise return false.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, first, second):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "egg\nadd", output: "true" },
      { input: "foo\nbar", output: "false" },
      { input: "paper\ntitle", output: "true" }
    ],
    questionNumber: 68
  },
  {
    questionType: "Easy",
    questionName: "Patterned Word Trail",
    question: `You are given a pattern string and a sentence containing words separated by spaces.

Each character in the pattern must map to exactly one word.

Each word must also map back to exactly one pattern character.

Your task is to determine whether the sentence follows the given pattern.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, pattern, sentence):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "abba\ndog cat cat dog", output: "true" },
      { input: "abba\ndog cat cat fish", output: "false" },
      { input: "aaaa\ndog dog dog dog", output: "true" }
    ],
    questionNumber: 69
  },
  {
    questionType: "Easy",
    questionName: "Letter Balance Check",
    question: `You are given two strings first and second.

Your task is to determine whether second is an anagram of first.

Two strings are anagrams if they contain exactly the same characters with the same frequencies.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, first, second):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "anagram\nnagaram", output: "true" },
      { input: "rat\ncar", output: "false" },
      { input: "aacc\nccac", output: "false" }
    ],
    questionNumber: 70
  },
  {
    questionType: "Medium",
    questionName: "Anagram Vault Groups",
    question: `You are given a list of words.

Your task is to group together all words that are anagrams of each other.

For a deterministic result, keep groups in the order in which their first word appears, and keep words inside each group in their original order.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, words):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "6\neat tea tan ate nat bat", output: "[['eat','tea','ate'],['tan','nat'],['bat']]" },
      { input: "3\nabc bca cab", output: "[['abc','bca','cab']]" },
      { input: "4\na b ab ba", output: "[['a'],['b'],['ab','ba']]" }
    ],
    questionNumber: 71
  },
  {
    questionType: "Easy",
    questionName: "Target Pair Indices",
    question: `You are given an integer array nums and a target value.

Exactly two numbers in nums add up to target.

Your task is to return the indices of those two numbers.

The same element cannot be used twice.`,
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
      { input: "4\n2 7 11 15\n9", output: "[0,1]" },
      { input: "3\n3 2 4\n6", output: "[1,2]" },
      { input: "2\n3 3\n6", output: "[0,1]" }
    ],
    questionNumber: 72
  },
  {
    questionType: "Easy",
    questionName: "Joyful Number Cycle",
    question: `A positive integer is called joyful if repeatedly replacing it by the sum of the squares of its digits eventually becomes 1.

If the process enters a cycle that never reaches 1, the number is not joyful.

Your task is to determine whether the given number is joyful.`,
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
      { input: "19", output: "true" },
      { input: "2", output: "false" },
      { input: "1", output: "true" }
    ],
    questionNumber: 73
  },
  {
    questionType: "Easy",
    questionName: "Nearby Repeat Watch",
    question: `You are given an array nums and an integer k.

Your task is to determine whether there exist two equal values nums[i] and nums[j] such that i and j are different indices and the absolute difference between them is at most k.

Return true if such a pair exists, otherwise return false.`,
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
      { input: "4\n1 2 3 1\n3", output: "true" },
      { input: "4\n1 0 1 1\n1", output: "true" },
      { input: "6\n1 2 3 1 2 3\n2", output: "false" }
    ],
    questionNumber: 74
  },
  {
    questionType: "Medium",
    questionName: "Longest Consecutive Chain",
    question: `You are given an unsorted array of integers.

Your task is to find the length of the longest sequence of consecutive values.

The numbers do not need to appear next to each other in the array.`,
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
      { input: "6\n100 4 200 1 3 2", output: "4" },
      { input: "10\n0 3 7 2 5 8 4 6 0 1", output: "9" },
      { input: "4\n1 2 0 1", output: "3" }
    ],
    questionNumber: 75
  },
  {
    questionType: "Easy",
    questionName: "Clean Mirror Phrase",
    question: `You are given a string text.

After ignoring all non-alphanumeric characters and treating uppercase and lowercase letters as the same, determine whether text reads the same forward and backward.

Return true if it is a palindrome under these rules, otherwise return false.`,
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
      { input: "A man, a plan, a canal: Panama", output: "true" },
      { input: "race a car", output: "false" },
      { input: "0P", output: "false" }
    ],
    questionNumber: 76
  },
  {
    questionType: "Easy",
    questionName: "Subsequence Trail Check",
    question: `You are given two strings small and large.

Your task is to determine whether small is a subsequence of large.

A subsequence is formed by deleting zero or more characters without changing the order of the remaining characters.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, small, large):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "abc\nahbgdc", output: "true" },
      { input: "axc\nahbgdc", output: "false" },
      { input: "ace\nabcde", output: "true" }
    ],
    questionNumber: 77
  },
  {
    questionType: "Medium",
    questionName: "Sorted Pair Coordinates",
    question: `You are given a sorted array numbers and a target value.

Exactly two numbers in the array add up to target.

Your task is to return the 1-based indices of those two numbers.

The first returned index must be smaller than the second.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, numbers, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "4\n2 7 11 15\n9", output: "[1,2]" },
      { input: "3\n2 3 4\n6", output: "[1,3]" },
      { input: "2\n-1 0\n-1", output: "[1,2]" }
    ],
    questionNumber: 78
  },
  {
    questionType: "Easy",
    questionName: "Sentence Segment Counter",
    question: `You are given a string text.

A segment is a continuous group of non-space characters.

Your task is to count how many segments appear in the string.`,
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
      { input: "Hello, my name is John", output: "5" },
      { input: "one two three", output: "3" },
      { input: "single", output: "1" }
    ],
    questionNumber: 79
  },
  {
    questionType: "Easy",
    questionName: "Coin Stair Builder",
    question: `You have n coins and want to build a staircase.

The first row needs 1 coin, the second row needs 2 coins, the third row needs 3 coins, and so on.

Your task is to return the maximum number of complete rows that can be built.`,
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
      { input: "5", output: "2" },
      { input: "8", output: "3" },
      { input: "1", output: "1" }
    ],
    questionNumber: 80
  },
  {
    questionType: "Easy",
    questionName: "Missing Number Markers",
    question: `You are given an array nums of length n.

Every value in nums is between 1 and n.

Some values may appear more than once, and some values from 1 to n may be missing.

Your task is to return all numbers from 1 to n that do not appear in nums, in increasing order.`,
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
      { input: "8\n4 3 2 7 8 2 3 1", output: "[5,6]" },
      { input: "2\n1 1", output: "[2]" },
      { input: "2\n2 2", output: "[1]" }
    ],
    questionNumber: 81
  },
  {
    questionType: "Easy",
    questionName: "Cookie Sharing Match",
    question: `Each child has a greed value, and each cookie has a size.

A child is satisfied if they receive one cookie whose size is at least their greed value.

Each child can receive at most one cookie, and each cookie can be given to at most one child.

Your task is to return the maximum number of children that can be satisfied.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, greed, cookies):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "3\n1 2 3\n2\n1 1", output: "1" },
      { input: "2\n1 2\n3\n1 2 3", output: "2" },
      { input: "4\n10 9 8 7\n4\n5 6 7 8", output: "2" }
    ],
    questionNumber: 82
  },
  {
    questionType: "Easy",
    questionName: "Repeating Block String",
    question: `You are given a non-empty string text.

Your task is to determine whether text can be formed by repeating one of its non-empty substrings multiple times.

Return true if possible, otherwise return false.`,
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
      { input: "abab", output: "true" },
      { input: "aba", output: "false" },
      { input: "abcabcabc", output: "true" }
    ],
    questionNumber: 83
  },
  {
    questionType: "Easy",
    questionName: "Binary Difference Count",
    question: `You are given two integers x and y.

Your task is to count how many bit positions are different in the binary representations of x and y.

Return that count.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, x, y):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "1\n4", output: "2" },
      { input: "3\n1", output: "1" },
      { input: "7\n10", output: "3" }
    ],
    questionNumber: 84
  },
  {
    questionType: "Easy",
    questionName: "Island Border Length",
    question: `A grid contains land cells marked as 1 and water cells marked as 0.

The land cells form one or more connected island parts using horizontal and vertical connections.

Your task is to return the total perimeter of the land area.

Each side of a land cell that touches water or the outside of the grid contributes 1 to the perimeter.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, grid):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "4 4\n0 1 0 0\n1 1 1 0\n0 1 0 0\n1 1 0 0", output: "16" },
      { input: "1 1\n1", output: "4" },
      { input: "1 2\n1 1", output: "6" }
    ],
    questionNumber: 85
  },
  {
    questionType: "Easy",
    questionName: "Significant Bit Mirror",
    question: `You are given a positive integer num.

Consider only the binary bits needed to represent num without leading zeroes.

Your task is to flip every one of those bits and return the resulting integer.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, num):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "5", output: "2" },
      { input: "1", output: "0" },
      { input: "10", output: "5" }
    ],
    questionNumber: 86
  },
  {
    questionType: "Easy",
    questionName: "Access Key Formatter",
    question: `You are given a license key string key and an integer k.

The key contains alphanumeric characters and dashes.

First remove all existing dashes, then convert all letters to uppercase.

Reformat the string into groups separated by dashes, where every group has length k except possibly the first group, which may be shorter.

Return the formatted key.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, key, k):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "5F3Z-2e-9-w\n4", output: "5F3Z-2E9W" },
      { input: "2-5g-3-J\n2", output: "2-5G-3J" },
      { input: "abc-def\n3", output: "ABC-DEF" }
    ],
    questionNumber: 87
  },
  {
    questionType: "Easy",
    questionName: "Longest One Streak",
    question: `You are given a binary array nums.

Your task is to return the maximum number of consecutive 1s that appear in the array.`,
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
      { input: "6\n1 1 0 1 1 1", output: "3" },
      { input: "6\n1 0 1 1 0 1", output: "2" },
      { input: "3\n0 0 0", output: "0" }
    ],
    questionNumber: 88
  },
  {
    questionType: "Easy",
    questionName: "Balanced Rectangle Maker",
    question: `You are given an integer area.

You must construct a rectangle with integer length L and width W such that:

- L * W equals area
- L is greater than or equal to W
- The difference L - W is as small as possible

Return the pair [L, W].`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, area):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "4", output: "[2,2]" },
      { input: "37", output: "[37,1]" },
      { input: "122122", output: "[427,286]" }
    ],
    questionNumber: 89
  },
  {
    questionType: "Easy",
    questionName: "Poisoned Time Span",
    question: `A warrior attacks at specific times given in the array attackTimes.

Each attack poisons the enemy for duration seconds.

If another attack happens before the current poison effect ends, the poison timer is refreshed and overlapping time should not be counted twice.

Your task is to return the total time the enemy remains poisoned.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, attackTimes, duration):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "2\n1 4\n2", output: "4" },
      { input: "2\n1 2\n2", output: "3" },
      { input: "4\n1 2 5 9\n3", output: "10" }
    ],
    questionNumber: 90
  },
  {
    questionType: "Easy",
    questionName: "Next Greater Lookup",
    question: `You are given two arrays nums1 and nums2.

Every value in nums1 appears in nums2.

For each value in nums1, find the first greater value that appears to its right in nums2.

If no such value exists, use -1 for that position.

Return the answers in the same order as nums1.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, nums1, nums2):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "3\n4 1 2\n4\n1 3 4 2", output: "[-1,3,-1]" },
      { input: "2\n2 4\n4\n1 2 3 4", output: "[3,-1]" },
      { input: "5\n1 3 5 2 4\n7\n6 5 4 3 2 1 7", output: "[7,7,7,7,7]" }
    ],
    questionNumber: 91
  },
  {
    questionType: "Easy",
    questionName: "Printer Line Tracker",
    question: `A printer writes lowercase English letters on lines with a maximum width of 100 units.

The width of each letter from a to z is given in the array widths.

You are also given a string text.

The printer writes characters from left to right and moves to a new line whenever the next character would exceed width 100.

Your task is to return [number_of_lines, width_used_on_last_line].`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, widths, text):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10\nabcdefghijklmnopqrstuvwxyz", output: "[3,60]" },
      { input: "1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1\nabc", output: "[1,3]" },
      { input: "5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5 5\nabcdefghijklmnopqrst", output: "[1,100]" }
    ],
    questionNumber: 92
  },
  {
    questionType: "Easy",
    questionName: "Triangle Field Area",
    question: `You are given a list of points on a 2D plane.

Your task is to choose any three points and return the largest possible area of a triangle formed by them.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, points):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "5\n0 0\n0 1\n1 0\n0 2\n2 0", output: "2.0" },
      { input: "3\n1 0\n0 0\n0 1", output: "0.5" },
      { input: "3\n0 0\n1 1\n2 2", output: "0.0" }
    ],
    questionNumber: 93
  },
  {
    questionType: "Easy",
    questionName: "Paragraph Favorite Word",
    question: `You are given a paragraph and a list of banned words.

Words should be compared in lowercase, and punctuation should be ignored.

Your task is to return the most frequent word in the paragraph that is not banned.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, paragraph, banned):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "Bob hit a ball, the hit BALL flew far after it was hit.\n1\nhit", output: "ball" },
      { input: "Hello hello world!\n1\nworld", output: "hello" },
      { input: "a, a, a, b,b,b,c, c\n1\na", output: "b" }
    ],
    questionNumber: 94
  },
  {
    questionType: "Easy",
    questionName: "Character Distance Map",
    question: `You are given a string text and a character target.

For every index in text, determine the shortest distance from that index to any occurrence of target.

Return the distances as an array.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, text, target):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "loveleetcode\ne", output: "[3,2,1,0,1,0,0,1,2,2,1,0]" },
      { input: "aaab\nb", output: "[3,2,1,0]" },
      { input: "aaba\nb", output: "[2,1,0,1]" }
    ],
    questionNumber: 95
  },
  {
    questionType: "Easy",
    questionName: "Goat Speech Converter",
    question: `You are given a sentence made of words separated by single spaces.

Convert each word into Goat Latin using these rules:

- If a word begins with a vowel, append ma to the end.
- If a word begins with a consonant, move its first letter to the end, then append ma.
- Add one letter a to the end of the first word, two letters a to the second word, and so on.

Return the converted sentence.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, sentence):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "I speak Goat Latin", output: "Imaa peaksmaaa oatGmaaaa atinLmaaaaa" },
      { input: "The quick brown fox", output: "heTmaa uickqmaaa rownbmaaaa oxfmaaaaa" },
      { input: "Apple", output: "Applemaa" }
    ],
    questionNumber: 96
  },
  {
    questionType: "Medium",
    questionName: "Lonely Sorted Value",
    question: `You are given a sorted array nums.

Every element appears exactly twice except for one element that appears only once.

Your task is to return the single element that appears once.

The solution should run efficiently without scanning unnecessary parts of the array.`,
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
      { input: "9\n1 1 2 3 3 4 4 8 8", output: "2" },
      { input: "7\n3 3 7 7 10 11 11", output: "10" },
      { input: "1\n5", output: "5" }
    ],
    questionNumber: 97
  },
  {
    questionType: "Medium",
    questionName: "Nearest Zero Distance Grid",
    question: `You are given a binary matrix.

For each cell, compute the distance to the nearest cell containing 0.

Distance is measured by moving one step at a time in the four main directions: up, down, left, and right.

Return the updated matrix of distances.`,
    preBuiltFunction: [{
      language: "Python",
      languageCode: "python",
      code: `class Solution:
    def solve(self, matrix):
        # TODO: implement
        pass

if __name__ == "__main__":
    pass`
    }],
    testCases: [
      { input: "3 3\n0 0 0\n0 1 0\n1 1 1", output: "[[0,0,0],[0,1,0],[1,2,1]]" },
      { input: "2 2\n0 1\n1 1", output: "[[0,1],[1,2]]" },
      { input: "3 3\n1 1 1\n1 0 1\n1 1 1", output: "[[2,1,2],[1,0,1],[2,1,2]]" }
    ],
    questionNumber: 98
  }
];

export function getNewDSAQuestions(): DSAQuestion[] {
  return rawDSAQuestions.map((raw, i) =>
    convertToDSAQuestion(raw, `DSA_NEW_${String(i + 1).padStart(3, "0")}`, i)
  );
}
