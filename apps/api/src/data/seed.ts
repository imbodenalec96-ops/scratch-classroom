import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const dbPath = process.env.SQLITE_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../../db/scratch.db");
const db = Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

async function seed() {
  console.log("Running schema...");
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../db/schema.sqlite.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  console.log("Seeding users...");
  const hash = await bcrypt.hash("password123", 10);
  const users = [
    { id: "a0000000-0000-0000-0000-000000000001", email: "admin@school.edu", name: "Admin User", role: "admin" },
    { id: "a0000000-0000-0000-0000-000000000002", email: "teacher@school.edu", name: "Jane Teacher", role: "teacher" },
    { id: "a0000000-0000-0000-0000-000000000003", email: "student1@school.edu", name: "Alice Student", role: "student" },
    { id: "a0000000-0000-0000-0000-000000000004", email: "student2@school.edu", name: "Bob Student", role: "student" },
  ];
  const insertUser = db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
  );
  for (const u of users) {
    insertUser.run(u.id, u.email, hash, u.name, u.role);
  }

  console.log("Seeding class...");
  db.prepare(
    `INSERT INTO classes (id, name, teacher_id, code) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
  ).run("b0000000-0000-0000-0000-000000000001", "Intro to Coding", "a0000000-0000-0000-0000-000000000002", "CODE101");

  const insertMember = db.prepare(
    "INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING"
  );
  insertMember.run("a0000000-0000-0000-0000-000000000003", "b0000000-0000-0000-0000-000000000001");
  insertMember.run("a0000000-0000-0000-0000-000000000004", "b0000000-0000-0000-0000-000000000001");

  console.log("Seeding leaderboard...");
  db.prepare(
    `INSERT INTO leaderboard (user_id, points, badges, level) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING`
  ).run("a0000000-0000-0000-0000-000000000003", 120, '["first-project","10-blocks"]', 2);
  db.prepare(
    `INSERT INTO leaderboard (user_id, points, badges, level) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING`
  ).run("a0000000-0000-0000-0000-000000000004", 80, '["first-project"]', 1);

  console.log("Seeding teacher controls...");
  const insertCtrl = db.prepare(
    "INSERT INTO teacher_controls (id, class_id, student_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING"
  );
  insertCtrl.run("tc-001", "b0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000003");
  insertCtrl.run("tc-002", "b0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000004");

  console.log("Seeding sample project...");
  const projectData = JSON.stringify({
    sprites: [{
      id: "sprite-1", name: "Cat", x: 0, y: 0, rotation: 0, scale: 1,
      costumeIndex: 0, costumes: [], sounds: [], visible: true,
      blocks: [
        { id: "b1", type: "event_whenflagclicked", category: "events", inputs: {} },
        { id: "b2", type: "control_forever", category: "control", inputs: {}, parent: "b1" },
        { id: "b3", type: "motion_movesteps", category: "motion", inputs: { STEPS: { type: "value", value: 10 } }, parent: "b2" },
        { id: "b4", type: "motion_turnright", category: "motion", inputs: { DEGREES: { type: "value", value: 15 } }, parent: "b3" },
      ]
    }],
    stage: { width: 480, height: 360, backgroundColor: "#f0f8ff" },
    assets: [],
  });
  db.prepare(
    `INSERT INTO projects (id, user_id, title, mode, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
  ).run("c0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000003", "Spinning Cat", "2d", projectData);

  console.log("Seeding sample assignment...");
  const rubric = JSON.stringify([
    { label: "Uses event blocks", maxPoints: 25 },
    { label: "Uses loops", maxPoints: 25 },
    { label: "Uses motion blocks", maxPoints: 25 },
    { label: "Creative design", maxPoints: 25 },
  ]);
  db.prepare(
    `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
  ).run(
    "d0000000-0000-0000-0000-000000000001",
    "b0000000-0000-0000-0000-000000000001",
    "a0000000-0000-0000-0000-000000000002",
    "Make a Spinning Animation",
    "Create a project that uses loops and motion blocks to animate a sprite.",
    "2026-05-01",
    rubric
  );

  console.log("Seed complete!");
  db.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
