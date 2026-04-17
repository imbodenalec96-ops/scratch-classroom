import React, { useState, useEffect } from "react";
import LessonsBrowser from "./LessonsBrowser.tsx";
import { useTheme } from "../lib/theme.tsx";
import { usePresencePing } from "../lib/presence.ts";
import { api } from "../lib/api.ts";

// ─── Coding lessons (original 11 JS lessons) ────────────────────────────────
const CODING_LESSONS = [
  { icon: "📦", title: "Variables & Data", desc: "Store and use data — the building blocks of every program", level: "Beginner", color: "from-emerald-500/20 to-emerald-600/10" },
  { icon: "💬", title: "Printing & Output", desc: "Make your program talk with console.log()", level: "Beginner", color: "from-cyan-500/20 to-cyan-600/10" },
  { icon: "🔢", title: "Math & Operators", desc: "Add, subtract, multiply — and cool Math functions", level: "Beginner", color: "from-blue-500/20 to-blue-600/10" },
  { icon: "🔀", title: "If/Else Decisions", desc: "Make your code choose different paths", level: "Beginner", color: "from-amber-500/20 to-amber-600/10" },
  { icon: "🔄", title: "Loops & Repetition", desc: "Repeat actions with for and while loops", level: "Beginner", color: "from-orange-500/20 to-orange-600/10" },
  { icon: "🧩", title: "Functions (My Blocks!)", desc: "Create reusable code — like Scratch My Blocks", level: "Intermediate", color: "from-violet-500/20 to-violet-600/10" },
  { icon: "📋", title: "Arrays (Lists)", desc: "Store collections with superpowers like filter & map", level: "Intermediate", color: "from-pink-500/20 to-pink-600/10" },
  { icon: "🎭", title: "Objects (Sprites!)", desc: "Group related data — how sprites really work", level: "Intermediate", color: "from-rose-500/20 to-rose-600/10" },
  { icon: "🌐", title: "Web Page Magic (DOM)", desc: "Control web pages with JavaScript", level: "Advanced", color: "from-indigo-500/20 to-indigo-600/10" },
  { icon: "⏳", title: "Async & Promises", desc: "Handle things that take time — loading, waiting", level: "Advanced", color: "from-purple-500/20 to-purple-600/10" },
  { icon: "🎮", title: "Build a Mini Game!", desc: "Put it all together — number guessing game", level: "Intermediate", color: "from-red-500/20 to-red-600/10" },
];

// ─── Types ───────────────────────────────────────────────────────────────────
type Section = {
  heading: string;
  body: string;
  isActivity?: boolean;
};

type QuizQuestion = {
  q: string;
  options: string[];
  answer: number;
};

type Lesson = {
  id: string;
  title: string;
  subject: "reading" | "math" | "writing" | "sel";
  grades: number[];
  emoji: string;
  description: string;
  sections: Section[];
  quiz: QuizQuestion[];
};

