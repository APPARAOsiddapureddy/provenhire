import allQuestions from './all_questions_consolidated.json';

export interface AptitudeQuestion {
  id: string;
  difficulty?: string;
  question: string;
  options: string[];
  answer: string;
  section: string;
  category?: string;
  solution?: string;
}

// Type the imported questions
export const aptitudeQuestions: AptitudeQuestion[] = allQuestions as AptitudeQuestion[];

// Get unique sections
const getSections = () => {
  const sections = new Set<string>();
  aptitudeQuestions.forEach(q => sections.add(q.section));
  return Array.from(sections);
};

export const availableSections = getSections();

// Filter questions by section keyword and difficulty
export const getQuestionsBySection = (sectionKeyword: string, difficulty: "Easy" | "Hard"): AptitudeQuestion[] => {
  return aptitudeQuestions.filter(q => 
    q.section.toLowerCase().includes(sectionKeyword.toLowerCase()) &&
    q.section.toLowerCase().includes(difficulty.toLowerCase())
  );
};

// Get random questions from a pool
const getRandomFromArray = <T>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// Generate test with 15 questions: logical/aptitude only
export const generateTestQuestions = (difficulty: "Easy" | "Hard"): AptitudeQuestion[] => {
  const difficultyKey = difficulty.toLowerCase();

  const logicalQuestions = aptitudeQuestions.filter(q => {
    const section = q.section.toLowerCase();
    const isLogical = section.includes("logical") ||
      section.includes("data interpretation") ||
      section.includes("reasoning") ||
      section.includes("quantitative") ||
      section.includes("numerical") ||
      section.includes("aptitude");
    return isLogical && section.includes(difficultyKey);
  });

  const allSelected = getRandomFromArray(logicalQuestions, 15);
  
  // If we don't have 15 questions, fill with any available questions
  if (allSelected.length < 15) {
    const remaining = aptitudeQuestions.filter(q => 
      q.section.toLowerCase().includes(difficultyKey) && !allSelected.includes(q)
    );
    const needed = 15 - allSelected.length;
    allSelected.push(...getRandomFromArray(remaining, needed));
  }

  return allSelected.sort(() => Math.random() - 0.5);
};

// Get question category for scoring
export const getQuestionCategory = (_question: AptitudeQuestion): "logical" => {
  return "logical";
};
