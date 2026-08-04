/**
 * Seeds the "Very Easy" DSA question tier — basic programming problems used by the
 * coding round's Very Easy difficulty slot.
 *
 * Run:
 *   cd server && npm run seed:dsa-very-easy
 *
 * Idempotent: questions are upserted on a stable id (DSA_VE_<questionNumber>), and each
 * question's test cases are replaced on every run.
 *
 * Conventions carried over from seed:dsa —
 * - The first two test cases are public, the rest are hidden.
 * - `examples` is derived from the public test cases.
 * - Source data supplies Python starter code; the other four Judge0 languages get
 *   generic stdin/stdout scaffolds (the DSA runner falls back to Python, then to a
 *   built-in template, so these are a convenience rather than a requirement).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Target database. Defaults to DATABASE_URL; pass `--target=DB_EXT` to seed a different
 * connection defined in .env (e.g. the hosted Render instance).
 */
function resolveDatasourceUrl(): { url: string; source: string } {
  const flag = process.argv.find((arg) => arg.startsWith("--target="));
  const varName = flag ? flag.slice("--target=".length).trim() : "DATABASE_URL";
  const url = process.env[varName];
  if (!url) {
    throw new Error(`[seed:dsa-very-easy] ${varName} is not set in the environment.`);
  }
  return { url, source: varName };
}

const { url: DATASOURCE_URL, source: DATASOURCE_NAME } = resolveDatasourceUrl();

