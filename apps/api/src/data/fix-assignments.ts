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

// Get or create teacher user for seeding
function getTeacherId(): string {
  try {
    const teacher = db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get() as any;
    if (teacher?.id) return teacher.id;
  } catch {}
  // Create a seed teacher if none exists
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO users (id, email, name, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, `teacher_${Date.now()}@example.com`, "Seed Teacher", "teacher", now);
    return id;
  } catch {
    return "";
  }
}

// Get or create student class
function getClassId(teacherId: string): string {
  try {
    const cls = db.prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacherId) as any;
    if (cls?.id) return cls.id;
  } catch {}

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO classes (id, teacher_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, teacherId, "Seed Class", now);
    return id;
  } catch {
    return "";
  }
}

// Create or fix spelling assignments
function fixSpellingAssignments(classId: string, teacherId: string) {
  console.log("Creating/fixing spelling assignments...");

  const spellingContent = {
    title: "Spelling Practice",
    subject: "Spelling",
    grade: "3rd Grade",
    instructions: "Choose the correctly spelled word for each sentence.",
    totalPoints: 50,
    sections: [
      {
        title: "Part 1: Spelling Words (5 pts each)",
        questions: [
          {
            type: "multiple_choice",
            text: "Which word is spelled correctly?",
            options: ["A. recieve", "B. receive", "C. recieve", "D. receieve"],
            correctIndex: 1,
            points: 5
          },
          {
            type: "multiple_choice",
            text: "How do you spell the word for a large cat?",
            options: ["A. lion", "B. lioin", "C. lion", "D. lyion"],
            correctIndex: 2,
            points: 5
          },
          {
            type: "multiple_choice",
            text: "Which is the correct spelling of the opposite of 'small'?",
            options: ["A. laarge", "B. large", "C. larg", "D. lerge"],
            correctIndex: 1,
            points: 5
          },
          {
            type: "multiple_choice",
            text: "How do you spell the word for a tree that loses leaves in fall?",
            options: ["A. deceduous", "B. diciduous", "C. deciduous", "D. deciuous"],
            correctIndex: 2,
            points: 5
          },
          {
            type: "multiple_choice",
            text: "Which spelling is correct for a person who teaches?",
            options: ["A. techer", "B. teacher", "C. techer", "D. teecher"],
            correctIndex: 1,
            points: 5
          },
          {
            type: "fill_blank",
            text: "The correct spelling is: h_ppy",
            correctAnswer: "a",
            points: 5
          },
          {
            type: "fill_blank",
            text: "Fill in the missing letter: bea_tiful",
            correctAnswer: "u",
            points: 5
          },
          {
            type: "fill_blank",
            text: "Complete the word: separat_",
            correctAnswer: "e",
            points: 5
          },
          {
            type: "short_answer",
            text: "Write the correct spelling of 'aknoledge':",
            correctAnswer: "acknowledge",
            points: 5
          },
          {
            type: "short_answer",
            text: "Write the correct spelling of 'occation':",
            correctAnswer: "occasion",
            points: 5
          }
        ]
      }
    ]
  };

  const contentStr = JSON.stringify(spellingContent);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Check if spelling assignment exists
  try {
    const existing = db.prepare(
      "SELECT id FROM assignments WHERE class_id = ? AND target_subject = 'spelling' LIMIT 1"
    ).get(classId) as any;

    if (existing?.id) {
      // Update existing
      db.prepare(
        "UPDATE assignments SET content = ?, updated_at = ? WHERE id = ?"
      ).run(contentStr, now, existing.id);
      console.log(`✓ Fixed existing spelling assignment: ${existing.id}`);
    } else {
      // Create new
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO assignments (
          id, class_id, teacher_id, title, description, content,
          target_subject, target_grade_min, target_grade_max,
          scheduled_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, classId, teacherId, "Spelling Practice", "Practice spelling common words",
        contentStr, "spelling", 2, 4, today, now
      );
      console.log(`✓ Created new spelling assignment: ${id}`);
    }
  } catch (e) {
    console.error("Error fixing spelling assignments:", e);
  }
}

