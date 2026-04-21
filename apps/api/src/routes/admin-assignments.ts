import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";

const router = Router();

const STAR_CLASS = "b0000000-0000-0000-0000-000000000002";
const TEACHER = "a0000000-0000-0000-0000-000000000002";

// Correct student IDs (verified against assign-students-to-grades.ts)
const STUDENTS: Record<string, string> = {
  anna:   "s0000000-0000-0000-0000-000000000007",
  aiden:  "s0000000-0000-0000-0000-000000000005",
  ameer:  "s0000000-0000-0000-0000-000000000008",
  jaida:  "s0000000-0000-0000-0000-000000000002",
  kaleb:  "s0000000-0000-0000-0000-000000000006",
  rayden: "s0000000-0000-0000-0000-000000000003",
  ryan:   "s0000000-0000-0000-0000-000000000001",
  zoey:   "s0000000-0000-0000-0000-000000000004",
};

// Per-subject grade levels for each student
const GRADE_MATRIX: Record<string, { reading: number; math: number; writing: number }> = {
  anna:   { reading: 1, math: 1, writing: 0 },
  aiden:  { reading: 3, math: 2, writing: 3 },
  ameer:  { reading: 5, math: 5, writing: 5 },
  jaida:  { reading: 3, math: 4, writing: 5 },
  kaleb:  { reading: 2, math: 2, writing: 2 },
  rayden: { reading: 3, math: 3, writing: 3 },
  ryan:   { reading: 5, math: 5, writing: 5 },
  zoey:   { reading: 1, math: 2, writing: 2 },
};