// ─── All lessons ─────────────────────────────────────────────────────────────
const ALL_LESSONS: Lesson[] = [
  // ── READING ──────────────────────────────────────────────────────────────
  {
    id: "r1",
    title: "Main Idea & Details",
    subject: "reading",
    grades: [2, 3],
    emoji: "📖",
    description: "Find the main point of what you read and the details that support it",
    sections: [
      {
        heading: "What is the Main Idea?",
        body: `The main idea is what a paragraph or passage is MOSTLY about. Think of it like an umbrella — the main idea is the umbrella, and the details are what's underneath it.\n\nExample: "Dogs make great pets. They are loyal, fun to play with, and help keep us active."\n\nThe main idea = dogs make great pets.`,
      },
      {
        heading: "Finding Supporting Details",
        body: `Details are facts, examples, or descriptions that support the main idea. Ask yourself: What does this sentence tell me about the main idea?\n\nIn our example, the details are:\n• Loyal\n• Fun to play with\n• Keep us active`,
      },
      {
        heading: "Practice Time! 🎯",
        body: `Read this paragraph:\n\n"Butterflies go through four stages of life. First, they start as tiny eggs. Then they hatch into caterpillars. Next, they form a chrysalis. Finally, they emerge as beautiful butterflies."\n\nWhat is the main idea? What are 3 details that support it?\n\n💡 Tip: The main idea is often the FIRST or LAST sentence of a paragraph!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the main idea of a paragraph?", options: ["The longest sentence", "The most important point the author makes", "The last sentence only", "The title of the book"], answer: 1 },
      { q: "What do supporting details do?", options: ["Change the topic", "Support the main idea with facts/examples", "Replace the main idea", "Make paragraphs longer"], answer: 1 },
      { q: 'In the sentence "Dogs are great pets — they\'re loyal, fun, and active," what\'s the main idea?', options: ["Dogs are loyal", "Dogs are active", "Dogs are great pets", "Dogs are fun"], answer: 2 },
      { q: "Where is the main idea often found?", options: ["Middle of the passage", "Only in the title", "First or last sentence", "In every sentence"], answer: 2 },
      { q: "Which is a supporting detail, not a main idea?", options: ["The rainforest has many animals", "Butterflies are colorful insects", "Rainforests are important ecosystems", "Reading is important"], answer: 1 },
    ],
  },
  {
    id: "r2",
    title: "Making Predictions",
    subject: "reading",
    grades: [2, 3],
    emoji: "🔮",
    description: "Use clues from the story to guess what will happen next",
    sections: [
      {
        heading: "What is a Prediction?",
        body: `A prediction is your best guess about what will happen next, based on clues you already have. Good readers always predict! It's like being a detective 🕵️`,
      },
      {
        heading: "How to Make a Prediction",
        body: `1) Look at clues in the text.\n2) Think about what you already know.\n3) Make your best guess.\n4) Read on to check!\n\nExample: "Maria saw dark clouds and heard thunder. She looked at her umbrella by the door."\n\nPrediction: Maria will take her umbrella because it's going to rain.`,
      },
      {
        heading: "Your Turn! 🎯",
        body: `"Jake studied all week for his math test. He made flashcards, practiced every night, and even taught his little sister the problems."\n\nWhat do you predict will happen when Jake takes his test? Write your prediction and explain 2 clues that helped you!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is a prediction?", options: ["A fact from the text", "Your best guess about what happens next", "The story's ending", "The author's opinion"], answer: 1 },
      { q: "What do you use to make a prediction?", options: ["Only your imagination", "Clues from the text + what you already know", "The back cover", "The page numbers"], answer: 1 },
      { q: "Maria saw dark clouds and grabbed her umbrella. What can you predict?", options: ["She went swimming", "It will be sunny", "It will rain", "She lost her umbrella"], answer: 2 },
      { q: "After making a prediction, what should you do?", options: ["Stop reading", "Read on to check if you were right", "Tell a friend", "Start a new book"], answer: 1 },
      { q: "Good readers make predictions because:", options: ["The teacher requires it", "It helps them stay engaged and understand better", "Books are boring otherwise", "It makes reading faster"], answer: 1 },
    ],
  },
  {
    id: "r3",
    title: "Context Clues",
    subject: "reading",
    grades: [3, 4],
    emoji: "🔍",
    description: "Figure out tricky word meanings from the words around them",
    sections: [
      {
        heading: "What Are Context Clues?",
        body: `Context clues are hints in the sentence that help you figure out what an unknown word means — without a dictionary!\n\nTypes:\n• Definition clues (the author tells you!)\n• Example clues (gives examples)\n• Antonym clues (gives the opposite)`,
      },
      {
        heading: "Types of Context Clues with Examples",
        body: `Definition: "The archaeologist, or scientist who studies ancient objects, found a rare coin."\n\nExample: "Nocturnal animals, like owls, bats, and raccoons, are active at night."\n\nAntonym: "Unlike his frugal sister who saved every penny, Marco was lavish with his spending."`,
      },
      {
        heading: "Practice! 🎯",
        body: `Use context clues to define the bold word:\n\n"The scientist was meticulous, checking every measurement three times and never rushing her work."\n\nWhat does meticulous mean? What clues helped you?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What are context clues?", options: ["Pictures in the book", "Hints in the sentence that help you understand a word", "The dictionary definition", "Words in the title"], answer: 1 },
      { q: "Which type of clue gives you the opposite meaning?", options: ["Definition clue", "Example clue", "Antonym clue", "Synonym clue"], answer: 2 },
      { q: "In 'Nocturnal animals, like owls and bats, sleep during the day,' what type of clue is used?", options: ["Definition", "Example", "Antonym", "No clue"], answer: 1 },
      { q: "Why is using context clues helpful?", options: ["You don't need to read", "You can figure out word meanings without a dictionary", "It makes books shorter", "You can skip hard words"], answer: 1 },
      { q: "The word 'frugal' means careful with money. What clue type is: 'Unlike the frugal sister, Marco was lavish'?", options: ["Definition", "Example", "Antonym", "Synonym"], answer: 2 },
    ],
  },
  {
    id: "r4",
    title: "Cause and Effect",
    subject: "reading",
    grades: [3, 4],
    emoji: "⚡",
    description: "Understand WHY things happen and WHAT happens because of them",
    sections: [
      {
        heading: "What is Cause and Effect?",
        body: `The CAUSE is why something happened. The EFFECT is what happened as a result.\n\nSignal words: Because, Since, Therefore, As a result, So that's why\n\nExample: "Because it rained all day (CAUSE), the soccer game was canceled (EFFECT)."`,
      },
      {
        heading: "Multiple Causes and Effects",
        body: `Sometimes one cause has many effects, or one effect has many causes! Like a chain reaction 🔗\n\nPractice identifying them with:\n"The temperature dropped below freezing. The pond froze over. The pipes in old houses burst. Schools closed for the day. Children went sledding!"`,
      },
      {
        heading: "Find It! 🎯",
        body: `Find 2 causes and 2 effects in this:\n\n"Maya forgot to water her plant for two weeks. The soil became dry and cracked. The leaves turned yellow and drooped. Maya felt sad when she saw it."\n\nList each cause and its matching effect!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is a CAUSE?", options: ["What happened as a result", "Why something happened", "The main idea", "A detail"], answer: 1 },
      { q: "Which word signals a cause-effect relationship?", options: ["Also", "However", "Because", "Finally"], answer: 2 },
      { q: "It rained all day, so the soccer game was canceled. What is the EFFECT?", options: ["It rained all day", "The soccer game was canceled", "The players got wet", "It was a sunny day"], answer: 1 },
      { q: "Can one cause have many effects?", options: ["No, only one", "Yes, like a chain reaction", "Only in science", "Only in stories"], answer: 1 },
      { q: "Maya forgot to water her plant, so the leaves turned yellow. What is the CAUSE?", options: ["The leaves turned yellow", "The soil was dry", "Maya forgot to water her plant", "Maya felt sad"], answer: 2 },
    ],
  },
  {
    id: "r5",
    title: "Author's Purpose",
    subject: "reading",
    grades: [4, 5],
    emoji: "🎯",
    description: "Understand WHY an author wrote something — PIE: Persuade, Inform, Entertain",
    sections: [
      {
        heading: "PIE — Three Main Purposes",
        body: `P = PERSUADE: The author wants to change your mind or get you to do something. Look for: opinion words, one-sided arguments, calls to action.\n\nI = INFORM: The author wants to teach you facts. Look for: data, definitions, explanations.\n\nE = ENTERTAIN: The author wants you to enjoy reading. Look for: characters, plot, descriptive language.`,
      },
      {
        heading: "How to Identify Purpose",
        body: `Ask these questions:\n• Does this try to convince me of something?\n• Does this teach me facts?\n• Does this tell a story for fun?\n\nClue: Authors can have MORE than one purpose! A story can both entertain AND inform.`,
      },
      {
        heading: "Identify the Purpose! 🎯",
        body: `What is the author's purpose for each?\n\n1) A news article about how recycling helps the planet.\n2) A funny story about a dragon who's afraid of fire.\n3) A pamphlet saying "Vote YES on the new park!"\n4) A science book chapter about the water cycle.\n\nWrite P, I, or E — and explain your thinking!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What does PIE stand for in author's purpose?", options: ["Play, Inform, Educate", "Persuade, Inform, Entertain", "Present, Imagine, Explain", "Point, Idea, Evidence"], answer: 1 },
      { q: "A pamphlet that says 'Vote YES on the new park!' has what purpose?", options: ["Inform", "Entertain", "Persuade", "Explain"], answer: 2 },
      { q: "A funny story about a dragon who is afraid of fire has what purpose?", options: ["Persuade", "Inform", "Entertain", "Warn"], answer: 2 },
      { q: "A science book about the water cycle has what purpose?", options: ["Entertain", "Persuade", "Inform", "Argue"], answer: 2 },
      { q: "Can a text have more than one author's purpose?", options: ["Never", "Yes, a story can both entertain and inform", "Only if it's very long", "Only if a teacher says so"], answer: 1 },
    ],
  },
  {
    id: "r6",
    title: "Theme",
    subject: "reading",
    grades: [4, 5],
    emoji: "💡",
    description: "Find the big life lesson or message the author wants you to take away",
    sections: [
      {
        heading: "What is Theme?",
        body: `Theme is the BIG message or life lesson in a story. It's different from the topic!\n\nTopic = what the story is ABOUT\nTheme = what the story is TRYING TO TEACH\n\nExample: A story ABOUT a turtle and hare racing → Theme: Slow and steady wins the race / Don't give up / Hard work beats natural talent.`,
      },
      {
        heading: "How to Find Theme",
        body: `Ask:\n• What lesson does the main character learn?\n• What problem was solved and how?\n• What would I tell a friend this story is really about?\n\nCommon themes:\n• Friendship matters\n• Honesty is the best policy\n• Never give up\n• Kindness is powerful\n• Hard work pays off`,
      },
      {
        heading: "Find the Theme! 🎯",
        body: `In the story "The Lion and the Mouse," a mighty lion spares a tiny mouse. Later, the mouse chews through a net to free the trapped lion.\n\nWhat is the theme? Write 2 sentences explaining evidence from the story that supports your theme statement.`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the difference between topic and theme?", options: ["They are the same thing", "Topic is what the story is about; theme is the life lesson", "Theme is longer than topic", "Topic is only in non-fiction"], answer: 1 },
      { q: "In The Tortoise and the Hare, the tortoise wins by going steady. What is the theme?", options: ["Turtles are fast", "Slow and steady wins the race", "Rabbits always lose", "Races are fun"], answer: 1 },
      { q: "Which is a common theme in stories?", options: ["The weather was cold", "The character ate lunch", "Friendship matters", "The house was big"], answer: 2 },
      { q: "How do you find the theme of a story?", options: ["Look at the first sentence only", "Ask what lesson the character learns", "Count the pages", "Read the author's bio"], answer: 1 },
      { q: "In 'The Lion and the Mouse,' a tiny mouse saves a mighty lion. What is the theme?", options: ["Lions are dangerous", "Even small acts of kindness matter", "Mice are brave animals", "Don't get caught in nets"], answer: 1 },
    ],
  },

  // ── MATH ─────────────────────────────────────────────────────────────────
  {
    id: "m1",
    title: "Adding to 1,000",
    subject: "math",
    grades: [2],
    emoji: "➕",
    description: "Add three-digit numbers using place value strategies",
    sections: [
      {
        heading: "Breaking Numbers Apart",
        body: `When you add big numbers, break them into hundreds, tens, and ones!\n\nExample: 342 + 215 = ?\n\nStep 1: Add hundreds: 300 + 200 = 500\nStep 2: Add tens: 40 + 10 = 50\nStep 3: Add ones: 2 + 5 = 7\n\nPut it together: 500 + 50 + 7 = 557!`,
      },
      {
        heading: "Regrouping",
        body: `Sometimes ones add up to 10 or more and you need to regroup (carry).\n\n246 + 178:\n• Ones: 6 + 8 = 14 → write 4, carry 1\n• Tens: 4 + 7 + 1 = 12 → write 2, carry 1\n• Hundreds: 2 + 1 + 1 = 4\n\nAnswer: 424!`,
      },
      {
        heading: "Solve These! 🎯",
        body: `Show your work for each one:\n\n1) 423 + 356 = ?\n2) 587 + 246 = ?\n3) 609 + 193 = ?\n\nCHALLENGE: A school collected 348 cans in week 1 and 275 cans in week 2. How many cans total?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is 342 + 215?", options: ["547", "557", "567", "537"], answer: 1 },
      { q: "When adding, what does 'regrouping' mean?", options: ["Starting over", "Carrying a value to the next place", "Subtracting instead", "Skipping a step"], answer: 1 },
      { q: "What is 246 + 178?", options: ["414", "424", "434", "444"], answer: 1 },
      { q: "In 423 + 356, what are the hundreds digits?", options: ["4 and 3", "2 and 5", "3 and 6", "4 and 6"], answer: 0 },
      { q: "A school collected 348 cans in week 1 and 275 in week 2. How many total?", options: ["613", "623", "633", "593"], answer: 1 },
    ],
  },
  {
    id: "m2",
    title: "Multiplication Facts",
    subject: "math",
    grades: [3],
    emoji: "✖️",
    description: "Master multiplication facts and understand what they really mean",
    sections: [
      {
        heading: "What is Multiplication?",
        body: `Multiplication is FAST addition of equal groups!\n\n4 × 3 means 4 groups of 3, or 3 + 3 + 3 + 3 = 12\n\nThink of it as an array: 4 rows of 3 dots = 12 dots total.\n\nThe × symbol means "groups of."`,
      },
      {
        heading: "Tricks for Tricky Facts",
        body: `×2: Double the number (6×2=12, think 6+6)\n\n×5: Count by 5s — the answer ends in 0 or 5\n\n×9 Finger Trick: Hold up 10 fingers. Put down finger #7 for 9×7. Fingers to the LEFT = tens digit (6). Fingers to the RIGHT = ones digit (3). Answer: 63!\n\n×10: Just add a zero!`,
      },
      {
        heading: "Fill In the Blanks! 🎯",
        body: `Fill in the missing numbers:\n\n7 × ___ = 56\n___ × 8 = 48\n9 × 6 = ___\n\nWORD PROBLEM: There are 8 tables in the cafeteria. Each table seats 7 students. How many students can eat at once?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What does 4 × 3 mean?", options: ["4 plus 3", "4 groups of 3", "4 minus 3", "4 divided by 3"], answer: 1 },
      { q: "What is 7 × 8?", options: ["54", "56", "58", "52"], answer: 1 },
      { q: "Using the ×9 finger trick, what is 9 × 7?", options: ["54", "63", "72", "81"], answer: 1 },
      { q: "What is the trick for multiplying by 10?", options: ["Double the number", "Add a zero", "Halve the number", "Count by 5s"], answer: 1 },
      { q: "8 tables × 7 students each = how many students?", options: ["54", "56", "48", "64"], answer: 1 },
    ],
  },
  {
    id: "m3",
    title: "Fractions",
    subject: "math",
    grades: [3, 4],
    emoji: "🍕",
    description: "Understand what fractions mean and how to compare them",
    sections: [
      {
        heading: "What is a Fraction?",
        body: `A fraction shows part of a whole.\n\nThe BOTTOM number (denominator) = how many equal parts total\nThe TOP number (numerator) = how many parts you have\n\n3/4 of a pizza = pizza cut into 4 equal slices, you have 3 of them.`,
      },
      {
        heading: "Comparing Fractions",
        body: `Same denominators? Bigger numerator = bigger fraction.\n3/8 > 2/8\n\nSame numerators? Smaller denominator = bigger fraction (more of the pie).\n1/3 > 1/4\n\nDifferent? Find equivalent fractions or use a number line!`,
      },
      {
        heading: "Fraction Problems! 🎯",
        body: `1) Draw a picture of 2/3.\n2) Which is bigger: 3/5 or 4/5? How do you know?\n3) Order from smallest to biggest: 1/2, 1/4, 3/4, 1/8\n\nWORD PROBLEM: Maria ate 2/6 of a pizza and her brother ate 3/6. Who ate more? How much was eaten in all?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "In the fraction 3/4, what does the 4 (denominator) tell you?", options: ["How many parts you have", "The total number of equal parts", "The whole number", "How to add fractions"], answer: 1 },
      { q: "Which fraction is bigger: 3/8 or 2/8?", options: ["2/8", "3/8", "They are equal", "Cannot tell"], answer: 1 },
      { q: "Which fraction is bigger: 1/3 or 1/4?", options: ["1/4", "1/3", "They are equal", "Cannot tell"], answer: 1 },
      { q: "Maria ate 2/6 and her brother ate 3/6 of a pizza. Who ate more?", options: ["Maria", "Her brother", "They ate the same", "Cannot tell"], answer: 1 },
      { q: "Order from smallest to biggest: 1/2, 1/4, 3/4, 1/8", options: ["1/8, 1/4, 1/2, 3/4", "1/4, 1/8, 1/2, 3/4", "3/4, 1/2, 1/4, 1/8", "1/2, 1/4, 3/4, 1/8"], answer: 0 },
    ],
  },
  {
    id: "m4",
    title: "Multi-Digit Multiplication",
    subject: "math",
    grades: [4],
    emoji: "🔢",
    description: "Multiply 2 and 3-digit numbers using the standard algorithm",
    sections: [
      {
        heading: "The Area Model",
        body: `Think of multiplication as finding the area of a rectangle!\n\n23 × 14:\n• 20 × 10 = 200\n• 20 × 4 = 80\n• 3 × 10 = 30\n• 3 × 4 = 12\n\nAdd all parts: 200 + 80 + 30 + 12 = 322!`,
      },
      {
        heading: "Standard Algorithm",
        body: `47 × 6:\n• Step 1: 6 × 7 = 42, write 2, carry 4\n• Step 2: 6 × 4 = 24, add 4 = 28\n• Answer: 282!\n\nFor two digits: 47 × 36\n= 47 × 6 (= 282) + 47 × 30 (= 1,410)\nAdd: 282 + 1,410 = 1,692`,
      },
      {
        heading: "Solve It! 🎯",
        body: `Solve each problem:\n\n1) 34 × 7 = ?\n2) 56 × 4 = ?\n3) 28 × 13 = ?\n\nCHALLENGE: A school orders 24 boxes of crayons. Each box has 48 crayons. How many crayons total?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "Using the area model, 23 × 14 = ?", options: ["312", "322", "332", "342"], answer: 1 },
      { q: "What is 47 × 6?", options: ["272", "282", "292", "262"], answer: 1 },
      { q: "What is 34 × 7?", options: ["228", "238", "248", "258"], answer: 1 },
      { q: "What is 56 × 4?", options: ["214", "224", "234", "244"], answer: 1 },
      { q: "24 boxes × 48 crayons each = how many crayons?", options: ["1,052", "1,152", "1,252", "1,052"], answer: 1 },
    ],
  },
  {
    id: "m5",
    title: "Order of Operations",
    subject: "math",
    grades: [5],
    emoji: "🎪",
    description: "Learn PEMDAS to solve math problems in the right order",
    sections: [
      {
        heading: "PEMDAS — Please Excuse My Dear Aunt Sally",
        body: `P = Parentheses first\nE = Exponents\nM = Multiplication\nD = Division (left to right)\nA = Addition\nS = Subtraction (left to right)\n\nExample: 2 + 3 × 4 = 14 (NOT 20!)\nBecause multiplication comes before addition: 3×4=12, then 2+12=14.`,
      },
      {
        heading: "Common Mistakes to Avoid",
        body: `Always do parentheses FIRST:\n(2 + 3) × 4 = 5 × 4 = 20\n\nMultiplication and division have EQUAL priority — go left to right.\nSame for addition and subtraction.\n\nExample: 20 ÷ 4 × 5 = 5 × 5 = 25 (NOT 1!)`,
      },
      {
        heading: "Solve in the Right Order! 🎯",
        body: `1) 3 + 4 × 2 = ?\n2) (3 + 4) × 2 = ?\n3) 15 - 6 ÷ 3 + 1 = ?\n4) (8 + 2) × 3 - 4 ÷ 2 = ?\n\nCHALLENGE: Write your own expression using 4 different operations that equals exactly 10!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What does PEMDAS stand for (first word)?", options: ["Parentheses", "Plus", "Power", "Product"], answer: 0 },
      { q: "What is 2 + 3 × 4?", options: ["20", "14", "24", "10"], answer: 1 },
      { q: "What is (2 + 3) × 4?", options: ["14", "20", "24", "10"], answer: 1 },
      { q: "What is 20 ÷ 4 × 5?", options: ["1", "25", "100", "4"], answer: 1 },
      { q: "What is 15 - 6 ÷ 3 + 1?", options: ["4", "14", "10", "12"], answer: 1 },
    ],
  },
  {
    id: "m6",
    title: "Decimals",
    subject: "math",
    grades: [4, 5],
    emoji: "💫",
    description: "Understand decimals as parts of a whole, related to fractions",
    sections: [
      {
        heading: "What Are Decimals?",
        body: `Decimals are another way to show fractions with denominators of 10, 100, etc.\n\n0.5 = 5/10 = one half\n0.25 = 25/100 = one quarter\n\nThe decimal point separates whole numbers from parts.\n3.7 = 3 whole things and 7 tenths more.`,
      },
      {
        heading: "Adding and Subtracting Decimals",
        body: `LINE UP THE DECIMAL POINTS!\n\n3.4 + 1.25:\nWrite 3.40 + 1.25 = 4.65\n\nFill in zeros to make the same number of decimal places. Then add/subtract just like whole numbers — bring the decimal point straight down.`,
      },
      {
        heading: "Decimal Problems! 🎯",
        body: `1) Write as a decimal: 7/10 = ___, 45/100 = ___\n2) Solve: 4.5 + 2.37 = ?, 8.0 - 3.45 = ?\n\nWORD PROBLEM: At the store, apple juice costs $2.49 and orange juice costs $1.75. How much do both cost together? How much change from $5?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is 0.5 as a fraction?", options: ["5/100", "5/10", "1/4", "5/1"], answer: 1 },
      { q: "What is 0.25 equal to?", options: ["1/2", "1/3", "1/4", "1/5"], answer: 2 },
      { q: "What is 4.5 + 2.37?", options: ["6.87", "6.82", "7.87", "6.77"], answer: 0 },
      { q: "What is 8.0 - 3.45?", options: ["4.45", "4.55", "5.45", "4.65"], answer: 1 },
      { q: "$2.49 + $1.75 = how much total?", options: ["$3.24", "$4.24", "$4.14", "$3.14"], answer: 1 },
    ],
  },

  // ── WRITING ───────────────────────────────────────────────────────────────
  {
    id: "w1",
    title: "Writing Great Sentences",
    subject: "writing",
    grades: [2, 3],
    emoji: "✍️",
    description: "Build strong sentences with subjects, verbs, and vivid details",
    sections: [
      {
        heading: "Every Sentence Needs Two Things",
        body: `A SUBJECT (who or what the sentence is about) and a VERB (what the subject does or is).\n\nThe dog ran. → Subject: dog. Verb: ran.\n\nWeak: The dog ran.\nStrong: The golden retriever raced across the muddy field!`,
      },
      {
        heading: "Making Sentences More Interesting",
        body: `Add WHERE: The dog ran in the park.\nAdd WHEN: The dog ran this morning.\nAdd HOW: The dog ran happily.\nAdd DETAILS: The fluffy golden dog ran joyfully through the park this morning.\n\nSee how much better that is?`,
      },
      {
        heading: "Upgrade These Sentences! 🎯",
        body: `Make each boring sentence into an exciting one!\n\n1) The bird flew.\n2) The girl ate lunch.\n3) The boy played.\n\nCHALLENGE: Write 3 sentences about your morning using at least 1 vivid detail in each one.`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What two things does every sentence need?", options: ["A noun and an adjective", "A subject and a verb", "A question and an answer", "A beginning and an end"], answer: 1 },
      { q: "In 'The dog ran,' what is the subject?", options: ["Ran", "The", "Dog", "Quickly"], answer: 2 },
      { q: "Which sentence has the most vivid detail?", options: ["She walked.", "She walked fast.", "She sprinted joyfully down the hallway.", "She was walking."], answer: 2 },
      { q: "What can you add to make a sentence more interesting?", options: ["More periods", "Where, when, how, or details", "Fewer words", "Capital letters"], answer: 1 },
      { q: "Which is a STRONG sentence?", options: ["The bird flew.", "It went fast.", "The tiny sparrow darted swiftly between the branches.", "There was a bird."], answer: 2 },
    ],
  },
  {
    id: "w2",
    title: "Paragraphs",
    subject: "writing",
    grades: [3, 4],
    emoji: "📝",
    description: "Learn the recipe for a perfect paragraph: topic sentence, details, conclusion",
    sections: [
      {
        heading: "The Paragraph Recipe",
        body: `A paragraph is like a sandwich! 🥪\n\nTOP BREAD = Topic Sentence (your main idea)\nFILLING = 3 Detail Sentences (supporting ideas/examples)\nBOTTOM BREAD = Closing Sentence (wrap it up)\n\nExample: "Dogs make wonderful pets. [Topic] They are loyal companions who love their owners. They can be trained to do many helpful things. Having a dog also encourages you to exercise. [Details] For these reasons, dogs truly deserve to be called man's best friend. [Closing]"`,
      },
      {
        heading: "Transition Words Make Paragraphs Flow",
        body: `Use these to connect your ideas smoothly:\n\nFirst • Second • Third • Also • In addition\nFor example • Furthermore • Most importantly\nFinally • In conclusion`,
      },
      {
        heading: "Write a Paragraph! 🎯",
        body: `Write a paragraph about YOUR favorite food!\n\nUse the sandwich recipe:\n• 1 topic sentence\n• 3 detail sentences\n• 1 closing sentence\n\nUse at least 2 transition words to connect your ideas.`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the 'sandwich' of a paragraph?", options: ["Title, body, caption", "Topic sentence, details, closing sentence", "Introduction, quotes, conclusion", "Hook, evidence, opinion"], answer: 1 },
      { q: "What is the purpose of the topic sentence?", options: ["To end the paragraph", "To state the main idea", "To list all the details", "To tell a story"], answer: 1 },
      { q: "Which is a good transition word?", options: ["Pizza", "Furthermore", "Running", "Colorful"], answer: 1 },
      { q: "How many detail sentences should a basic paragraph have?", options: ["1", "2", "3", "10"], answer: 2 },
      { q: "What does the closing sentence do?", options: ["Introduces a new topic", "Wraps up the paragraph", "Lists all the details again", "Asks a question"], answer: 1 },
    ],
  },
  {
    id: "w3",
    title: "Personal Narrative",
    subject: "writing",
    grades: [2, 3],
    emoji: "📔",
    description: "Tell a true story from your own life with a beginning, middle, and end",
    sections: [
      {
        heading: "What is a Personal Narrative?",
        body: `A personal narrative tells a TRUE STORY from your own life, written in first person (I, me, my, we).\n\nIt has:\n• A beginning that hooks the reader\n• A middle that tells what happened step by step\n• An ending that tells how it turned out or what you learned`,
      },
      {
        heading: "How to Hook Your Reader",
        body: `Start with a BANG, not "I am going to tell you about..." ❌\n\nHook ideas:\n• Start in the middle of the action\n• Ask a question\n• Describe what you saw, heard, or felt\n\nExample:\n❌ "I want to tell you about the day I got lost."\n✅ "My heart pounded as I spun around, looking for a familiar face in the crowd."`,
      },
      {
        heading: "Write Your Story! 🎯",
        body: `Think of a time you:\n• Felt really excited\n• Learned something new\n• Had an adventure\n\nWrite the beginning of your personal narrative using a HOOK sentence. Then outline:\n• Beginning (hook)\n• 3 Middle events\n• Ending (how it turned out / what you learned)`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What point of view is used in a personal narrative?", options: ["Third person (he/she/they)", "Second person (you)", "First person (I/me/my)", "No specific person"], answer: 2 },
      { q: "What makes a good 'hook' for a personal narrative?", options: ["'I am going to tell you about...'", "Starting in the middle of the action", "Listing all the events", "Ending the story first"], answer: 1 },
      { q: "Which is a better hook sentence?", options: ["I had an adventure.", "I want to tell you about my trip.", "My stomach dropped as the roller coaster crested the hill.", "This story is about a fun day."], answer: 2 },
      { q: "A personal narrative must be:", options: ["A made-up story", "A true story from your own life", "About a famous person", "Written in third person"], answer: 1 },
      { q: "What should the ending of a personal narrative include?", options: ["A new problem", "How it turned out or what you learned", "The beginning again", "Questions for the reader"], answer: 1 },
    ],
  },
  {
    id: "w4",
    title: "Opinion Writing",
    subject: "writing",
    grades: [3, 4, 5],
    emoji: "💭",
    description: "Share your opinion clearly with reasons and evidence to support it",
    sections: [
      {
        heading: "Opinion Writing Structure",
        body: `State your OPINION clearly.\nGive 3 REASONS.\nSupport each reason with EVIDENCE or EXAMPLES.\nWrite a CONCLUSION that restates your opinion.\n\nStarters: "I believe..." • "In my opinion..." • "I think... because..." • "For these reasons..."`,
      },
      {
        heading: "Strong Reasons vs. Weak Reasons",
        body: `Weak: "Summer is the best because it's fun."\n\nStrong: "Summer is the best season because students have time to explore hobbies, families can travel and bond, and the warm weather allows for outdoor activities that keep kids healthy and active."\n\nAdd specific details and examples!`,
      },
      {
        heading: "Pick a Side! 🎯",
        body: `Choose one topic and write an opinion paragraph:\n\nA) Should students have homework?\nB) What is the best subject in school?\nC) Should there be longer recesses?\n\nInclude:\n• Opinion statement\n• 2 reasons with evidence\n• Conclusion sentence`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the purpose of opinion writing?", options: ["To tell a true story", "To share your viewpoint with reasons", "To explain how something works", "To describe a place"], answer: 1 },
      { q: "Which is a strong opinion starter?", options: ["Once upon a time...", "In my opinion...", "Did you know...", "First of all..."], answer: 1 },
      { q: "What makes a reason STRONG in opinion writing?", options: ["It is short", "It has specific details and examples", "It uses the word 'because' once", "It repeats the opinion"], answer: 1 },
      { q: "What should the conclusion of opinion writing do?", options: ["Introduce a new opinion", "List all reasons again", "Restate the opinion and wrap up", "Ask the reader a question"], answer: 2 },
      { q: "How many reasons should you typically give in opinion writing?", options: ["1", "2", "3", "10"], answer: 2 },
    ],
  },
  {
    id: "w5",
    title: "Research Writing",
    subject: "writing",
    grades: [4, 5],
    emoji: "🔬",
    description: "Learn how to find facts and write an informational report",
    sections: [
      {
        heading: "Planning Your Report",
        body: `1) Choose a topic\n2) Write a research QUESTION (What do I want to find out?)\n3) Find at least 3 SOURCES\n4) Take NOTES in your own words — don't copy!\n5) Organize notes into categories\n6) Create an outline`,
      },
      {
        heading: "Writing the Report",
        body: `Introduction: Hook + background info + thesis statement\n\nBody paragraphs: Each paragraph covers one main idea. Use transition words. Include facts, examples, quotes.\n\nConclusion: Restate main ideas. End with an interesting thought or connection.`,
      },
      {
        heading: "Start Your Research! 🎯",
        body: `Choose an animal you're curious about. Write:\n\n1) Your research question\n2) 3 facts you already know about it\n3) 2 questions you want to research\n4) An outline: Introduction, 3 Body paragraph topics, Conclusion\n\nThen write just the introduction paragraph!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the first step in planning a research report?", options: ["Write the conclusion", "Choose a topic and write a research question", "Find pictures", "Write the body paragraphs"], answer: 1 },
      { q: "When taking notes, you should:", options: ["Copy word-for-word", "Write notes in your own words", "Memorize everything", "Skip this step"], answer: 1 },
      { q: "What does a good introduction include?", options: ["All the facts", "A hook, background info, and thesis statement", "The conclusion", "Only a question"], answer: 1 },
      { q: "How many sources should you find for a research report?", options: ["At least 1", "At least 3", "Exactly 10", "As few as possible"], answer: 1 },
      { q: "What should the conclusion of a research report do?", options: ["Introduce new information", "Restate main ideas and end with an interesting thought", "List all facts again", "Copy the introduction"], answer: 1 },
    ],
  },

  // ── SEL ───────────────────────────────────────────────────────────────────
  {
    id: "s1",
    title: "Identifying Emotions",
    subject: "sel",
    grades: [2, 3, 4, 5],
    emoji: "😊",
    description: "Name your feelings and understand why you feel that way",
    sections: [
      {
        heading: "The Feeling Wheel",
        body: `We have MANY more emotions than just happy, sad, mad!\n\nHappy → joyful, excited, proud, grateful, peaceful\nSad → disappointed, lonely, hurt, worried, left out\nAngry → frustrated, annoyed, jealous, overwhelmed\nScared → nervous, anxious, shy, unsure\n\nThe more emotion words you know, the better you understand yourself!`,
      },
      {
        heading: "Emotions in Your Body",
        body: `Your body gives you clues about how you feel!\n\n• Butterflies in your stomach = nervous\n• Racing heart = excited or scared\n• Tight chest = anxious or sad\n• Hot face = embarrassed or angry\n• Loose, relaxed muscles = calm or happy\n\nPay attention to your body's signals!`,
      },
      {
        heading: "Emotion Check-In! 🎯",
        body: `Think about how you feel RIGHT NOW.\n\n1) Write 3 words that describe your feeling (try to use specific words, not just "good" or "bad")\n2) Where do you feel it in your body?\n3) What happened that made you feel this way?\n4) What would help you feel even better?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "Why is it important to know many emotion words?", options: ["To sound smart", "To better understand yourself and communicate", "To win arguments", "To confuse others"], answer: 1 },
      { q: "Butterflies in your stomach might mean you feel:", options: ["Happy", "Nervous", "Angry", "Tired"], answer: 1 },
      { q: "A racing heart can mean you feel:", options: ["Calm", "Bored", "Excited or scared", "Proud"], answer: 2 },
      { q: "Which is a more specific emotion word than 'happy'?", options: ["Good", "Fine", "Grateful", "Okay"], answer: 2 },
      { q: "Where might you feel anxiety in your body?", options: ["In your knees", "Tight chest or stomach", "In your fingers", "In your ears"], answer: 1 },
    ],
  },
  {
    id: "s2",
    title: "Managing Big Feelings",
    subject: "sel",
    grades: [2, 3, 4, 5],
    emoji: "🌊",
    description: "Learn strategies to handle strong emotions in healthy ways",
    sections: [
      {
        heading: "The Emotion Thermometer",
        body: `Emotions can get BIG quickly — like water coming to a boil.\n\nLevel 1-3 (Cool): Calm, a little annoyed, slightly worried\nLevel 4-6 (Warming): Frustrated, sad, nervous\nLevel 7-9 (Hot): Very angry, upset, overwhelmed\nLevel 10 (Boiling): Can't think straight, need a break NOW\n\nThe goal is to notice your level early and use strategies BEFORE level 10!`,
      },
      {
        heading: "Cooling Down Strategies",
        body: `1) 5-4-3-2-1 Grounding: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.\n\n2) Box Breathing: Breathe in 4 counts, hold 4, out 4, hold 4. Repeat 3 times.\n\n3) Squeeze and Release: Squeeze your fists tight for 5 seconds, then release.\n\n4) Walk Away: Take a break, get some water, come back when calmer.`,
      },
      {
        heading: "Create Your Calm-Down Plan! 🎯",
        body: `Build YOUR personal calm-down toolkit:\n\n1) What are 3 warning signs that your feelings are getting big? (physical clues)\n2) What is your go-to strategy?\n3) Who can you talk to if you're overwhelmed?\n4) What is a calming place you can go?\n\nWrite it all on a "My Calm-Down Plan" card to keep!`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "When on the emotion thermometer should you use strategies?", options: ["Only at level 10", "Only at level 1", "Early, before level 10", "After you calm down"], answer: 2 },
      { q: "What is box breathing?", options: ["Breathing in a square room", "Breathe in 4, hold 4, out 4, hold 4", "Taking 10 deep breaths", "Breathing through your nose only"], answer: 1 },
      { q: "The 5-4-3-2-1 grounding strategy uses:", options: ["Counting to calm down", "Your 5 senses to focus on the present", "Writing in a journal", "Talking to a friend"], answer: 1 },
      { q: "What is the goal of having a calm-down plan?", options: ["To never feel angry", "To know your strategies before you need them", "To stay at level 10", "To avoid all problems"], answer: 1 },
      { q: "What does level 10 on the emotion thermometer mean?", options: ["You are very calm", "You can't think straight and need a break", "You feel slightly worried", "You are frustrated"], answer: 1 },
    ],
  },
  {
    id: "s3",
    title: "Empathy",
    subject: "sel",
    grades: [2, 3, 4, 5],
    emoji: "🤝",
    description: "Understand how others feel and show you care about their experiences",
    sections: [
      {
        heading: "What is Empathy?",
        body: `Empathy is the ability to understand and SHARE the feelings of another person. It's different from sympathy!\n\nSympathy: "I feel sorry for you."\nEmpathy: "I can imagine how you feel. I care about what you're going through."\n\nEmpathy = climbing INTO someone's shoes and seeing through their eyes.`,
      },
      {
        heading: "Showing Empathy in Action",
        body: `• Listen without interrupting\n• Make eye contact\n• Acknowledge their feeling: "That sounds really hard." "I can see why you'd feel that way."\n• Don't jump to fixing — sometimes people just need to be heard!\n• Ask: "Do you want advice or just someone to listen?"`,
      },
      {
        heading: "Empathy Practice! 🎯",
        body: `Scenario: Your friend didn't get picked for the team and is upset.\n\n1) What might they be feeling? (name 3 specific emotions)\n2) Write what you would SAY to them.\n3) Write what you would DO.\n4) What should you AVOID saying? (Think about what would hurt, not help)`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is empathy?", options: ["Feeling sorry for someone", "Understanding and sharing another person's feelings", "Giving advice", "Fixing someone's problems"], answer: 1 },
      { q: "What is the difference between empathy and sympathy?", options: ["There is no difference", "Empathy understands feelings; sympathy just feels sorry", "Sympathy is better than empathy", "Empathy is only for sad situations"], answer: 1 },
      { q: "Which shows empathy?", options: ["'Stop being so sad'", "'I can see why you'd feel that way'", "'It's not a big deal'", "'You're fine'"], answer: 1 },
      { q: "When showing empathy, you should:", options: ["Immediately give advice", "Tell them how you feel first", "Listen without interrupting", "Change the subject"], answer: 2 },
      { q: "What should you ask before giving advice?", options: ["Why did this happen?", "'Do you want advice or just someone to listen?'", "'Have you tried being happier?'", "'Is this a big deal?'"], answer: 1 },
    ],
  },
  {
    id: "s4",
    title: "Growth Mindset",
    subject: "sel",
    grades: [2, 3, 4, 5],
    emoji: "🌱",
    description: "Learn how your brain grows stronger when you face challenges",
    sections: [
      {
        heading: "Fixed vs. Growth Mindset",
        body: `FIXED MINDSET says:\n"I can't do this." • "I'm not smart." • "I give up." • "I'm just not good at math."\n\nGROWTH MINDSET says:\n"I can't do this YET." • "My brain is still learning." • "I'll try a different strategy." • "Math is challenging but I'm getting better!"\n\nThe word YET is POWERFUL! Your brain is like a MUSCLE — it gets stronger with practice!`,
      },
      {
        heading: "When Things Get Hard",
        body: `• Every expert was once a beginner\n• Making mistakes is HOW you learn\n• Struggling means your brain is growing!\n\nWhat to say when it's hard:\n"This is tough AND I can do tough things."\n"What strategy can I try next?"\n"Who can help me?"\n"What can I learn from this mistake?"`,
      },
      {
        heading: "Growth Mindset Challenge! 🎯",
        body: `Think about something you can't do YET but want to learn.\n\n1) What is it?\n2) Write it as a growth mindset statement: "I can't ___ YET, but I am learning by ___"\n3) What is ONE small step you can take this week?\n4) Find an example of someone who failed many times before succeeding. What does their story teach you?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is the key difference between a fixed and growth mindset?", options: ["Fixed is smarter", "Growth mindset believes abilities can improve with effort", "Fixed mindset works harder", "There is no difference"], answer: 1 },
      { q: "What powerful word turns fixed mindset into growth mindset?", options: ["Maybe", "Never", "YET", "Always"], answer: 2 },
      { q: "Your brain is like a muscle. What does this mean?", options: ["It gets tired easily", "It gets stronger with practice", "It stays the same size", "It only works for math"], answer: 1 },
      { q: "Which is a growth mindset statement?", options: ["'I'm just not good at this.'", "'I give up.'", "'I'll try a different strategy.'", "'I can never learn this.'"], answer: 2 },
      { q: "Making mistakes is:", options: ["Always bad", "How you learn and grow", "Something to avoid at all costs", "A sign of low intelligence"], answer: 1 },
    ],
  },
  {
    id: "s5",
    title: "Conflict Resolution",
    subject: "sel",
    grades: [3, 4, 5],
    emoji: "🕊️",
    description: "Learn healthy ways to solve disagreements and work through problems with others",
    sections: [
      {
        heading: "The PEACE Process",
        body: `P = Pause and breathe (don't react when emotions are hot)\nE = Explain your feelings using I-statements ("I feel ___ when ___ because ___")\nA = Active listening (hear the other side without interrupting)\nC = Consider solutions together (brainstorm options)\nE = Evaluate and agree on the best solution`,
      },
      {
        heading: "I-Statements vs. You-Statements",
        body: `You-statement: "YOU always leave me out!" → makes others defensive\n\nI-statement: "I FEEL left out WHEN I'm not included in the game, BECAUSE I want to play with my friends too."\n\nFormula: I feel [emotion] when [situation] because [why it matters to you]\n\nThis starts a conversation instead of an argument!`,
      },
      {
        heading: "Conflict Practice! 🎯",
        body: `Scenario: Two friends both want the same computer at the library but there's only one.\n\n1) Write an I-statement from each person's perspective.\n2) List 3 possible solutions.\n3) Which solution is fairest? Why?\n4) What would each person say using the PEACE process?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What does PEACE stand for (first step)?", options: ["Play", "Pause and breathe", "Plan", "Prevent"], answer: 1 },
      { q: "Which is an I-statement?", options: ["'You always do that!'", "'I feel hurt when you leave me out.'", "'Stop being mean!'", "'You never listen.'"], answer: 1 },
      { q: "What is the formula for an I-statement?", options: ["I think you should...", "I feel [emotion] when [situation] because [reason]", "I don't like when you...", "In my opinion..."], answer: 1 },
      { q: "Why are I-statements better than you-statements?", options: ["They are shorter", "They start a conversation instead of an argument", "They are more polite", "They avoid the problem"], answer: 1 },
      { q: "What does 'Active Listening' in PEACE mean?", options: ["Listening to music", "Hearing the other side without interrupting", "Talking louder", "Agreeing with everything"], answer: 1 },
    ],
  },
  {
    id: "s6",
    title: "Mindfulness",
    subject: "sel",
    grades: [2, 3, 4, 5],
    emoji: "🧘",
    description: "Practice being present and calm through breathing and mindful attention",
    sections: [
      {
        heading: "What is Mindfulness?",
        body: `Mindfulness means paying attention to RIGHT NOW — what you see, hear, feel, think — without judging it as good or bad.\n\nYour mind is like a snow globe: when it's shaken (stress, worries), everything is cloudy. When you pause and breathe, the snow settles and everything becomes clear again. ❄️`,
      },
      {
        heading: "Simple Mindfulness Practices",
        body: `🌬️ 4-7-8 Breathing: In for 4, hold for 7, out for 8. Repeat 3 times.\n\n👀 5 Senses Check-In: What do you see, hear, feel, smell, taste right now?\n\n🎵 Mindful Listening: Close your eyes. Listen for 30 seconds. Name every sound you hear.\n\n🚶 Mindful Walking: Walk slowly and notice each step, your breath, the air.`,
      },
      {
        heading: "Mindfulness Break! 🎯",
        body: `RIGHT NOW mindfulness exercise:\n\n1) Set a 2-minute timer.\n2) Sit comfortably, close your eyes or look down.\n3) Take 5 slow deep breaths.\n4) After the timer, write:\n   • 3 things you noticed in your body\n   • 2 thoughts that came and went\n   • 1 word to describe how you feel now\n5) How is this different from how you felt before?`,
        isActivity: true,
      },
    ],
    quiz: [
      { q: "What is mindfulness?", options: ["Thinking about the future", "Paying attention to the present moment without judgment", "Solving problems quickly", "Ignoring your feelings"], answer: 1 },
      { q: "The snow globe is used to explain:", options: ["Weather patterns", "How a calm mind is like settled snow", "A science experiment", "How to breathe"], answer: 1 },
      { q: "What is 4-7-8 breathing?", options: ["Count to 4, 7, and 8", "In 4, hold 7, out 8", "Walk 4, sit 7, stand 8", "Think for 4 minutes"], answer: 1 },
      { q: "The 5 Senses Check-In asks you to:", options: ["Count to 5", "Notice what you see, hear, feel, smell, taste right now", "Rate your feelings", "Make a list"], answer: 1 },
      { q: "How does mindfulness help with stress?", options: ["It makes stress disappear", "It helps you focus on the present and let the 'snow settle'", "It tells you to ignore problems", "It makes you sleepy"], answer: 1 },
    ],
  },
];

// ─── Subject config ───────────────────────────────────────────────────────────
type SubjectKey = "reading" | "math" | "writing" | "sel" | "coding";

const SUBJECTS: { key: SubjectKey; label: string; emoji: string; color: string; activeColor: string }[] = [
  { key: "reading", label: "Reading",  emoji: "📖", color: "from-cyan-500/20 to-cyan-600/10",   activeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  { key: "math",    label: "Math",     emoji: "➕", color: "from-blue-500/20 to-blue-600/10",   activeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  { key: "writing", label: "Writing",  emoji: "✍️", color: "from-pink-500/20 to-pink-600/10",   activeColor: "bg-pink-500/20 text-pink-300 border-pink-500/40" },
  { key: "sel",     label: "SEL",      emoji: "🌱", color: "from-emerald-500/20 to-emerald-600/10", activeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { key: "coding",  label: "Coding",   emoji: "💻", color: "from-violet-500/20 to-violet-600/10", activeColor: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
];

const GRADE_OPTIONS = [0, 2, 3, 4, 5];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LessonsPage() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [subject, setSubject] = useState<SubjectKey>("reading");
  const [gradeFilter, setGradeFilter] = useState<number>(0); // 0 = All
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [markedRead, setMarkedRead] = useState<Set<string>>(new Set());
  const [markFlash, setMarkFlash] = useState(false);

  // Track lesson opens + keep marked-read set in sync with server
  useEffect(() => {
    api.getMyLessonViews().then(views => {
      const ids = views.filter((v: any) => v.marked_read_at).map((v: any) => v.lesson_id);
      setMarkedRead(new Set(ids));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeLesson?.id) api.viewLesson(activeLesson.id).catch(() => {});
  }, [activeLesson?.id]);

  const handleMarkAsRead = async () => {
    if (!activeLesson) return;
    try {
      await api.markLessonRead(activeLesson.id);
      setMarkedRead(prev => new Set([...prev, activeLesson.id]));
      setMarkFlash(true);
      setTimeout(() => setMarkFlash(false), 2000);
    } catch (e: any) { alert("Couldn't save: " + e.message); }
  };

  // Presence ping
  const lessonActivity = activeLesson
    ? `Studying: ${activeLesson.title} 📖`
    : "Browsing Lessons 📚";
  usePresencePing(lessonActivity);
  const [showBrowser, setShowBrowser] = useState(false);

  // Quiz state
  const [quizMode, setQuizMode] = useState(false);
  const [quizQ, setQuizQ] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizDone, setQuizDone] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Load completed set from localStorage
  useEffect(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("lesson-"));
    const ids = keys.filter((k) => localStorage.getItem(k) === "done" || localStorage.getItem(k) === "true").map((k) => k.replace("lesson-", ""));
    setCompleted(new Set(ids));
  }, []);

  const markComplete = (id: string) => {
    localStorage.setItem(`lesson-${id}`, "done");
    setCompleted((prev) => new Set([...prev, id]));
  };

  const filteredLessons = ALL_LESSONS.filter((l) => {
    if (l.subject !== subject) return false;
    if (gradeFilter !== 0 && !l.grades.includes(gradeFilter)) return false;
    return true;
  });

  const currentSubject = SUBJECTS.find((s) => s.key === subject)!;

  const resetQuiz = () => {
    setQuizMode(false);
    setQuizDone(false);
    setQuizQ(0);
    setQuizScore(0);
    setQuizAnswers([]);
  };

  const handleQuizAnswer = (answerIndex: number) => {
    if (!activeLesson) return;
    const newAnswers = [...quizAnswers, answerIndex];
    setQuizAnswers(newAnswers);
    const isCorrect = answerIndex === activeLesson.quiz[quizQ].answer;
    const newScore = isCorrect ? quizScore + 1 : quizScore;
    if (isCorrect) setQuizScore(newScore);

    if (quizQ + 1 >= activeLesson.quiz.length) {
      setQuizDone(true);
      setQuizScore(newScore);
    } else {
      setQuizQ(quizQ + 1);
    }
  };

  return (
    <div className="p-7 space-y-6 animate-fade-in min-h-screen max-w-7xl mx-auto" style={{ background: "var(--bg)" }}>
      {/* ── Editorial masthead ── */}
      <header className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <span className="font-mono">BLOCKFORGE · LIBRARY</span>
        </div>
        <div className="section-label mb-2">— Reading room —</div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.02]" style={{ color: "var(--text-1)" }}>
          Lessons. <em style={{ color: "var(--accent)", fontStyle: "italic", fontWeight: 400 }}>Worth your time.</em>
        </h1>
        <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--text-2)" }}>
          Choose a subject to explore lessons designed for grades 2–5.
        </p>
      </header>

      {/* Subject tabs */}
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((s) => {
          const active = subject === s.key;
          return (
            <button
              key={s.key}
              onClick={() => { setSubject(s.key); setGradeFilter(0); setActiveLesson(null); resetQuiz(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 cursor-pointer ${
                active
                  ? s.activeColor
                  : dk
                  ? "bg-white/[0.04] text-white/50 border-white/[0.08] hover:bg-white/[0.08] hover:text-white/70"
                  : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 hover:text-gray-700"
              }`}
            >
              <span>{s.emoji}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Coding tab: show legacy grid + LessonsBrowser ── */}
      {subject === "coding" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-t3">Learn JavaScript step by step — see how each concept maps to Scratch blocks!</p>
            <button onClick={() => setShowBrowser(true)} className="btn-primary text-sm">
              Open Interactive Lessons
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CODING_LESSONS.map((lesson, i) => (
              <button
                key={i}
                onClick={() => setShowBrowser(true)}
                className={`group text-left p-5 rounded-2xl bg-gradient-to-br ${lesson.color} border transition-all cursor-pointer`}
                style={{ borderColor: "var(--border)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.3)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
              >
                <span className="text-3xl">{lesson.icon}</span>
                <h3 className="text-sm font-bold text-t1 mt-3 group-hover:text-t1 transition-colors">{lesson.title}</h3>
                <p className="text-xs text-t3 mt-1">{lesson.desc}</p>
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded-full mt-2 ${
                    lesson.level === "Beginner"
                      ? "bg-emerald-500/20 text-emerald-500"
                      : lesson.level === "Intermediate"
                      ? "bg-amber-500/20 text-amber-500"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {lesson.level}
                </span>
              </button>
            ))}
          </div>
          {showBrowser && <LessonsBrowser onClose={() => setShowBrowser(false)} />}
        </div>
      )}

      {/* ── All other subject tabs ── */}
      {subject !== "coding" && (
        <div className="space-y-5">
          {/* Grade filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-t3 uppercase tracking-wide">Grade:</span>
            <div className="flex gap-1.5 flex-wrap">
              {GRADE_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    gradeFilter === g
                      ? "bg-[var(--accent-light)] text-[var(--text-accent)] border-[var(--accent)]"
                      : dk
                      ? "bg-white/[0.04] text-white/40 border-white/[0.08] hover:bg-white/[0.08] hover:text-white/60"
                      : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {g === 0 ? "All" : `Grade ${g}`}
                </button>
              ))}
            </div>
          </div>

          {/* Lesson cards */}
          {filteredLessons.length === 0 ? (
            <div className="text-center py-16 text-t3">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">No lessons found for that grade. Try "All" to see everything.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLessons.map((lesson) => {
                const done = completed.has(lesson.id);
                const savedScore = localStorage.getItem(`quiz-${lesson.id}`);
                return (
                  <div
                    key={lesson.id}
                    className={`relative group flex flex-col p-5 rounded-2xl bg-gradient-to-br ${currentSubject.color} border cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`}
                    style={{ borderColor: done ? "rgba(34,197,94,0.4)" : "var(--border)" }}
                    onClick={() => { setActiveLesson(lesson); resetQuiz(); }}
                    onMouseEnter={(e) => {
                      if (!done) (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = done ? "rgba(34,197,94,0.4)" : "var(--border)";
                    }}
                  >
                    {/* Completion badge */}
                    {done && (
                      <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs">
                        ✓
                      </span>
                    )}
                    <span className="text-3xl mb-3">{lesson.emoji}</span>
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {lesson.grades.map((g) => (
                        <span
                          key={g}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: "rgba(139,92,246,0.15)",
                            color: "#c4b5fd",
                            border: "1px solid rgba(139,92,246,0.25)",
                          }}
                        >
                          Grade {g}
                        </span>
                      ))}
                    </div>
                    <h3 className="text-sm font-bold text-t1 group-hover:text-t1 transition-colors leading-snug">
                      {lesson.title}
                    </h3>
                    <p className="text-xs text-t3 mt-1 flex-1 leading-relaxed">{lesson.description}</p>
                    {savedScore && (
                      <div className="mt-2 text-[10px] text-amber-400 font-semibold">
                        Quiz: {savedScore}/{lesson.quiz.length} ⭐
                      </div>
                    )}
                    <button
                      className="mt-4 w-full text-xs font-semibold py-2 rounded-xl transition-all"
                      style={{
                        background: "rgba(139,92,246,0.15)",
                        color: "#c4b5fd",
                        border: "1px solid rgba(139,92,246,0.25)",
                      }}
                      onClick={(e) => { e.stopPropagation(); setActiveLesson(lesson); resetQuiz(); }}
                    >
                      Start Lesson →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Lesson Full-Screen Editorial ── */}
      {activeLesson && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
          {/* Subtle paper grid */}
          <div className="fixed inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          <div className="relative max-w-3xl mx-auto px-6 py-8">
            {/* Editorial header with back button */}
            <div
              className="sticky top-0 z-10 -mx-6 px-6 py-4 backdrop-blur-md border-b"
              style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <button onClick={() => { setActiveLesson(null); resetQuiz(); }} className="btn-ghost text-xs gap-1.5" style={{ padding: "6px 10px" }}>
                  ← Back to lessons
                </button>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
                  <span style={{ fontSize: 16 }}>{activeLesson.emoji}</span>
                  <span>{activeLesson.subject}</span>
                  <span style={{ color: "var(--border-md)" }}>·</span>
                  <span>Grade {activeLesson.grades.join("/")}</span>
                </div>
              </div>
            </div>

            {/* Masthead */}
            <div className="py-6">
              <div>
                <div className="section-label mb-2">— Today's reading —</div>
                <h2 className="font-display text-4xl sm:text-5xl leading-[1.05]" style={{ color: "var(--text-1)" }}>
                  {activeLesson.title}<em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
                </h2>
                <p className="text-sm mt-3 max-w-xl" style={{ color: "var(--text-2)" }}>
                  {activeLesson.description}
                </p>
                {quizMode && (
                  <div className="stamp mt-3">🧠 Quiz Mode</div>
                )}
              </div>
            </div>

            {/* Lesson body */}
            <div className="pb-10 space-y-5 mt-4">
              {/* Lesson sections (not in quiz mode) */}
              {!quizMode && !quizDone && activeLesson.sections.map((section, i) => (
                section.isActivity ? (
                  /* Activity box */
                  <div
                    key={i}
                    className="rounded-2xl p-5"
                    style={{
                      background: "rgba(251,191,36,0.07)",
                      border: "1.5px solid rgba(251,191,36,0.35)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">📝</span>
                      <h3 className="text-sm font-bold" style={{ color: "#fbbf24" }}>
                        {section.heading}
                      </h3>
                    </div>
                    <p
                      className="text-sm leading-relaxed whitespace-pre-line"
                      style={{ color: dk ? "rgba(255,255,255,0.75)" : "#374151" }}
                    >
                      {section.body}
                    </p>
                  </div>
                ) : (
                  /* Regular section */
                  <div key={i} className="space-y-2">
                    <h3
                      className="text-sm font-bold uppercase tracking-wide"
                      style={{ color: dk ? "#a78bfa" : "#7c3aed" }}
                    >
                      {section.heading}
                    </h3>
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
                        border: dk ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.07)",
                      }}
                    >
                      <p
                        className="text-sm leading-relaxed whitespace-pre-line"
                        style={{ color: dk ? "rgba(255,255,255,0.78)" : "#1f2937" }}
                      >
                        {section.body}
                      </p>
                    </div>
                  </div>
                )
              ))}

              {/* Quiz mode — active question */}
              {quizMode && !quizDone && activeLesson.quiz.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Quiz Time! 🧠</span>
                    <span className={`text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>
                      {quizQ + 1} / {activeLesson.quiz.length}
                    </span>
                  </div>

                  {/* Progress */}
                  <div className={`h-1.5 rounded-full ${dk ? "bg-white/10" : "bg-gray-200"}`}>
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                      style={{ width: `${((quizQ + 1) / activeLesson.quiz.length) * 100}%` }}
                    />
                  </div>

                  <p className={`text-base font-semibold leading-relaxed ${dk ? "text-white" : "text-gray-900"}`}>
                    {activeLesson.quiz[quizQ].q}
                  </p>

                  <div className="space-y-2">
                    {activeLesson.quiz[quizQ].options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => handleQuizAnswer(oi)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer
                          ${dk ? "border-white/10 text-white/70 hover:border-violet-500/50 hover:bg-violet-500/10"
                                 : "border-gray-200 text-gray-700 hover:border-violet-400 hover:bg-violet-50"}`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border mr-2.5 text-xs flex-shrink-0 ${dk ? "border-white/20" : "border-gray-300"}`}
                        >
                          {String.fromCharCode(65 + oi)}
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quiz done — results */}
              {quizDone && activeLesson && (
                <div className="text-center space-y-4 py-4">
                  <div className="text-5xl">
                    {quizScore >= 4 ? "🏆" : quizScore >= 3 ? "⭐" : "💪"}
                  </div>
                  <h3 className={`text-xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>
                    You got {quizScore}/{activeLesson.quiz.length}!
                  </h3>
                  <div className="flex justify-center gap-1">
                    {Array.from({ length: activeLesson.quiz.length }).map((_, i) => (
                      <span key={i} className="text-xl">{i < quizScore ? "⭐" : "○"}</span>
                    ))}
                  </div>
                  <p className={`text-sm ${dk ? "text-white/50" : "text-gray-500"}`}>
                    {quizScore >= 4 ? "Amazing work! Lesson complete! 🎉" : quizScore >= 3 ? "Good job! Keep practicing! 👍" : "Nice try! Review the lesson and try again!"}
                  </p>
                  <button
                    onClick={() => {
                      if (quizScore >= 3) {
                        // Mark lesson complete
                        localStorage.setItem(`lesson-${activeLesson.id}`, "done");
                        localStorage.setItem(`quiz-${activeLesson.id}`, String(quizScore));
                        setCompleted((prev) => new Set([...prev, activeLesson.id]));
                        setActiveLesson(null);
                        resetQuiz();
                      } else {
                        // Try again — go back to lesson
                        resetQuiz();
                      }
                    }}
                    className="btn-primary"
                  >
                    {quizScore >= 3 ? "Complete Lesson ✓" : "Try Again"}
                  </button>
                </div>
              )}

              {/* Action buttons (lesson mode, not quiz, not done) */}
              {!quizMode && !quizDone && (
                <div className="flex gap-3 pt-2 flex-wrap">
                  <button
                    onClick={() => { setActiveLesson(null); resetQuiz(); }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                    style={{
                      background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
                      color: dk ? "rgba(255,255,255,0.5)" : "#6b7280",
                      border: dk ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => { markComplete(activeLesson.id); handleMarkAsRead(); }}
                    className="flex-1 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all"
                    style={
                      markedRead.has(activeLesson.id) || markFlash
                        ? {
                            background: "rgba(34,197,94,0.15)",
                            color: "#4ade80",
                            border: "1px solid rgba(34,197,94,0.35)",
                          }
                        : {
                            background: "rgba(139,92,246,0.2)",
                            color: "#c4b5fd",
                            border: "1px solid rgba(139,92,246,0.4)",
                          }
                    }
                  >
                    {markFlash ? "✓ Saved!" : markedRead.has(activeLesson.id) ? "✓ Marked as read" : "📖 Mark as Read"}
                  </button>
                  {/* Take the Quiz button */}
                  {activeLesson.quiz.length > 0 && (
                    <button
                      onClick={() => setQuizMode(true)}
                      className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all"
                      style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", border: "none" }}
                    >
                      🧠 Take the Quiz!
                    </button>
                  )}
                </div>
              )}

              {/* Back to lesson button during quiz */}
              {quizMode && !quizDone && (
                <div className="pt-2">
                  <button
                    onClick={() => resetQuiz()}
                    className="text-xs cursor-pointer"
                    style={{ color: dk ? "rgba(255,255,255,0.3)" : "#9ca3af" }}
                  >
                    ← Back to lesson
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