// Create easier fraction assignments (lower grade target)
function fixFractionAssignments(classId: string, teacherId: string) {
  console.log("Creating easier fraction assignments...");

  const fractionContent = {
    title: "Fractions - Basic Concepts",
    subject: "Math",
    grade: "3rd Grade",
    instructions: "Answer questions about basic fractions. Use the pictures to help.",
    totalPoints: 100,
    sections: [
      {
        title: "Part 1: Identifying Fractions (10 pts each)",
        questions: [
          {
            type: "multiple_choice",
            text: "If a pizza is cut into 4 pieces and you eat 1 piece, what fraction did you eat?",
            options: ["A. 1/2", "B. 1/4", "C. 1/3", "D. 2/4"],
            correctIndex: 1,
            points: 10
          },
          {
            type: "multiple_choice",
            text: "If a chocolate bar has 3 sections and you eat 1, what fraction is left?",
            options: ["A. 1/3", "B. 2/3", "C. 1/2", "D. 3/4"],
            correctIndex: 1,
            points: 10
          },
          {
            type: "multiple_choice",
            text: "One half is the same as:",
            options: ["A. 1/3", "B. 1/4", "C. 2/4", "D. 3/5"],
            correctIndex: 2,
            points: 10
          },
          {
            type: "fill_blank",
            text: "An apple is cut into 2 equal pieces. Each piece is 1/__ of the apple.",
            correctAnswer: "2",
            points: 10
          },
          {
            type: "fill_blank",
            text: "3/4 means 3 out of __ equal parts.",
            correctAnswer: "4",
            points: 10
          },
          {
            type: "short_answer",
            text: "If you have 6 crayons and 2 are red, what fraction are red? (Write as a simple fraction)",
            correctAnswer: "1/3",
            points: 10
          },
          {
            type: "short_answer",
            text: "If you share a cookie equally with one friend, what fraction does each person get?",
            correctAnswer: "1/2",
            points: 10
          },
          {
            type: "short_answer",
            text: "A rope is divided into 5 equal parts. If you use 2 parts, what fraction do you use?",
            correctAnswer: "2/5",
            points: 10
          },
          {
            type: "multiple_choice",
            text: "Which fraction is the biggest?",
            options: ["A. 1/4", "B. 1/2", "C. 1/8", "D. 1/6"],
            correctIndex: 1,
            points: 10
          },
          {
            type: "multiple_choice",
            text: "Which fraction is the smallest?",
            options: ["A. 1/2", "B. 1/3", "C. 1/4", "D. 1/5"],
            correctIndex: 3,
            points: 10
          }
        ]
      }
    ]
  };

  const contentStr = JSON.stringify(fractionContent);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Check if fraction assignment exists
  try {
    const existing = db.prepare(
      "SELECT id FROM assignments WHERE class_id = ? AND target_subject = 'math' AND title LIKE '%Fraction%' LIMIT 1"
    ).get(classId) as any;

    if (existing?.id) {
      // Update existing - set to lower grade (2-3 instead of 4-5)
      db.prepare(
        "UPDATE assignments SET content = ?, target_grade_min = ?, target_grade_max = ?, updated_at = ? WHERE id = ?"
      ).run(contentStr, 2, 3, now, existing.id);
      console.log(`✓ Fixed existing fraction assignment: ${existing.id}`);
    } else {
      // Create new
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO assignments (
          id, class_id, teacher_id, title, description, content,
          target_subject, target_grade_min, target_grade_max,
          scheduled_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, classId, teacherId, "Fractions - Basic Concepts", "Learn basic fractions with examples",
        contentStr, "math", 2, 3, today, now
      );
      console.log(`✓ Created new fraction assignment: ${id}`);
    }
  } catch (e) {
    console.error("Error fixing fraction assignments:", e);
  }
}

