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

const assignments = [
  // WRITING - Story/Narrative progression by grade
  {
    id: crypto.randomUUID(),
    title: "Grade 2: Complete the Story Starter",
    description: "Read the story starter and write to continue the story.",
    subject: "Writing",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "Complete the Story Starter",
      subject: "Writing",
      grade: "2nd Grade",
      instructions: "Read the story starter. Write 3-4 sentences to continue the story.",
      totalPoints: 30,
      sections: [{
        title: "Story Starter",
        questions: [{
          type: "short_answer",
          text: "One sunny day, Maya found a mysterious box under her bed. What was inside? Write what happens next.",
          lines: 5,
          points: 30
        }]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 3: Write a Narrative Paragraph",
    description: "Write a paragraph about a time you helped a friend.",
    subject: "Writing",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Write a Narrative Paragraph",
      subject: "Writing",
      grade: "3rd Grade",
      instructions: "Write a paragraph (5-7 sentences) about a time you helped a friend. Include: what happened, who you helped, and how they felt.",
      totalPoints: 40,
      sections: [{
        title: "Narrative Writing",
        questions: [{
          type: "short_answer",
          text: "Write about a time you helped a friend. Include what happened, who you helped, and how they felt.",
          lines: 7,
          points: 40
        }]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 4: Write an Opinion Paragraph",
    description: "Write a paragraph expressing your opinion about a topic.",
    subject: "Writing",
    targetGradeMin: 4,
    targetGradeMax: 4,
    content: {
      title: "Write an Opinion Paragraph",
      subject: "Writing",
      grade: "4th Grade",
      instructions: "Write a paragraph (6-8 sentences) expressing your opinion. Include: your opinion, reasons that support your opinion, and examples.",
      totalPoints: 50,
      sections: [{
        title: "Opinion Writing",
        questions: [{
          type: "short_answer",
          text: "What is your favorite subject in school? Write why you like it and give 2-3 reasons with examples.",
          lines: 8,
          points: 50
        }]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 5: Write with a Hook",
    description: "Write an engaging paragraph with a strong hook.",
    subject: "Writing",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Write with a Hook",
      subject: "Writing",
      grade: "5th Grade",
      instructions: "Write a paragraph (8-10 sentences) that starts with an engaging hook. Include: hook, topic sentence, supporting details, and conclusion.",
      totalPoints: 60,
      sections: [{
        title: "Persuasive Writing with Hook",
        questions: [{
          type: "short_answer",
          text: "Should students have more time for recess? Write a persuasive paragraph that starts with an engaging hook, provides 2-3 reasons, and concludes with a strong statement.",
          lines: 10,
          points: 60
        }]
      }]
    }
  },

  // MATH - Spiral review by grade
  {
    id: crypto.randomUUID(),
    title: "Grade 2: Addition and Subtraction Practice",
    description: "Practice addition and subtraction within 20.",
    subject: "Math",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "Addition and Subtraction Practice",
      subject: "Math",
      grade: "2nd Grade",
      instructions: "Solve the addition and subtraction problems.",
      totalPoints: 50,
      sections: [{
        title: "Basic Operations",
        questions: [
          { type: "multiple_choice", text: "8 + 7 = ?", options: ["A. 14", "B. 15", "C. 16", "D. 17"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "15 - 6 = ?", options: ["A. 8", "B. 9", "C. 10", "D. 11"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "12 + ___ = 18", correctAnswer: "6", points: 10 },
          { type: "fill_blank", text: "20 - ___ = 13", correctAnswer: "7", points: 10 },
          { type: "short_answer", text: "Sarah has 9 apples. She gives 4 to her friend. How many apples does she have now?", correctAnswer: "5", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 3: Spiral Review - Multiplication Intro",
    description: "Solve multiplication and addition problems.",
    subject: "Math",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Spiral Review - Multiplication Intro",
      subject: "Math",
      grade: "3rd Grade",
      instructions: "Solve the problems. Remember: multiplication is repeated addition.",
      totalPoints: 50,
      sections: [{
        title: "Multiplication and Addition",
        questions: [
          { type: "multiple_choice", text: "3 × 4 = ?", options: ["A. 10", "B. 12", "C. 14", "D. 16"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "25 + 17 = ?", options: ["A. 40", "B. 41", "C. 42", "D. 43"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "2 × 6 = ___", correctAnswer: "12", points: 10 },
          { type: "fill_blank", text: "5 × 3 = ___", correctAnswer: "15", points: 10 },
          { type: "short_answer", text: "There are 4 groups of 5 pencils. How many pencils are there in total?", correctAnswer: "20", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 4: Spiral Review - Multi-Digit Operations",
    description: "Solve multi-digit multiplication and division problems.",
    subject: "Math",
    targetGradeMin: 4,
    targetGradeMax: 4,
    content: {
      title: "Spiral Review - Multi-Digit Operations",
      subject: "Math",
      grade: "4th Grade",
      instructions: "Solve the multiplication and division problems.",
      totalPoints: 50,
      sections: [{
        title: "Multi-Digit Operations",
        questions: [
          { type: "multiple_choice", text: "12 × 5 = ?", options: ["A. 50", "B. 55", "C. 60", "D. 65"], correctIndex: 2, points: 10 },
          { type: "multiple_choice", text: "48 ÷ 6 = ?", options: ["A. 6", "B. 7", "C. 8", "D. 9"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "7 × 8 = ___", correctAnswer: "56", points: 10 },
          { type: "fill_blank", text: "35 ÷ 5 = ___", correctAnswer: "7", points: 10 },
          { type: "short_answer", text: "A teacher has 24 pencils to distribute equally among 6 students. How many pencils does each student get?", correctAnswer: "4", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 5: Spiral Review - Decimals and Fractions",
    description: "Solve problems with decimals, fractions, and multi-digit operations.",
    subject: "Math",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Spiral Review - Decimals and Fractions",
      subject: "Math",
      grade: "5th Grade",
      instructions: "Solve the problems with decimals, fractions, and operations.",
      totalPoints: 50,
      sections: [{
        title: "Decimals and Fractions",
        questions: [
          { type: "multiple_choice", text: "0.5 + 0.3 = ?", options: ["A. 0.7", "B. 0.8", "C. 0.9", "D. 1.0"], correctIndex: 0, points: 10 },
          { type: "multiple_choice", text: "1/2 + 1/4 = ?", options: ["A. 1/6", "B. 2/6", "C. 3/4", "D. 1/1"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "25 × 12 = ___", correctAnswer: "300", points: 10 },
          { type: "fill_blank", text: "2.5 + 1.75 = ___", correctAnswer: "4.25", points: 10 },
          { type: "short_answer", text: "A recipe calls for 2/3 cup of sugar. If you double the recipe, how much sugar do you need?", correctAnswer: "4/3 or 1 1/3", points: 10 }
        ]
      }]
    }
  },

  // READING - Comprehension by grade
  {
    id: crypto.randomUUID(),
    title: "Grade 2: Reading Comprehension - Simple Passage",
    description: "Read and answer questions about a simple story.",
    subject: "Reading",
    targetGradeMin: 2,
    targetGradeMax: 2,
    content: {
      title: "Reading Comprehension - Simple Passage",
      subject: "Reading",
      grade: "2nd Grade",
      instructions: "Read the story and answer the questions.",
      totalPoints: 40,
      sections: [{
        title: "Story: The Lost Puppy",
        questions: [
          { type: "multiple_choice", text: "What did Tom find?", options: ["A. A kitten", "B. A puppy", "C. A duck", "D. A bird"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "Where did Tom look for the puppy's home?", options: ["A. At the park", "B. At school", "C. Around the neighborhood", "D. At the store"], correctIndex: 2, points: 10 },
          { type: "fill_blank", text: "Tom called the puppy ___.", correctAnswer: "buddy or max or similar pet name", points: 10 },
          { type: "short_answer", text: "How did Tom help the puppy?", correctAnswer: "He fed it or gave it shelter or helped it find its home", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 3: Reading Comprehension - Dragon Story",
    description: "Read a fantasy story and answer comprehension questions.",
    subject: "Reading",
    targetGradeMin: 3,
    targetGradeMax: 3,
    content: {
      title: "Reading Comprehension - Dragon Story",
      subject: "Reading",
      grade: "3rd Grade",
      instructions: "Read the story about a dragon and answer the questions.",
      totalPoints: 50,
      sections: [{
        title: "Story: The Friendly Dragon",
        questions: [
          { type: "multiple_choice", text: "What did the village people think about the dragon at first?", options: ["A. They thought it was friendly", "B. They were afraid of it", "C. They wanted to be friends", "D. They liked it"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "How did the dragon prove it was friendly?", options: ["A. By roaring loudly", "B. By saving the village from a fire", "C. By flying away", "D. By sleeping"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "The dragon lived in a cave in the ___.", correctAnswer: "mountains or hills", points: 10 },
          { type: "short_answer", text: "Why did people stop being afraid of the dragon?", correctAnswer: "It helped them or proved it was kind", points: 10 },
          { type: "short_answer", text: "What is the main idea of this story?", correctAnswer: "Don't judge by appearance or kindness can overcome fear", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 4: Reading Comprehension - Context Clues",
    description: "Read a passage and use context clues to understand vocabulary.",
    subject: "Reading",
    targetGradeMin: 4,
    targetGradeMax: 4,
    content: {
      title: "Reading Comprehension - Context Clues",
      subject: "Reading",
      grade: "4th Grade",
      instructions: "Read the passage. Use context clues to answer the questions.",
      totalPoints: 50,
      sections: [{
        title: "Passage: The Explorer's Journey",
        questions: [
          { type: "multiple_choice", text: "Based on the passage, what does 'traverse' mean?", options: ["A. To stop", "B. To travel across", "C. To rest", "D. To hide"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "What challenged the explorer the most?", options: ["A. The terrain", "B. Lack of supplies", "C. Other explorers", "D. Bad weather"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "The explorer's determination helped him ___ difficulties.", correctAnswer: "overcome or overcome", points: 10 },
          { type: "short_answer", text: "What can you infer about the explorer's character?", correctAnswer: "Brave, determined, or persistent", points: 10 },
          { type: "short_answer", text: "How does the author show that the journey was difficult?", correctAnswer: "By describing the challenges or describing the obstacles", points: 10 }
        ]
      }]
    }
  },
  {
    id: crypto.randomUUID(),
    title: "Grade 5: Reading Comprehension - Character Development",
    description: "Analyze how a character develops throughout a story.",
    subject: "Reading",
    targetGradeMin: 5,
    targetGradeMax: 5,
    content: {
      title: "Reading Comprehension - Character Development",
      subject: "Reading",
      grade: "5th Grade",
      instructions: "Read the passage about character growth and answer the questions.",
      totalPoints: 50,
      sections: [{
        title: "Passage: From Shy to Strong",
        questions: [
          { type: "multiple_choice", text: "How did Maya feel at the beginning of the story?", options: ["A. Confident", "B. Shy and unsure", "C. Angry", "D. Happy"], correctIndex: 1, points: 10 },
          { type: "multiple_choice", text: "What event caused Maya to change?", options: ["A. Moving to a new school", "B. Making a new friend", "C. A school presentation challenge", "D. Joining a sports team"], correctIndex: 1, points: 10 },
          { type: "fill_blank", text: "By the end of the story, Maya became more ___ and ___.","correctAnswer": "confident and brave", points: 10 },
          { type: "short_answer", text: "What lesson did Maya learn from her experience?", correctAnswer: "That facing fears helps you grow or confidence comes from taking risks", points: 10 },
          { type: "short_answer", text: "How would the story be different if Maya had not taken on the challenge?", correctAnswer: "She would still be shy or she wouldn't have grown", points: 10 }
        ]
      }]
    }
  },

  // SEL - Class-wide Growth Mindset
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
  console.log("\n🔧 Rebuilding Star class assignments for Monday 2026-04-20...\n");

  try {
    // Delete existing assignments
    console.log("📁 Deleting existing assignments from Star class...");
    const deleted = deleteStarAssignments();
    console.log(`✅ Deleted ${deleted} existing assignments\n`);

    // Insert new assignments
    console.log("📚 Creating 12 new Monday assignments:\n");
    let created = 0;

    for (const assignment of assignments) {
      if (insertAssignment(assignment)) {
        const gradeRange = assignment.targetGradeMin === assignment.targetGradeMax
          ? `Grade ${assignment.targetGradeMin}`
          : `Grades ${assignment.targetGradeMin}-${assignment.targetGradeMax}`;
        console.log(`✅ ${assignment.title} [${gradeRange}, ${assignment.subject}]`);
        created++;
      }
    }

    console.log(`\n✅ Successfully created ${created} assignments!`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Writing: 4 assignments (Grades 2, 3, 4, 5)`);
    console.log(`   - Math: 4 assignments (Grades 2, 3, 4, 5)`);
    console.log(`   - Reading: 4 assignments (Grades 2, 3, 4, 5)`);
    console.log(`   - SEL: 1 assignment (All grades)`);
    console.log(`   - All scheduled for: 2026-04-20`);
    console.log(`   - All assigned to: Star class`);
    console.log(`\n🧪 Next: Test on live site by logging in as 2nd-grade and 5th-grade students\n`);

  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }

  db.close();
}

main();