// Full pre-made content keyed by subject → grade
const CONTENT: Record<string, Record<number, { title: string; description: string; content: any }>> = {
  reading: {
    1: { title: "1st Grade Reading: Simple Words", description: "Read simple sight words and answer questions.", content: { title: "Simple Words", subject: "Reading", grade: "1st Grade", instructions: "Read each question carefully and choose the best answer.", totalPoints: 30, sections: [{ title: "Sight Word Practice", questions: [{ type: "multiple_choice", text: "Which word names a furry pet that says 'meow'?", options: ["A. dog", "B. cat", "C. bird", "D. fish"], correctIndex: 1, points: 6 }, { type: "multiple_choice", text: "Which word names a fruit that is red and grows on trees?", options: ["A. orange", "B. apple", "C. banana", "D. grape"], correctIndex: 1, points: 6 }, { type: "multiple_choice", text: "Which word names the color of fire trucks and stop signs?", options: ["A. blue", "B. green", "C. red", "D. yellow"], correctIndex: 2, points: 6 }, { type: "multiple_choice", text: "Which animal is the smallest?", options: ["A. elephant", "B. whale", "C. ant", "D. giraffe"], correctIndex: 2, points: 6 }, { type: "short_answer", text: "What color is the sun?", correctAnswer: "yellow or gold", points: 6 }] }] } },
    2: { title: "2nd Grade Reading: CVC Words", description: "Read consonant-vowel-consonant words.", content: { title: "CVC Words", subject: "Reading", grade: "2nd Grade", instructions: "Read each CVC word and answer the question.", totalPoints: 40, sections: [{ title: "CVC Word Reading", questions: [{ type: "multiple_choice", text: "What does 'cat' rhyme with?", options: ["A. dog", "B. bat", "C. tree", "D. run"], correctIndex: 1, points: 8 }, { type: "multiple_choice", text: "What is a 'hat'?", options: ["A. you wear on your foot", "B. you wear on your head", "C. you sit on", "D. you eat"], correctIndex: 1, points: 8 }, { type: "fill_blank", text: "A 'pot' is something you use to ___.", correctAnswer: "cook", points: 8 }, { type: "fill_blank", text: "When you 'run' you are moving ___.", correctAnswer: "fast or quickly", points: 8 }, { type: "short_answer", text: "What does 'sit' mean?", correctAnswer: "to be in a chair or down", points: 8 }] }] } },
    3: { title: "3rd Grade Reading: Short Stories", description: "Read and comprehend a short story.", content: { title: "Short Story: Max's Adventure", subject: "Reading", grade: "3rd Grade", instructions: "Read the story and answer the questions.", totalPoints: 50, sections: [{ title: "Story Comprehension", passage: "Max's Adventure\n\nMax was a curious boy who loved exploring the woods behind his house. One afternoon, while kicking through fallen leaves, his foot hit something hard. He looked down and saw an old metal box half-buried in the dirt.\n\nHis hands trembled as he brushed away the soil. The box had a rusty latch, but it opened with a creak. Inside was a rolled-up map, some old coins, and a small carved wooden bird.\n\nMax's eyes went wide. He carefully picked up the map and unrolled it. It showed the woods, the creek, and a big X near the old oak tree. He grabbed the box and ran toward the oak tree, his heart pounding with excitement.\n\nUnder a tangle of roots, he found a small tin that held a note: 'Well done, explorer! These treasures are yours now. Share the adventure.' Max smiled the whole way home. That evening, he showed his little sister the map and said, 'Tomorrow, we go together.'", questions: [{ type: "multiple_choice", text: "Who is the main character in the story?", options: ["A. Sarah", "B. Max", "C. Tom", "D. Lisa"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "What does Max find in the forest?", options: ["A. a key", "B. a map", "C. a treasure", "D. a friend"], correctIndex: 1, points: 10 }, { type: "fill_blank", text: "Max was _____ when he found something interesting.", correctAnswer: "excited or happy", points: 10 }, { type: "short_answer", text: "What did Max do after finding the treasure?", correctAnswer: "shared it or brought it home", points: 10 }, { type: "short_answer", text: "What is the lesson of this story?", correctAnswer: "adventure or exploration or curiosity", points: 10 }] }] } },
    5: { title: "5th Grade Reading: Complex Passage", description: "Read and analyze a complex narrative.", content: { title: "Complex Passage: The Island Mystery", subject: "Reading", grade: "5th Grade", instructions: "Read the passage carefully. Answer the questions based on details from the text.", totalPoints: 60, sections: [{ title: "Reading Comprehension & Analysis", passage: "The Island Mystery\n\nI had always been curious about the small, tree-covered island that sat just beyond the harbor. Every morning I would watch it from the dock, wondering what secrets it held. One summer day, I finally decided to find out.\n\nI paddled my small kayak through the calm water, the salt air filling my lungs. As I pulled the boat onto the rocky shore, I noticed something strange — stone walls half-hidden beneath thick vines and moss. My heart raced. These were not natural formations. Someone had built them, long ago.\n\nI spent hours exploring the ruins, finding broken pottery, carved stones, and the remains of what appeared to be a great hall. The environment itself seemed to whisper its history — the twisted roots pushing through cracked floors, the way sunlight filtered through the canopy and landed on ancient carvings. Everything about the place felt reverent, like stepping into a forgotten chapter of a history book.\n\nAs I paddled home that evening, I realized that curiosity had given me something no map could: a connection to the people who had come before me. Their story was written in stone, waiting for someone willing to look.", questions: [{ type: "multiple_choice", text: "What was the narrator's primary motivation for exploring the island?", options: ["A. to find treasure", "B. to discover an ancient civilization", "C. curiosity and adventure", "D. to escape from society"], correctIndex: 2, points: 12 }, { type: "multiple_choice", text: "How did the environment of the island affect the story?", options: ["A. it had no effect", "B. it created challenges and mysteries", "C. it was purely decorative", "D. it was hostile"], correctIndex: 1, points: 12 }, { type: "fill_blank", text: "The ancient structures suggested that the island was once _____ by a civilization.", correctAnswer: "inhabited or occupied", points: 12 }, { type: "short_answer", text: "What is the author's tone in describing the discovery?", correctAnswer: "curious, thoughtful, or reverent", points: 12 }, { type: "short_answer", text: "What does this story suggest about human curiosity and exploration?", correctAnswer: "it drives discovery or it reveals history", points: 12 }] }] } },
  },
  math: {
    1: { title: "1st Grade Math: Counting", description: "Count objects and solve simple addition.", content: { title: "Counting and Simple Addition", subject: "Math", grade: "1st Grade", instructions: "Count the objects and answer the questions.", totalPoints: 40, sections: [{ title: "Counting Practice", questions: [{ type: "multiple_choice", text: "If you have 2 apples and I give you 1 more, how many do you have?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 }, { type: "multiple_choice", text: "Count: 1, 2, ___, 4, 5. What comes next?", options: ["A. 1", "B. 2", "C. 3", "D. 6"], correctIndex: 2, points: 8 }, { type: "fill_blank", text: "If you have 3 toys and lose 1, you have ___ toys left.", correctAnswer: "2", points: 8 }, { type: "multiple_choice", text: "1 + 2 = ?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 }, { type: "short_answer", text: "If you have 2 cats and 1 dog, how many pets do you have?", correctAnswer: "3", points: 8 }] }] } },
    2: { title: "2nd Grade Math: Add and Subtract", description: "Addition and subtraction within 20.", content: { title: "Addition and Subtraction", subject: "Math", grade: "2nd Grade", instructions: "Solve the problems.", totalPoints: 50, sections: [{ title: "Add and Subtract", questions: [{ type: "multiple_choice", text: "5 + 3 = ?", options: ["A. 6", "B. 7", "C. 8", "D. 9"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "10 - 4 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 }, { type: "fill_blank", text: "7 + ___ = 12", correctAnswer: "5", points: 10 }, { type: "fill_blank", text: "15 - ___ = 9", correctAnswer: "6", points: 10 }, { type: "short_answer", text: "Tom has 8 marbles. He wins 3 more. How many does he have now?", correctAnswer: "11", points: 10 }] }] } },
    3: { title: "3rd Grade Math: Multiplication Intro", description: "Introduction to multiplication concepts.", content: { title: "Multiplication Introduction", subject: "Math", grade: "3rd Grade", instructions: "Use repeated addition to understand multiplication.", totalPoints: 50, sections: [{ title: "Multiplication as Repeated Addition", questions: [{ type: "multiple_choice", text: "3 groups of 2 equals: 2 + 2 + 2 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "4 × 5 = ?", options: ["A. 15", "B. 18", "C. 20", "D. 24"], correctIndex: 2, points: 10 }, { type: "fill_blank", text: "2 × 7 = ___", correctAnswer: "14", points: 10 }, { type: "fill_blank", text: "6 × 3 = ___", correctAnswer: "18", points: 10 }, { type: "short_answer", text: "If you have 4 bags with 3 apples each, how many apples total?", correctAnswer: "12", points: 10 }] }] } },
    4: { title: "4th Grade Math: Multi-Digit Multiplication", description: "Multiply two and three-digit numbers.", content: { title: "Multi-Digit Multiplication", subject: "Math", grade: "4th Grade", instructions: "Multiply larger numbers.", totalPoints: 50, sections: [{ title: "Multiplication Practice", questions: [{ type: "multiple_choice", text: "12 × 5 = ?", options: ["A. 50", "B. 55", "C. 60", "D. 65"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "23 × 4 = ?", options: ["A. 88", "B. 90", "C. 92", "D. 96"], correctIndex: 3, points: 10 }, { type: "fill_blank", text: "15 × 3 = ___", correctAnswer: "45", points: 10 }, { type: "fill_blank", text: "11 × 8 = ___", correctAnswer: "88", points: 10 }, { type: "short_answer", text: "A bookstore has 13 shelves with 6 books each. How many books total?", correctAnswer: "78", points: 10 }] }] } },
    5: { title: "5th Grade Math: Decimals & Fractions", description: "Operations with decimals and fractions.", content: { title: "Decimals and Fractions", subject: "Math", grade: "5th Grade", instructions: "Work with decimals and fractions.", totalPoints: 50, sections: [{ title: "Decimal and Fraction Operations", questions: [{ type: "multiple_choice", text: "0.5 + 0.25 = ?", options: ["A. 0.7", "B. 0.75", "C. 0.8", "D. 0.9"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "1/2 + 1/4 = ?", options: ["A. 1/6", "B. 2/6", "C. 3/4", "D. 3/8"], correctIndex: 2, points: 10 }, { type: "fill_blank", text: "2.5 × 4 = ___", correctAnswer: "10", points: 10 }, { type: "fill_blank", text: "3/4 ÷ 1/2 = ___", correctAnswer: "1.5 or 3/2", points: 10 }, { type: "short_answer", text: "A recipe calls for 2.5 cups of flour. If you double it, how much flour do you need?", correctAnswer: "5", points: 10 }] }] } },
  },
  writing: {
    0: { title: "Kindergarten Writing: Trace and Copy", description: "Trace letters and simple words.", content: { title: "Trace and Copy Letters", subject: "Writing", grade: "Kindergarten", instructions: "Copy simple letters and words.", totalPoints: 25, sections: [{ title: "Letter and Word Writing", questions: [{ type: "short_answer", text: "Copy the letter 'A':", lines: 2, points: 5 }, { type: "short_answer", text: "Copy the word 'cat':", lines: 2, points: 5 }, { type: "short_answer", text: "Copy the word 'dog':", lines: 2, points: 5 }, { type: "short_answer", text: "Write the first letter of your name:", lines: 2, points: 5 }, { type: "short_answer", text: "Draw and write about your favorite animal:", lines: 3, points: 5 }] }] } },
    2: { title: "2nd Grade Writing: Sentence Writing", description: "Write complete sentences.", content: { title: "Write Simple Sentences", subject: "Writing", grade: "2nd Grade", instructions: "Write complete sentences with a subject and verb.", totalPoints: 40, sections: [{ title: "Sentence Writing", questions: [{ type: "short_answer", text: "Write a sentence about your favorite food.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a sentence about what you did today.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a question about animals.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a sentence about the weather.", lines: 3, points: 10 }] }] } },
    3: { title: "3rd Grade Writing: Narrative Paragraph", description: "Write a paragraph about an experience.", content: { title: "Write a Narrative Paragraph", subject: "Writing", grade: "3rd Grade", instructions: "Write a paragraph (4-5 sentences) about something that happened to you.", totalPoints: 50, sections: [{ title: "Narrative Writing", questions: [{ type: "short_answer", text: "Write about a time you had fun with a friend. Include what you did, where you were, and how it made you feel.", lines: 6, points: 50 }] }] } },
    5: { title: "5th Grade Writing: Opinion Essay", description: "Write an opinion with supporting reasons.", content: { title: "Write an Opinion Essay", subject: "Writing", grade: "5th Grade", instructions: "Write a paragraph expressing your opinion with 2-3 reasons and examples.", totalPoints: 60, sections: [{ title: "Opinion Writing", questions: [{ type: "short_answer", text: "What is your favorite season? Write why you like it. Include at least 2-3 reasons with examples.", lines: 8, points: 60 }] }] } },
  },
  spelling: {
    0: { title: "Kindergarten Spelling: Basic Words", description: "Spell simple 3-letter words.", content: { title: "Kindergarten Spelling", subject: "Spelling", grade: "Kindergarten", instructions: "Fill in the missing letter for each word.", totalPoints: 25, sections: [{ title: "Spell the Word", questions: [{ type: "fill_blank", text: "c_t (a furry pet)", correctAnswer: "a", points: 5 }, { type: "fill_blank", text: "d_g (a barking pet)", correctAnswer: "o", points: 5 }, { type: "fill_blank", text: "s_n (shines in the sky)", correctAnswer: "u", points: 5 }, { type: "fill_blank", text: "r_d (a color)", correctAnswer: "e", points: 5 }, { type: "short_answer", text: "Spell the word for a thing you sit on:", correctAnswer: "chair", points: 5 }] }] } },
    1: { title: "1st Grade Spelling: Short Vowel Words", description: "Spell short vowel CVC words.", content: { title: "1st Grade Spelling", subject: "Spelling", grade: "1st Grade", instructions: "Spell the word that matches each clue.", totalPoints: 30, sections: [{ title: "Short Vowel Spelling", questions: [{ type: "short_answer", text: "Spell the word: a small insect (b_g)", correctAnswer: "bug", points: 6 }, { type: "short_answer", text: "Spell the word: you wear on your head (h_t)", correctAnswer: "hat", points: 6 }, { type: "short_answer", text: "Spell the word: opposite of hot (c_ld)", correctAnswer: "cold", points: 6 }, { type: "short_answer", text: "Spell the word: a number after 9 (t_n)", correctAnswer: "ten", points: 6 }, { type: "short_answer", text: "Spell the word: you sleep in it (b_d)", correctAnswer: "bed", points: 6 }] }] } },
    2: { title: "2nd Grade Spelling: Sight Words", description: "Spell common sight words correctly.", content: { title: "2nd Grade Spelling", subject: "Spelling", grade: "2nd Grade", instructions: "Choose the correct spelling for each word.", totalPoints: 40, sections: [{ title: "Sight Word Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. becaus", "B. because", "C. becuase", "D. becawse"], correctIndex: 1, points: 8 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. frend", "B. freind", "C. friend", "D. friand"], correctIndex: 2, points: 8 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. peple", "B. peeple", "C. pepole", "D. people"], correctIndex: 3, points: 8 }, { type: "short_answer", text: "Spell the word that means 'a lot': m_ny", correctAnswer: "many", points: 8 }, { type: "short_answer", text: "Spell the opposite of 'come': g_", correctAnswer: "go", points: 8 }] }] } },
    3: { title: "3rd Grade Spelling: Long Vowel Words", description: "Spell words with long vowel sounds.", content: { title: "3rd Grade Spelling", subject: "Spelling", grade: "3rd Grade", instructions: "Spell these long vowel words correctly.", totalPoints: 50, sections: [{ title: "Long Vowel Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. straet", "B. streat", "C. street", "D. streeat"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. trane", "B. train", "C. trayn", "D. trean"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Spell the word: a thing you dream of achieving (g__l)", correctAnswer: "goal", points: 10 }, { type: "short_answer", text: "Spell the word: a large body of water (o___n)", correctAnswer: "ocean", points: 10 }, { type: "short_answer", text: "Spell the word: opposite of night (d__)", correctAnswer: "day", points: 10 }] }] } },
    5: { title: "5th Grade Spelling: Academic Vocabulary", description: "Spell grade-level academic vocabulary words.", content: { title: "5th Grade Spelling", subject: "Spelling", grade: "5th Grade", instructions: "Spell these academic vocabulary words correctly.", totalPoints: 50, sections: [{ title: "Academic Vocabulary Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. comunnity", "B. comunity", "C. community", "D. commmunity"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. explaination", "B. explanation", "C. explanaton", "D. explanasion"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Spell the word that means 'to look at carefully': obs___ve", correctAnswer: "observe", points: 10 }, { type: "short_answer", text: "Spell the word that means 'a conclusion based on evidence': inf___ence", correctAnswer: "inference", points: 10 }, { type: "short_answer", text: "Spell the word that means 'to show or display': dem___strate", correctAnswer: "demonstrate", points: 10 }] }] } },
  },
};

const SEL_CONTENT = {
  title: "Growth Mindset: Learning from Challenges",
  description: "Watch a video about growth mindset and reflect on learning.",
  content: { title: "Growth Mindset: Learning from Challenges", subject: "Social-Emotional Learning", grade: "All Grades", instructions: "Watch the video about growth mindset. Then answer the reflection questions.", totalPoints: 40, video_url: "https://www.youtube.com/watch?v=2zrtHt3bBmQ", sections: [{ title: "Growth Mindset Reflection", questions: [{ type: "multiple_choice", text: "What is a growth mindset?", options: ["A. Believing you can't change", "B. Believing you can learn and grow with effort", "C. Giving up when something is hard", "D. Being afraid of mistakes"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Describe a time when you faced a challenge and learned from it.", lines: 4, points: 15 }, { type: "short_answer", text: "What's one thing you want to get better at? How will you use a growth mindset to help?", lines: 4, points: 15 }] }] },
};


// POST /admin/ensure-star-class
router.post("/ensure-star-class", async (req, res) => {
  try {
    const check = await db.prepare("SELECT id FROM classes WHERE id = ?").get(STAR_CLASS);
    if (check) {
      return res.json({ exists: true });
    }

    // Create Star class without teacher reference
    await db
      .prepare(
        `INSERT INTO classes (id, name, code) VALUES (?, ?, ?)`
      )
      .run(STAR_CLASS, "Star Class", "STAR");

    res.json({ created: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /admin/seed-star-assignments
// Deletes all Star class assignments and re-seeds with full pre-made content.
// Dynamically resolves real student/teacher IDs from the production DB by name.
// Each assignment targets exact students via target_student_ids.
// scheduled_date = NULL so assignments are always visible.
router.post("/seed-star-assignments", async (req, res) => {
  try {
    // Find teacher
    const teacherRow: any = await db.prepare(
      `SELECT id FROM users WHERE role IN ('teacher','admin') ORDER BY created_at LIMIT 1`
    ).get();
    if (!teacherRow) return res.status(500).json({ error: "No teacher found in DB" });
    const teacherId = teacherRow.id;

    // Find the Star class by name (use STAR_CLASS as fallback if it exists)
    let classId = STAR_CLASS;
    const starClassRow: any = await db.prepare(
      `SELECT id FROM classes WHERE name ILIKE '%star%' ORDER BY created_at LIMIT 1`
    ).get();
    if (starClassRow) classId = starClassRow.id;

    // Look up real student IDs from DB by first name (case-insensitive)
    // Fall back to hardcoded IDs if not found
    const resolvedStudents: Record<string, string> = { ...STUDENTS };
    for (const name of Object.keys(STUDENTS)) {
      const row: any = await db.prepare(
        `SELECT id FROM users WHERE role = 'student' AND name ILIKE ? LIMIT 1`
      ).get(`%${name}%`);
      if (row) resolvedStudents[name] = row.id;
    }

    // Upsert user_grade_levels with known grades using resolved IDs
    for (const [name, grades] of Object.entries(GRADE_MATRIX)) {
      const userId = resolvedStudents[name];
      try {
        await db.prepare(
          `INSERT INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             reading_grade = EXCLUDED.reading_grade,
             math_grade = EXCLUDED.math_grade,
             writing_grade = EXCLUDED.writing_grade`
        ).run(userId, grades.reading, grades.math, grades.writing);
      } catch { /* ignore if table doesn't exist yet */ }
    }

    // Clear existing assignments for this class
    await db.prepare("DELETE FROM assignments WHERE class_id = ?").run(classId);

    const created: any[] = [];
    const gradeKeys = { reading: "reading", math: "math", writing: "writing", spelling: "reading" } as const;

    for (const subject of ["reading", "math", "writing", "spelling"] as const) {
      const gradeField = gradeKeys[subject];
      const gradeSet = new Set(Object.values(GRADE_MATRIX).map(g => g[gradeField]));
      for (const grade of gradeSet) {
        const premade = CONTENT[subject]?.[grade];
        if (!premade) continue;
        const targetStudents = Object.entries(GRADE_MATRIX)
          .filter(([_, g]) => g[gradeField] === grade)
          .map(([name]) => resolvedStudents[name]);
        if (!targetStudents.length) continue;

        const id = randomUUID();
        await db.prepare(
          `INSERT INTO assignments (id, class_id, teacher_id, title, description, content, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, rubric, hints_allowed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?)`
        ).run(
          id, classId, teacherId, premade.title, premade.description,
          JSON.stringify(premade.content), subject, grade, grade,
          JSON.stringify(targetStudents),
          JSON.stringify([{ label: "Correctness", maxPoints: premade.content.totalPoints || 50 }]),
          new Date().toISOString()
        );
        created.push({ subject, grade, title: premade.title, students: targetStudents.length });
      }
    }

    // SEL — all students in class
    const allStudentIds = Object.values(resolvedStudents);
    const selId = randomUUID();
    await db.prepare(
      `INSERT INTO assignments (id, class_id, teacher_id, title, description, content, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, rubric, hints_allowed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'sel', 1, 5, ?, NULL, ?, 1, ?)`
    ).run(
      selId, classId, teacherId, SEL_CONTENT.title, SEL_CONTENT.description,
      JSON.stringify(SEL_CONTENT.content),
      JSON.stringify(allStudentIds),
      JSON.stringify([{ label: "Reflection", maxPoints: 40 }]),
      new Date().toISOString()
    );
    created.push({ subject: "sel", title: SEL_CONTENT.title, students: allStudentIds.length });

    res.json({ success: true, classId, teacherId, created: created.length, resolvedStudents, assignments: created });
  } catch (error) {
    console.error("seed-star-assignments failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Keep old name working too
router.post("/reset-star-assignments", (req, res) => res.redirect(307, "/api/admin/seed-star-assignments"));

// GET /admin/students — list all active students for the assignment builder
router.get("/students", async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT u.id::text, u.name, ugl.reading_grade, ugl.math_grade, ugl.writing_grade
         FROM users u
         LEFT JOIN user_grade_levels ugl ON ugl.user_id::text = u.id::text
         WHERE u.role = 'student'
         ORDER BY u.name`
      )
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /admin/assignments — list upcoming/today's assignments
router.get("/assignments", async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, target_subject, target_grade_min, target_student_ids, scheduled_date, created_at
         FROM assignments
         WHERE scheduled_date::date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY scheduled_date DESC, created_at DESC
         LIMIT 50`
      )
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /admin/pending-check?name=kaleb — simulate the pending query for a student by name
router.get("/pending-check", async (req, res) => {
  const name = (req.query.name as string) || "kaleb";
  try {
    const student: any = await db.prepare(
      `SELECT id::text, name FROM users WHERE name ILIKE ? AND role='student' LIMIT 1`
    ).get(`%${name}%`);
    if (!student) return res.json({ error: `Student '${name}' not found` });

    const classes = await db.prepare(
      `SELECT c.id::text, c.name FROM class_members cm JOIN classes c ON c.id::text = cm.class_id::text WHERE cm.user_id::text = ?`
    ).all(student.id) as any[];

    const todayStr = new Date().toISOString().slice(0, 10);
    const allPending: any[] = [];
    for (const cls of classes) {
      const rows = await db.prepare(`
        SELECT a.id::text, a.title, a.target_subject, a.target_grade_min, a.target_student_ids, a.scheduled_date, a.student_id::text
        FROM assignments a
        LEFT JOIN submissions s ON s.assignment_id::text = a.id::text AND s.student_id::text = ?
        WHERE a.class_id::text = ? AND s.id IS NULL
          AND (a.student_id IS NULL OR a.student_id::text = ?)
          AND (a.scheduled_date IS NULL OR a.scheduled_date::date <= ?::date)
        ORDER BY a.created_at ASC
      `).all(student.id, cls.id, student.id, todayStr) as any[];
      allPending.push({ classId: cls.id, className: cls.name, rawCount: rows.length, rows: rows.slice(0, 5) });
    }

    const grades: any = await db.prepare(
      `SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text = ?`
    ).get(student.id);

    // Simulate the JS filter from the real pending endpoint
    const filtered: any[] = [];
    for (const p of allPending) {
      for (const r of p.rows) {
        if (r.target_student_ids) {
          let ids: string[] = [];
          try { const parsed = JSON.parse(r.target_student_ids); if (Array.isArray(parsed)) ids = parsed; } catch {}
          if (ids.length > 0 && ids.includes(student.id)) filtered.push({ classId: p.classId, title: r.title, included: true, reason: "in target_student_ids" });
          else if (ids.length > 0) filtered.push({ title: r.title, included: false, reason: `not in ids: ${ids.slice(0,2).join(",")}...` });
        }
      }
    }

    res.json({ student, classes, grades, rawTotalRows: allPending.reduce((s, p) => s + p.rawCount, 0), simulatedFiltered: filtered });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// GET /admin/class-info — show Star class members and assignments (including NULL date)
router.get("/class-info", async (_req, res) => {
  try {
    const starClass: any = await db.prepare(
      `SELECT id, name FROM classes WHERE name ILIKE '%star%' ORDER BY created_at LIMIT 1`
    ).get();
    if (!starClass) return res.json({ error: "No Star class found" });

    const members = await db.prepare(
      `SELECT u.id::text, u.name, u.role, ugl.reading_grade, ugl.math_grade, ugl.writing_grade
       FROM class_members cm
       JOIN users u ON u.id = cm.user_id::uuid
       LEFT JOIN user_grade_levels ugl ON ugl.user_id::text = u.id::text
       WHERE cm.class_id = ?::uuid
       ORDER BY u.name`
    ).all(starClass.id) as any[];

    const assignments = await db.prepare(
      `SELECT id::text, title, target_subject, target_grade_min, target_student_ids, scheduled_date
       FROM assignments WHERE class_id = ?::uuid
       ORDER BY target_subject, target_grade_min`
    ).all(starClass.id) as any[];

    res.json({ class: starClass, memberCount: members.length, members, assignmentCount: assignments.length, assignments });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /admin/assignments/:id
router.delete("/assignments/:id", async (req, res) => {
  try {
    await db.prepare("DELETE FROM assignments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /admin/create-assignment
// Body: { title, subject, grade, studentIds: string[], date: "YYYY-MM-DD", passage?: string, questions: Question[] }
router.post("/create-assignment", async (req, res) => {
  try {
    const { title, subject, grade, studentIds, date, passage, questions } = req.body as {
      title: string;
      subject: string;
      grade: number;
      studentIds: string[];
      date: string;
      passage?: string;
      questions: { type: string; text: string; options?: string[]; correctIndex?: number; points?: number }[];
    };

    if (!title || !subject || !studentIds?.length || !date || !questions?.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the Star class for these students
    const classRow = await db
      .prepare(
        `SELECT DISTINCT cm.class_id FROM class_members cm
         JOIN classes c ON c.id = cm.class_id
         WHERE cm.user_id::text = ? AND c.name ILIKE '%Star%'
         LIMIT 1`
      )
      .get(studentIds[0]);

    const classId = classRow?.class_id ?? "0a635d79-4028-480c-8240-652a67bd973d";

    const dueTime = subject === "reading" ? "09:30:00"
      : subject === "math" ? "11:00:00"
      : subject === "writing" ? "13:30:00"
      : "14:30:00";

    const content = JSON.stringify({
      sections: [{
        title: passage ? "Reading & Questions" : title,
        passage: passage || undefined,
        questions: questions.map((q) => ({
          type: q.type,
          text: passage && questions.indexOf(q) === 0
            ? `📖 Read this story first:\n\n"${passage}"\n\n${q.text}`
            : q.text,
          context: passage || undefined,
          options: q.options,
          correctIndex: q.correctIndex,
          points: q.points ?? 1,
        })),
      }],
    });

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO assignments
         (id, class_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id, classId, title, subject, grade, grade,
        JSON.stringify(studentIds),
        date,
        `${date} ${dueTime}`,
        new Date().toISOString(),
        content
      );

    res.json({ success: true, id });
  } catch (error) {
    console.error("❌ create-assignment failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
