import Database from "better-sqlite3";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const dbPath = process.env.SQLITE_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../../db/scratch.db");
const db = Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const STAR_CLASS_ID = "b0000000-0000-0000-0000-000000000002";
const TEACHER_ID = "a0000000-0000-0000-0000-000000000002";
const SCHEDULED_DATE = "2026-04-20";

// Per-student per-subject grade levels from the teacher dashboard
const STUDENT_GRADES: Record<string, { reading: number; math: number; writing: number }> = {
  "s0000000-0000-0000-0000-000000000005": { reading: 3, math: 2, writing: 3 }, // Aiden
  "s0000000-0000-0000-0000-000000000008": { reading: 5, math: 5, writing: 5 }, // Ameer
  "s0000000-0000-0000-0000-000000000007": { reading: 1, math: 1, writing: 0 }, // Anna (K = 0)
  "s0000000-0000-0000-0000-000000000002": { reading: 3, math: 4, writing: 5 }, // Jaida
  "s0000000-0000-0000-0000-000000000006": { reading: 2, math: 2, writing: 2 }, // Kaleb
  "s0000000-0000-0000-0000-000000000003": { reading: 3, math: 3, writing: 3 }, // Rayden
  "s0000000-0000-0000-0000-000000000001": { reading: 5, math: 5, writing: 5 }, // Ryan
  "s0000000-0000-0000-0000-000000000004": { reading: 1, math: 2, writing: 2 }, // Zoey
};

function deleteStarAssignments(): number {
  try {
    const result = db.prepare("DELETE FROM assignments WHERE class_id = ?").run(STAR_CLASS_ID);
    return result.changes || 0;
  } catch (e: any) {
    console.error("Error deleting assignments:", e.message);
    return 0;
  }
}