/** Host only — never log credentials. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(unparseable url)";
  }
}

const prisma = new PrismaClient({ datasourceUrl: DATASOURCE_URL });

const DIFFICULTY = "Very Easy";

type SourceQuestion = {
  questionNumber: number;
  questionName: string;
  question: string;
  pythonStarter: string;
  testCases: Array<{ input: string; output: string }>;
};

const QUESTIONS: SourceQuestion[] = [
  {
    questionNumber: 106,
    questionName: "The Librarian's Dilemma",
    question: `In the grand library of Alexandria, a young librarian named Elara is tasked with organizing a massive shelf of ancient tomes. Over time, some books have been temporarily removed, leaving empty gaps (represented by the number 0).
Elara wants to slide all the books to the left to fill the gaps, effectively moving all the empty spaces (0s) to the end of the shelf. However, she must maintain the original relative order of the books that are still present.

Given an integer array 'shelf' representing the books and gaps, move all 0's to the end of it while maintaining the relative order of the non-zero elements.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def organizeShelf(shelf):
    # TODO: implement
    return []

if __name__ == "__main__":
    shelf = list(map(int, input().split()))
    res = organizeShelf(shelf)
    print(" ".join(map(str, res)))`,
    testCases: [
      { input: "0 1 0 3 12", output: "1 3 12 0 0" },
      { input: "0", output: "0" },
      { input: "4 2 4 0 0 3 0 5 1 0", output: "4 2 4 3 5 1 0 0 0 0" },
    ],
  },
  {
    questionNumber: 107,
    questionName: "The Wizards' Duel",
    question: `Two rival wizards, Alatar and Pallando, are preparing for a duel. Alatar claims that his new spell is just a clever rearrangement of Pallando's famous counter-curse. A spell is considered an anagram of another if it uses the exact same magical runes (characters) with the exact same frequencies, just spoken in a different order.

Given two spell incantations, spell1 and spell2, return true if spell2 is an anagram of spell1, and false otherwise.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def isAnagram(spell1, spell2):
    # TODO: implement
    return False

if __name__ == "__main__":
    spell1 = input().strip()
    spell2 = input().strip()
    print("true" if isAnagram(spell1, spell2) else "false")`,
    testCases: [
      { input: "anagram\nnagaram", output: "true" },
      { input: "rat\ncar", output: "false" },
      { input: "listen\nsilent", output: "true" },
    ],
  },
  {
    questionNumber: 108,
    questionName: "The Archer's Target",
    question: `In the annual kingdom archery tournament, targets are lined up in a vast field in strictly increasing order of their point values. Robin, the master archer, has been given a new target with a specific point value 'targetScore' to place on the field.
He must shoot an arrow into the ground at the exact index where this new target should be placed so that the overall line of targets remains sorted. If a target with 'targetScore' already exists, he must shoot the arrow at its current index.

Given a sorted array of distinct integers 'targets' and an integer 'targetScore', return the index where Robin should shoot his arrow.

Expected Time Complexity: O(log N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def searchInsert(targets, targetScore):
    # TODO: implement
    return 0

if __name__ == "__main__":
    targets = list(map(int, input().split()))
    targetScore = int(input())
    print(searchInsert(targets, targetScore))`,
    testCases: [
      { input: "1 3 5 6\n5", output: "2" },
      { input: "1 3 5 6\n2", output: "1" },
      { input: "1 3 5 6\n7", output: "4" },
    ],
  },
  {
    questionNumber: 109,
    questionName: "The Royal Election",
    question: `The King has stepped down, and the citizens of the realm are casting their votes to elect a new ruler. The votes are tallied into an array where each integer represents the ID of the candidate chosen by a citizen.
By royal decree, a candidate can only claim the throne if they secure an absolute majority, meaning they receive strictly more than half of the total votes (more than n / 2). The kingdom's oracle has foreseen that such a majority winner will always exist in this election.

Given the array of votes, identify and return the ID of the new ruler.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def findRuler(votes):
    # TODO: implement
    return 0

if __name__ == "__main__":
    votes = list(map(int, input().split()))
    print(findRuler(votes))`,
    testCases: [
      { input: "3 2 3", output: "3" },
      { input: "2 2 1 1 1 2 2", output: "2" },
      { input: "10 9 9 9 10", output: "9" },
    ],
  },
  {
    questionNumber: 110,
    questionName: "The Faded Scroll",
    question: `A weary traveler discovers an ancient, faded scroll in a hidden cave. The scroll contains a secret message consisting of words separated by mysterious glowing spaces. The traveler's guide mentions that the key to unlocking the cave's treasure lies entirely in the length of the very last word written on the scroll.

Given a string 'scrollText' consisting of words and spaces, return the length of the last word in the string. A word is a maximal substring consisting of non-space characters only.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def lengthOfLastWord(scrollText):
    # TODO: implement
    return 0

if __name__ == "__main__":
    scrollText = input().strip()
    print(lengthOfLastWord(scrollText))`,
    testCases: [
      { input: "Hello World", output: "5" },
      { input: "   fly me   to   the moon  ", output: "4" },
      { input: "luffy is still joyboy", output: "6" },
    ],
  },
  {
    questionNumber: 111,
    questionName: "The Unique Gem",
    question: `A master jeweler is sorting through a freshly mined batch of magical gems. These gems are peculiar: they always form perfectly identical pairs. However, during the chaotic mining process, one gem lost its twin.
The jeweler has laid out all the gems in an array, where each number represents the magical frequency of a gem. Every frequency appears exactly twice, except for one unique frequency that appears only once.

Find and return the frequency of this unique gem.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def findUniqueGem(gems):
    # TODO: implement
    return 0

if __name__ == "__main__":
    gems = list(map(int, input().split()))
    print(findUniqueGem(gems))`,
    testCases: [
      { input: "2 2 1", output: "1" },
      { input: "4 1 2 1 2", output: "4" },
      { input: "10", output: "10" },
    ],
  },
  {
    questionNumber: 112,
    questionName: "The Temple's Lock",
    question: `An intrepid explorer stands before the sealed door of an ancient Roman temple. The stone door features a complex mechanism that requires a numerical code to unlock. However, the clues carved into the stone are written entirely in Roman numerals.
To open the door, the explorer must correctly translate the Roman numeral string into its integer equivalent. Roman numerals are represented by seven different symbols: I, V, X, L, C, D and M.

Given a Roman numeral string, convert it to an integer.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def unlockTemple(s):
    # TODO: implement
    return 0

if __name__ == "__main__":
    s = input().strip()
    print(unlockTemple(s))`,
    testCases: [
      { input: "III", output: "3" },
      { input: "LVIII", output: "58" },
      { input: "MCMXCIV", output: "1994" },
    ],
  },
  {
    questionNumber: 113,
    questionName: "The Cipher's Key",
    question: `A brilliant cryptographer intercepts a secret encrypted message sent by a spy. According to the cryptographer's manual, the hidden key needed to decrypt the message is the index of the first character in the string that does not repeat anywhere else in the message.
If every single character in the message repeats at least once, the key is considered to be -1.

Given a string 'message', find the first non-repeating character in it and return its index. If it does not exist, return -1.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def findCipherKey(message):
    # TODO: implement
    return -1

if __name__ == "__main__":
    message = input().strip()
    print(findCipherKey(message))`,
    testCases: [
      { input: "leetcode", output: "0" },
      { input: "loveleetcode", output: "2" },
      { input: "aabb", output: "-1" },
    ],
  },
  {
    questionNumber: 114,
    questionName: "The Levitation Spell",
    question: `A young apprentice is trying to learn the Levitation Spell at the wizarding academy. Her instructor explains that the spell is highly unstable and will only successfully cast if the exact amount of magical energy supplied is a perfect power of two.
If the energy is not a power of two, the spell will backfire immediately.

Given an integer 'energy', return true if it is a power of two. Otherwise, return false. An integer n is a power of two, if there exists an integer x such that n == 2^x.

Expected Time Complexity: O(1)
Expected Space Complexity: O(1)`,
    pythonStarter: `def canLevitate(energy):
    # TODO: implement
    return False

if __name__ == "__main__":
    energy = int(input())
    print("true" if canLevitate(energy) else "false")`,
    testCases: [
      { input: "1", output: "true" },
      { input: "16", output: "true" },
      { input: "3", output: "false" },
    ],
  },
  {
    questionNumber: 115,
    questionName: "The Detective's Clue",
    question: `A famous detective is examining a long, rambling ransom note left at a crime scene. She knows that the culprit always hides a specific signature phrase (a "clue") somewhere within their notes.
To narrow down the suspect profile, the detective needs to find the exact starting index of the very first time this signature clue appears in the full note. If the clue isn't in the note at all, she records it as -1.

Given two strings 'note' and 'clue', return the index of the first occurrence of 'clue' in 'note', or -1 if 'clue' is not part of 'note'.

Expected Time Complexity: O(N * M)
Expected Space Complexity: O(1)`,
    pythonStarter: `def findClue(note, clue):
    # TODO: implement
    return -1

if __name__ == "__main__":
    note = input().strip()
    clue = input().strip()
    print(findClue(note, clue))`,
    testCases: [
      { input: "sadbutsad\nsad", output: "0" },
      { input: "leetcode\nleeto", output: "-1" },
      { input: "hello\nll", output: "2" },
    ],
  },
  {
    questionNumber: 116,
    questionName: "The Stolen Recipe",
    question: `A master chef's legendary secret recipe, written as a string of letters 's', was stolen by a cunning rival. To cover their tracks, the rival scrambled all the letters and added exactly one extra secret ingredient (one additional letter) to create a new recipe string 't'.
You have recovered both the original recipe 's' and the scrambled recipe 't'. You must identify the extra ingredient that the rival added.

Given two strings s and t, return the letter that was added to t.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def findExtraIngredient(s, t):
    # TODO: implement
    return ""

if __name__ == "__main__":
    s = input().strip()
    t = input().strip()
    print(findExtraIngredient(s, t))`,
    testCases: [
      { input: "abcd\nabcde", output: "e" },
      { input: "\ny", output: "y" },
      { input: "a\naa", output: "a" },
    ],
  },
  {
    questionNumber: 117,
    questionName: "The Spy's Code",
    question: `A young spy intercepts a sequence of coded messages. The spy's manual provides a 'pattern' of letters, and the intercepted message 's' contains a sequence of words separated by spaces.
The message follows the pattern if there is a perfect bijection (one-to-one mapping) between a letter in the pattern and a non-empty word in the message. For example, if the pattern has 'a' and 'b', 'a' must always map to the same word, and 'b' must map to a different word.

Given a pattern and a string s, find if s follows the same pattern.

Expected Time Complexity: O(N)
Expected Space Complexity: O(N)`,
    pythonStarter: `def decodeMessage(pattern, s):
    # TODO: implement
    return False

if __name__ == "__main__":
    pattern = input().strip()
    s = input().strip()
    print("true" if decodeMessage(pattern, s) else "false")`,
    testCases: [
      { input: "abba\ndog cat cat dog", output: "true" },
      { input: "abba\ndog cat cat fish", output: "false" },
      { input: "aaaa\ndog cat cat dog", output: "false" },
    ],
  },
  {
    questionNumber: 118,
    questionName: "The Ancient Tablets",
    question: `Two ancient civilizations, thousands of miles apart, have left behind mysterious stone tablets inscribed with strange words. Archeologists suspect the two languages are isomorphic, meaning every symbol in the first language consistently maps to exactly one symbol in the second language, and vice versa. No two symbols may map to the same symbol, but a symbol may map to itself.

Given two strings s and t representing words from the two tablets, determine if they are isomorphic.

Expected Time Complexity: O(N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def areIsomorphic(s, t):
    # TODO: implement
    return False

if __name__ == "__main__":
    s = input().strip()
    t = input().strip()
    print("true" if areIsomorphic(s, t) else "false")`,
    testCases: [
      { input: "egg\nadd", output: "true" },
      { input: "foo\nbar", output: "false" },
      { input: "paper\ntitle", output: "true" },
    ],
  },
  {
    questionNumber: 119,
    questionName: "The Dragon's Offering",
    question: `Deep within a volcanic crater lives a legendary three-headed dragon. The dragon demands regular tributes of gold coins from the nearby villagers. However, the dragon is very particular: it only accepts the tribute if the total number of gold coins is a perfect power of three. Any other amount will enrage the beast!

Given an integer 'coins', return true if it is a power of three. Otherwise, return false. An integer n is a power of three, if there exists an integer x such that n == 3^x.

Expected Time Complexity: O(log N)
Expected Space Complexity: O(1)`,
    pythonStarter: `def isAcceptableOffering(coins):
    # TODO: implement
    return False

if __name__ == "__main__":
    coins = int(input())
    print("true" if isAcceptableOffering(coins) else "false")`,
    testCases: [
      { input: "27", output: "true" },
      { input: "0", output: "false" },
      { input: "-1", output: "false" },
    ],
  },
  {
    questionNumber: 120,
    questionName: "The Alien Signal",
    question: `A space explorer receives a mysterious incoming signal from a distant galaxy, represented as an integer. The ship's computer determines that the true meaning of the message is hidden in the number of active energy pulses, which perfectly correspond to the '1' bits in the integer's binary representation.

Given a positive integer 'signal', write a function that returns the number of active energy pulses (the number of '1' bits) it has.

Expected Time Complexity: O(1)
Expected Space Complexity: O(1)`,
    pythonStarter: `def countEnergyPulses(signal):
    # TODO: implement
    return 0

if __name__ == "__main__":
    signal = int(input())
    print(countEnergyPulses(signal))`,
    testCases: [
      { input: "11", output: "3" },
      { input: "128", output: "1" },
      { input: "2147483645", output: "30" },
    ],
  },
];

const CONSTRAINTS: Record<number, string[]> = {
  106: ["1 <= shelf.length <= 10^4", "-2^31 <= shelf[i] <= 2^31 - 1"],
  107: [
    "1 <= spell1.length, spell2.length <= 5 * 10^4",
    "Both spells consist of lowercase English letters.",
  ],
  108: [
    "1 <= targets.length <= 10^4",
    "-10^4 <= targets[i] <= 10^4",
    "targets contains distinct values sorted in ascending order.",
    "-10^4 <= targetScore <= 10^4",
  ],
  109: ["n == votes.length", "1 <= n <= 5 * 10^4", "-10^9 <= votes[i] <= 10^9"],
  110: [
    "1 <= scrollText.length <= 10^4",
    "scrollText consists of only English letters and spaces ' '.",
    "There will be at least one word in scrollText.",
  ],
  111: [
    "1 <= gems.length <= 3 * 10^4",
    "-3 * 10^4 <= gems[i] <= 3 * 10^4",
    "Each element in the array appears twice except for one element which appears only once.",
  ],
  112: [
    "1 <= s.length <= 15",
    "s contains only the characters ('I', 'V', 'X', 'L', 'C', 'D', 'M').",
    "It is guaranteed that s is a valid Roman numeral in the range [1, 3999].",
  ],
  113: [
    "1 <= message.length <= 10^5",
    "message consists of only lowercase English letters.",
  ],
  114: ["-2^31 <= energy <= 2^31 - 1"],
  115: [
    "1 <= note.length, clue.length <= 10^4",
    "note and clue consist of only lowercase English characters.",
  ],
  116: [
    "0 <= s.length <= 1000",
    "t.length == s.length + 1",
    "s and t consist of lowercase English letters.",
  ],
  117: [
    "1 <= pattern.length <= 300",
    "pattern contains only lowercase English letters.",
    "1 <= s.length <= 3000",
    "s contains only lowercase English letters and spaces ' '.",
    "s does not contain any leading or trailing spaces.",
    "All the words in s are separated by a single space.",
  ],
  118: [
    "1 <= s.length <= 5 * 10^4",
    "t.length == s.length",
    "s and t consist of any valid ascii character.",
  ],
  119: ["-2^31 <= coins <= 2^31 - 1"],
  120: ["1 <= signal <= 2^31 - 1"],
};

/** The DSA runner falls back to Python, so these are convenience scaffolds. */
function scaffolds(questionNumber: number, python: string) {
  return {
    python,
    javascript: `// Question ${questionNumber}\nconst data = require("fs").readFileSync(0, "utf8").split("\\n");\n\n// Write your solution here\n`,
    java: `// Question ${questionNumber}\nimport java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // Write your solution here\n    }\n}\n`,
    cpp: `// Question ${questionNumber}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}\n`,
    c: `/* Question ${questionNumber} */\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main(void) {\n    /* Write your solution here */\n    return 0;\n}\n`,
  };
}

