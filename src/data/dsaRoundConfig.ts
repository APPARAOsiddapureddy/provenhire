export type ProgrammingLanguage = "javascript" | "python" | "java" | "cpp" | "c";

export interface LanguageTemplate {
  language: ProgrammingLanguage;
  displayName: string;
  extension: string;
  template: string;
}

// Only contains language config + timing constants (no question bank).
export const supportedLanguages: LanguageTemplate[] = [
  {
    language: "javascript",
    displayName: "JavaScript",
    extension: "js",
    template: "// JavaScript Solution\n",
  },
  {
    language: "python",
    displayName: "Python",
    extension: "py",
    template: "# Python Solution\n",
  },
  {
    language: "java",
    displayName: "Java",
    extension: "java",
    template: "// Java Solution\n",
  },
  {
    language: "cpp",
    displayName: "C++",
    extension: "cpp",
    template: "// C++ Solution\n",
  },
  {
    language: "c",
    displayName: "C",
    extension: "c",
    template: "// C Solution\n",
  },
];

export const DSA_QUESTIONS_COUNT = 3;
export const DSA_MINUTES_PER_QUESTION = 30;
export const DSA_TOTAL_MINUTES = DSA_QUESTIONS_COUNT * DSA_MINUTES_PER_QUESTION; // 90
export const DSA_PASS_THRESHOLD = 60;