// Create additional assignments for variety
function createAdditionalAssignments(classId: string, teacherId: string) {
  console.log("Creating additional assignments...");

  const additionalAssignments = [
    {
      title: "Reading Comprehension - Adventure Story",
      subject: "Reading",
      grade: "3rd Grade",
      targetGradeMin: 2,
      targetGradeMax: 4,
      content: {
        title: "Adventure in the Forest",
        subject: "Reading",
        grade: "3rd Grade",
        instructions: "Read the story and answer the questions.",
        totalPoints: 80,
        sections: [
          {
            title: "Story & Comprehension",
            questions: [
              {
                type: "multiple_choice",
                text: "What was the main character's biggest challenge?",
                options: ["A. Finding food", "B. Finding the way home", "C. Making friends", "D. Building a shelter"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "multiple_choice",
                text: "How did the story end?",
                options: ["A. Sadly", "B. Happily", "C. Mysteriously", "D. Confusingly"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "short_answer",
                text: "What did you like most about the story?",
                points: 10
              },
              {
                type: "fill_blank",
                text: "The forest was dark and ____.",
                points: 10
              },
              {
                type: "multiple_choice",
                text: "What lesson did the character learn?",
                options: ["A. Teamwork is important", "B. Nature is scary", "C. Adventures are boring", "D. Maps don't help"],
                correctIndex: 0,
                points: 10
              },
              {
                type: "fill_blank",
                text: "The character used a ____ to find the way home.",
                points: 10
              },
              {
                type: "short_answer",
                text: "Would you like to go on an adventure like this? Why?",
                points: 10
              },
              {
                type: "fill_blank",
                text: "The story takes place in the ____ at night.",
                points: 10
              }
            ]
          }
        ]
      }
    },
    {
      title: "Grammar Practice - Verbs and Adjectives",
      subject: "Writing",
      grade: "3rd Grade",
      targetGradeMin: 2,
      targetGradeMax: 4,
      content: {
        title: "Grammar Practice",
        subject: "Writing",
        grade: "3rd Grade",
        instructions: "Answer questions about grammar and sentence structure.",
        totalPoints: 80,
        sections: [
          {
            title: "Verbs and Adjectives",
            questions: [
              {
                type: "multiple_choice",
                text: "Which word is a verb?",
                options: ["A. beautiful", "B. run", "C. happy", "D. blue"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "multiple_choice",
                text: "Which word is an adjective?",
                options: ["A. jump", "B. big", "C. walk", "D. eat"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "fill_blank",
                text: "The ____ dog barked loudly.",
                correctAnswer: "happy",
                points: 10
              },
              {
                type: "fill_blank",
                text: "She ____ to school every day.",
                correctAnswer: "walks",
                points: 10
              },
              {
                type: "multiple_choice",
                text: "Choose the sentence with correct subject-verb agreement:",
                options: ["A. He run fast", "B. He runs fast", "C. He are running", "D. He do run"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "short_answer",
                text: "Write a sentence using the verb 'play':",
                points: 10
              },
              {
                type: "short_answer",
                text: "Write a sentence using the adjective 'colorful':",
                points: 10
              },
              {
                type: "fill_blank",
                text: "The ____ sun was shining.",
                correctAnswer: "bright",
                points: 10
              }
            ]
          }
        ]
      }
    },
    {
      title: "Science - Plants and Flowers",
      subject: "Reading",
      grade: "3rd Grade",
      targetGradeMin: 2,
      targetGradeMax: 4,
      content: {
        title: "Plants and Flowers",
        subject: "Science",
        grade: "3rd Grade",
        instructions: "Learn about how plants grow and flowers bloom.",
        totalPoints: 80,
        sections: [
          {
            title: "Plant Growth",
            questions: [
              {
                type: "multiple_choice",
                text: "What do plants need to grow?",
                options: ["A. Only water", "B. Only sunlight", "C. Water, sunlight, and soil", "D. Only soil"],
                correctIndex: 2,
                points: 10
              },
              {
                type: "multiple_choice",
                text: "Where do plants get their food?",
                options: ["A. From soil only", "B. From sunlight using their leaves", "C. From water only", "D. From air"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "fill_blank",
                text: "Plants need ____ to make food.",
                correctAnswer: "sunlight",
                points: 10
              },
              {
                type: "multiple_choice",
                text: "What part of the plant takes in water?",
                options: ["A. Leaves", "B. Roots", "C. Stem", "D. Flowers"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "fill_blank",
                text: "The ____ carry water from the roots to the rest of the plant.",
                correctAnswer: "stem",
                points: 10
              },
              {
                type: "short_answer",
                text: "Why are flowers important to plants?",
                points: 10
              },
              {
                type: "multiple_choice",
                text: "Which flower grows from a bulb?",
                options: ["A. Rose", "B. Tulip", "C. Daisy", "D. Sunflower"],
                correctIndex: 1,
                points: 10
              },
              {
                type: "short_answer",
                text: "How can you help a plant grow healthy?",
                points: 10
              }
            ]
          }
        ]
      }
    }
  ];

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  for (const asgn of additionalAssignments) {
    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO assignments (
          id, class_id, teacher_id, title, description, content,
          target_subject, target_grade_min, target_grade_max,
          scheduled_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, classId, teacherId, asgn.title, asgn.title,
        JSON.stringify(asgn.content), asgn.subject.toLowerCase(),
        asgn.targetGradeMin, asgn.targetGradeMax, today, now
      );
      console.log(`✓ Created assignment: ${asgn.title}`);
    } catch (e) {
      console.error(`Error creating ${asgn.title}:`, e);
    }
  }
}

async function main() {
  console.log("\n🔧 Fixing Thign assignments...\n");

  try {
    const teacherId = getTeacherId();
    if (!teacherId) {
      console.error("Could not find or create teacher");
      process.exit(1);
    }
    console.log(`✓ Using teacher: ${teacherId}`);

    const classId = getClassId(teacherId);
    if (!classId) {
      console.error("Could not find or create class");
      process.exit(1);
    }
    console.log(`✓ Using class: ${classId}\n`);

    fixSpellingAssignments(classId, teacherId);
    fixFractionAssignments(classId, teacherId);
    createAdditionalAssignments(classId, teacherId);

    console.log("\n✅ Done! All assignments have been created/updated.");
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }

  db.close();
}

main();