async function main() {
  console.log(
    `[seed:dsa-very-easy] target=${DATASOURCE_NAME} (${describeTarget(DATASOURCE_URL)})`,
  );
  let created = 0;
  let updated = 0;

  for (const source of QUESTIONS) {
    const id = `DSA_VE_${source.questionNumber}`;
    const constraints = CONSTRAINTS[source.questionNumber] ?? [];
    // The public test cases double as the worked examples shown to candidates.
    const examples = source.testCases.slice(0, 2).map((testCase) => ({
      input: testCase.input,
      output: testCase.output,
    }));
    const starterCode = scaffolds(source.questionNumber, source.pythonStarter);

    const existing = await prisma.dsaQuestion.findUnique({ where: { id } });

    await prisma.dsaQuestion.upsert({
      where: { id },
      create: {
        id,
        title: source.questionName,
        description: source.question,
        difficulty: DIFFICULTY,
        examples,
        constraints,
        starterCode,
      },
      update: {
        title: source.questionName,
        description: source.question,
        difficulty: DIFFICULTY,
        examples,
        constraints,
        starterCode,
      },
    });

    // Replace test cases wholesale so re-running never duplicates them.
    await prisma.dsaTestCase.deleteMany({ where: { questionId: id } });
    await prisma.dsaTestCase.createMany({
      data: source.testCases.map((testCase, index) => ({
        questionId: id,
        input: testCase.input,
        expected: testCase.output,
        // Matches seed:dsa — first two public, the rest hidden.
        isHidden: index >= 2,
        expectedType: "exact",
      })),
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const total = await prisma.dsaQuestion.count({
    where: { difficulty: DIFFICULTY },
  });
  console.log(
    `[seed:dsa-very-easy] created=${created} updated=${updated} total "${DIFFICULTY}" questions=${total}`,
  );
}

main()
  .catch((error) => {
    console.error("[seed:dsa-very-easy]", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