function insertAssignment(assignment: any): boolean {
  try {
    const now = new Date().toISOString();
    const contentStr = typeof assignment.content === "string"
      ? assignment.content
      : JSON.stringify(assignment.content);

    db.prepare(`
      INSERT INTO assignments (
        id, class_id, teacher_id, title, description, content,
        target_subject, target_grade_min, target_grade_max,
        scheduled_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assignment.id,
      STAR_CLASS_ID,
      TEACHER_ID,
      assignment.title,
      assignment.description,
      contentStr,
      assignment.subject.toLowerCase(),
      assignment.targetGradeMin,
      assignment.targetGradeMax,
      SCHEDULED_DATE,
      now
    );
    return true;
  } catch (e: any) {
    console.error(`Error creating ${assignment.title}:`, e.message);
    return false;
  }
}

// Build assignments by determining which grades exist for each subject
const assignments = [
  // READING assignments (grades 1, 2, 3, 5)
  {
    id: crypto.randomUUID(),
    title: "1st Grade Reading: Simple Words",
    description: "Read simple sight words and match pictures.",
    subject: "Reading",
    targetGradeMin: 1,
    targetGradeMax: 1,
    content: {
      title: "Simple Words",
      subject: "Reading",
      grade: "1st Grade",
      instructions: "Look at each picture. Circle the correct word.",
      totalPoints: 30,
      sections: [{
        title: "Match Words to Pictures",
        questions: [
          { type: "multiple_choice", text: "Which word is the picture showing a cat?", options: ["A. dog", "B. cat", "C. bird", "D. fish"], correctIndex: 1, points: 6 },
          { type: "multiple_choice", text: "Which word matches this apple picture?", options: ["A. orange", "B. apple", "C. banana", "D. grape"], correctIndex: 1, points: 6 },
          { type: "multiple_choice", text: "Which word means the color red?", options: ["A. blue", "B. green", "C. red", "D. yellow"], correctIndex: 2, points: 6 },
          { type: "multiple_choice", text: "Which is a small animal?", options: ["A. elephant", "B. whale", "C. ant", "D. giraffe"], correctIndex: 2, points: 6 },
          { type: "short_answer", text: "What color is the sun?", correctAnswer: "yellow or gold", points: 6 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "2nd Grade Reading: CVC Words",
    description: "Read consonant-vowel-consonant words.",
    subject: "Reading",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "CVC Words",
      subject: "Reading",
      grade: "2nd Grade",
      instructions: "Read each CVC word and answer the question.",
      totalPoints: 40,
      sections: [{
        title: "CVC Word Reading",
        questions: [
          { type: "multiple_choice", text: "What does 'cat' rhyme with?", options: ["A. dog", "B. bat", "C. tree", "D. run"], correctIndex: 1, points: 8 },
          { type: "multiple_choice", text: "What is a 'hat'?", options: ["A. you wear on your foot", "B. you wear on your head", "C. you sit on", "D. you eat"], correctIndex: 1, points: 8 },
          { type: "fill_blank", text: "A 'pot' is something you use to ___.", correctAnswer: "cook", points: 8 },
          { type: "fill_blank", text: "When you 'run' you are moving ___.", correctAnswer: "fast or quickly", points: 8 },
          { type: "short_answer", text: "What does 'sit' mean?", correctAnswer: "to be in a chair or down", points: 8 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "3rd Grade Reading: Short Stories",
    description: "Read and comprehend a short story.",
    subject: "Reading",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Short Story: Max's Adventure",
      subject: "Reading",
      grade: "3rd Grade",
      instructions: "Read the story and answer the questions.",
      totalPoints: 50,
      sections: [{
        title: "Story Comprehension",
        questions: [
          { type: "multiple_choice", text: "Who is the main character in the story?", options: ["A. Sarah", "B. Max", "C. Tom", "D. Lisa"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "What does Max find in the forest?", options: ["A. a key", "B. a map", "C. a treasure", "D. a friend"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "Max was _____ when he found something interesting.", correctAnswer: "excited or happy", points: 10 },
          { type: "short_answer", text: "What did Max do after finding the treasure?", correctAnswer: "shared it or brought it home", points: 10 },
          { type: "short_answer", text: "What is the lesson of this story?", correctAnswer: "adventure or exploration or curiosity", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "5th Grade Reading: Complex Passage",
    description: "Read and analyze a complex narrative.",
    subject: "Reading",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Complex Passage: The Island Mystery",
      subject: "Reading",
      grade: "5th Grade",
      instructions: "Read the passage carefully. Answer the questions based on details from the text.",
      totalPoints: 60,
      sections: [{
        title: "Reading Comprehension & Analysis",
        questions: [
          { type: "multiple_choice", text: "What was the narrator's primary motivation for exploring the island?", options: ["A. to find treasure", "B. to discover an ancient civilization", "C. curiosity and adventure", "D. to escape from society"], correctIndex: 2, points: 12 },
          { type: "multiple_choice", text: "How did the environment of the island affect the story?", options: ["A. it had no effect", "B. it created challenges and mysteries", "C. it was purely decorative", "D. it was hostile"], correctIndex: 1, points: 12 },
          { type: "fill_blank", text: "The ancient structures suggested that the island was once _____ by a civilization.", correctAnswer: "inhabited or occupied", points: 12 },
          { type: "short_answer", text: "What is the author's tone in describing the discovery?", correctAnswer: "curious, thoughtful, or reverent", points: 12 },
          { type: "short_answer", text: "What does this story suggest about human curiosity and exploration?", correctAnswer: "it drives discovery or it reveals history", points: 12 }
        ]
      }]
    }
  },

  // MATH assignments (grades 1, 2, 3, 4, 5)
  {
    id: crypto.randomUUID(),
    title: "1st Grade Math: Counting",
    description: "Count objects and solve simple addition.",
    subject: "Math",
    targetGradeMin: 1,
    targetGradeMax: 1,
    content: {
      title: "Counting and Simple Addition",
      subject: "Math",
      grade: "1st Grade",
      instructions: "Count the objects and answer the questions.",
      totalPoints: 40,
      sections: [{
        title: "Counting Practice",
        questions: [
          { type: "multiple_choice", text: "If you have 2 apples and I give you 1 more, how many do you have?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 },
          { type: "multiple_choice", text: "Count: 1, 2, ___, 4, 5. What comes next?", options: ["A. 1", "B. 2", "C. 3", "D. 6"], correctIndex: 2, points: 8 },
          { type: "fill_blank", text: "If you have 3 toys and lose 1, you have ___ toys left.", correctAnswer: "2", points: 8 },
          { type: "multiple_choice", text: "1 + 2 = ?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 },
          { type: "short_answer", text: "If you have 2 cats and 1 dog, how many pets do you have?", correctAnswer: "3", points: 8 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "2nd Grade Math: Add and Subtract",
    description: "Addition and subtraction within 20.",
    subject: "Math",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "Addition and Subtraction",
      subject: "Math",
      grade: "2nd Grade",
      instructions: "Solve the problems.",
      totalPoints: 50,
      sections: [{
        title: "Add and Subtract",
        questions: [
          { type: "multiple_choice", text: "5 + 3 = ?", options: ["A. 6", "B. 7", "C. 8", "D. 9"], correctIndex: 2, points: 10 },
          { type: "multiple_choice", text: "10 - 4 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "7 + ___ = 12", correctAnswer: "5", points: 10 },
          { type: "fill_blank", text: "15 - ___ = 9", correctAnswer: "6", points: 10 },
          { type: "short_answer", text: "Tom has 8 marbles. He wins 3 more. How many does he have now?", correctAnswer: "11", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "3rd Grade Math: Multiplication Intro",
    description: "Introduction to multiplication concepts.",
    subject: "Math",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Multiplication Introduction",
      subject: "Math",
      grade: "3rd Grade",
      instructions: "Use repeated addition to understand multiplication.",
      totalPoints: 50,
      sections: [{
        title: "Multiplication as Repeated Addition",
        questions: [
          { type: "multiple_choice", text: "3 groups of 2 equals: 2 + 2 + 2 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "4 × 5 = ?", options: ["A. 15", "B. 18", "C. 20", "D. 24"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "2 × 7 = ___", correctAnswer: "14", points: 10 },
          { type: "fill_blank", text: "6 × 3 = ___", correctAnswer: "18", points: 10 },
          { type: "short_answer", text: "If you have 4 bags with 3 apples each, how many apples total?", correctAnswer: "12", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "4th Grade Math: Multi-Digit Multiplication",
    description: "Multiply two and three-digit numbers.",
    subject: "Math",
    targetGradeMin: 4,
    targetGradeMax: 4,
    content: {
      title: "Multi-Digit Multiplication",
      subject: "Math",
      grade: "4th Grade",
      instructions: "Multiply larger numbers.",
      totalPoints: 50,
      sections: [{
        title: "Multiplication Practice",
        questions: [
          { type: "multiple_choice", text: "12 × 5 = ?", options: ["A. 50", "B. 55", "C. 60", "D. 65"], correctIndex: 2, points: 10 },
          { type: "multiple_choice", text: "23 × 4 = ?", options: ["A. 88", "B. 90", "C. 92", "D. 96"], correctIndex: 3, points: 10 },
          { type: "fill_blank", text: "15 × 3 = ___", correctAnswer: "45", points: 10 },
          { type: "fill_blank", text: "11 × 8 = ___", correctAnswer: "88", points: 10 },
          { type: "short_answer", text: "A bookstore has 13 shelves with 6 books each. How many books total?", correctAnswer: "78", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "5th Grade Math: Decimals & Fractions",
    description: "Operations with decimals and fractions.",
    subject: "Math",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Decimals and Fractions",
      subject: "Math",
      grade: "5th Grade",
      instructions: "Work with decimals and fractions.",
      totalPoints: 50,
      sections: [{
        title: "Decimal and Fraction Operations",
        questions: [
          { type: "multiple_choice", text: "0.5 + 0.25 = ?", options: ["A. 0.7", "B. 0.75", "C. 0.8", "D. 0.9"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "1/2 + 1/4 = ?", options: ["A. 1/6", "B. 2/6", "C. 3/4", "D. 3/8"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "2.5 × 4 = ___", correctAnswer: "10", points: 10 },
          { type: "fill_blank", text: "3/4 ÷ 1/2 = ___", correctAnswer: "1.5 or 3/2", points: 10 },
          { type: "short_answer", text: "A recipe calls for 2.5 cups of flour. If you double it, how much flour do you need?", correctAnswer: "5", points: 10 }
        ]
      }]
    }
  },

  // WRITING assignments (grades 0/K, 2, 3, 5)
  {
    id: crypto.randomUUID(),
    title: "Kindergarten Writing: Trace and Copy",
    description: "Trace letters and simple words.",
    subject: "Writing",
    targetGradeMin: 0,
    targetGradeMax: 0,
    content: {
      title: "Trace and Copy Letters",
      subject: "Writing",
      grade: "Kindergarten",
      instructions: "Copy simple letters and words.",
      totalPoints: 25,
      sections: [{
        title: "Letter and Word Writing",
        questions: [
          { type: "short_answer", text: "Copy the letter 'A':", lines: 2, points: 5 },
          { type: "short_answer", text: "Copy the word 'cat':", lines: 2, points: 5 },
          { type: "short_answer", text: "Copy the word 'dog':", lines: 2, points: 5 },
          { type: "short_answer", text: "Write the first letter of your name:", lines: 2, points: 5 },
          { type: "short_answer", text: "Draw and write about your favorite animal:", lines: 3, points: 5 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "2nd Grade Writing: Sentence Writing",
    description: "Write complete sentences.",
    subject: "Writing",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "Write Simple Sentences",
      subject: "Writing",
      grade: "2nd Grade",
      instructions: "Write complete sentences with a subject and verb.",
      totalPoints: 40,
      sections: [{
        title: "Sentence Writing",
        questions: [
          { type: "short_answer", text: "Write a sentence about your favorite food.", lines: 3, points: 10 },
          { type: "short_answer", text: "Write a sentence about what you did today.", lines: 3, points: 10 },
          { type: "short_answer", text: "Write a question about animals.", lines: 3, points: 10 },
          { type: "short_answer", text: "Write a sentence about the weather.", lines: 3, points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "3rd Grade Writing: Narrative Paragraph",
    description: "Write a paragraph about an experience.",
    subject: "Writing",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Write a Narrative Paragraph",
      subject: "Writing",
      grade: "3rd Grade",
      instructions: "Write a paragraph (4-5 sentences) about something that happened to you.",
      totalPoints: 50,
      sections: [{
        title: "Narrative Writing",
        questions: [
          { type: "short_answer", text: "Write about a time you had fun with a friend. Include what you did, where you were, and how it made you feel.", lines: 6, points: 50 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "5th Grade Writing: Opinion Essay",
    description: "Write an opinion with supporting reasons.",
    subject: "Writing",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Write an Opinion Essay",
      subject: "Writing",
      grade: "5th Grade",
      instructions: "Write a paragraph expressing your opinion with 2-3 reasons and examples.",
      totalPoints: 60,
      sections: [{
        title: "Opinion Writing",
        questions: [
          { type: "short_answer", text: "What is your favorite season? Write why you like it. Include at least 2-3 reasons with examples.", lines: 8, points: 60 }
        ]
      }]
    }
  },

  // SEL assignment (class-wide, all grades)
  {
    id: crypto.randomUUID(),
    title: "Growth Mindset: Learning from Challenges",
    description: "Watch a video about growth mindset and reflect on learning.",
    subject: "SEL",
    targetGradeMin: 1,
    targetGradeMax: 5,
    content: {
      title: "Growth Mindset: Learning from Challenges",
      subject: "Social-Emotional Learning",
      grade: "All Grades",
      instructions: "Watch the video about growth mindset. Then answer the reflection questions.",
      totalPoints: 40,
      video_url: "https://www.youtube.com/watch?v=2zrtHt3bBmQ",
      sections: [{
        title: "Growth Mindset Reflection",
        questions: [
          { type: "multiple_choice", text: "What is a growth mindset?", options: ["A. Believing you can't change", "B. Believing you can learn and grow with effort", "C. Giving up when something is hard", "D. Being afraid of mistakes"], correctIndex: 1, points: 10 },
          { type: "short_answer", text: "Describe a time when you faced a challenge and learned from it.", lines: 4, points: 15 },
          { type: "short_answer", text: "What's one thing you want to get better at? How will you use a growth mindset to help?", lines: 4, points: 15 }
        ]
      }]
    }
  }
];

async function main() {
  console.log("\n🔧 Rebuilding Star class assignments with correct per-subject grade targeting...\n");

  try {
    // Delete existing assignments
    console.log("📁 Deleting existing assignments from Star class...");
    const deleted = deleteStarAssignments();
    console.log(`✅ Deleted ${deleted} existing assignments\n`);

    // Insert new assignments
    console.log("📚 Creating 14 Monday assignments with per-subject per-student grade targeting:\n");
    let created = 0;

    for (const assignment of assignments) {
      if (insertAssignment(assignment)) {
        const gradeLabel = assignment.targetGradeMin === 0 ? "K" : `Grade ${assignment.targetGradeMin}`;
        console.log(`✅ ${assignment.title} [${gradeLabel}, ${assignment.subject}]`);
        created++;
      }
    }

    console.log(`\n✅ Successfully created ${created} assignments!\n`);
    console.log(`📊 Summary:`);
    console.log(`   - Reading: 4 assignments (Grades 1, 2, 3, 5)`);
    console.log(`   - Math: 5 assignments (Grades 1, 2, 3, 4, 5)`);
    console.log(`   - Writing: 4 assignments (Grades K, 2, 3, 5)`);
    console.log(`   - SEL: 1 assignment (All grades with video)`);
    console.log(`   - All scheduled for: 2026-04-20`);
    console.log(`   - All assigned to: Star class\n`);
    console.log(`📋 Student Grade Mapping (per subject):`);
    console.log(`   Aiden: Reading 3, Math 2, Writing 3`);
    console.log(`   Ameer: Reading 5, Math 5, Writing 5`);
    console.log(`   Anna: Reading 1, Math 1, Writing K`);
    console.log(`   Jaida: Reading 3, Math 4, Writing 5`);
    console.log(`   Kaleb: Reading 2, Math 2, Writing 2`);
    console.log(`   Rayden: Reading 3, Math 3, Writing 3`);
    console.log(`   Ryan: Reading 5, Math 5, Writing 5`);
    console.log(`   Zoey: Reading 1, Math 2, Writing 2\n`);
    console.log(`✅ Each student now sees assignments targeted to their grade in that subject!\n`);

  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }

  db.close();
}

main();
