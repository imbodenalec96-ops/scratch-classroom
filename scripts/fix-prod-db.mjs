/**
 * One-shot production DB fix for the Star classroom board.
 *
 * What it does:
 * 1. Find the REAL Star class (code=FXBFPB, teacher=Sean Edison) and its students
 * 2. Set specials_grade on real students by name match
 * 3. Delete the fake seed class (b0000000) and its fake @star.local students
 * 4. Report the final state
 *
 * Run: node scripts/fix-prod-db.mjs
 */

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL =
  "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Known specials grades for the Star roster (by canonical first name)
const SPECIALS_GRADES = {
  ryan:   5,
  jaida:  5,
  kaleb:  5,
  rayden: 4,
  aiden:  3,
  anna:   3,
  zoey:   3,
  // Ameer stays null
};

const FAKE_CLASS_ID = "b0000000-0000-0000-0000-000000000002";

async function run() {
  const client = await pool.connect();
  try {
    console.log("\n=== DIAGNOSTIC ===");

    // 1. Find the real Star class
    const { rows: classes } = await client.query(
      "SELECT c.id, c.name, c.code, u.name AS teacher FROM classes c LEFT JOIN users u ON u.id = c.teacher_id ORDER BY c.created_at ASC"
    );
    console.log("All classes:", JSON.stringify(classes, null, 2));

    const realStarClass = classes.find(c => String(c.code || "").toUpperCase() === "FXBFPB")
      || classes.find(c => String(c.name || "").toLowerCase() === "star" && c.id !== FAKE_CLASS_ID);

    if (!realStarClass) {
      console.error("ERROR: Could not find real Star class by code FXBFPB");
      const starClasses = classes.filter(c => String(c.name || "").toLowerCase() === "star");
      console.log("Star classes found:", starClasses);
      return;
    }
    console.log("\nReal Star class:", realStarClass);

    // 2. List students in real Star class
    const { rows: members } = await client.query(
      `SELECT u.id, u.name, u.email, u.specials_grade
       FROM users u JOIN class_members cm ON cm.user_id = u.id
       WHERE cm.class_id = $1 ORDER BY u.name`,
      [realStarClass.id]
    );
    console.log(`\nStudents in real Star class (${realStarClass.id}):`, members);

    // 3. Also check for the fake class
    const { rows: fakeMembers } = await client.query(
      `SELECT u.id, u.name, u.email FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = $1`,
      [FAKE_CLASS_ID]
    );
    console.log(`\nFake class (${FAKE_CLASS_ID}) members:`, fakeMembers);

    // 4. Check specials_grade column exists
    const { rows: colCheck } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='specials_grade'`
    );
    const hasSpecialsGrade = colCheck.length > 0;
    console.log("\nspecials_grade column exists:", hasSpecialsGrade);

    if (!hasSpecialsGrade) {
      console.log("Adding specials_grade column...");
      await client.query("ALTER TABLE users ADD COLUMN specials_grade INTEGER");
    }

    console.log("\n=== APPLYING FIXES ===");

    // 5. Set specials_grade on real students by first-name match
    let gradeUpdates = 0;
    for (const student of members) {
      const firstName = String(student.name || "").split(/\s+/)[0].toLowerCase();
      if (firstName in SPECIALS_GRADES) {
        const grade = SPECIALS_GRADES[firstName];
        const r = await client.query(
          "UPDATE users SET specials_grade = $1 WHERE id = $2 RETURNING id, name, specials_grade",
          [grade, student.id]
        );
        console.log(`  Set specials_grade=${grade} for ${student.name}:`, r.rows[0]);
        gradeUpdates++;
      }
    }
    console.log(`\nUpdated specials_grade for ${gradeUpdates} students`);

    // 6. Delete fake class members, fake @star.local users, and the fake class
    const { rowCount: fakeUserDel } = await client.query(
      "DELETE FROM class_members WHERE class_id = $1",
      [FAKE_CLASS_ID]
    );
    console.log(`\nDeleted ${fakeUserDel} members from fake class`);

    // Delete the @star.local placeholder users (they should never exist on prod)
    const { rows: fakeUsers } = await client.query(
      "SELECT id, name, email FROM users WHERE email LIKE '%@star.local'"
    );
    if (fakeUsers.length > 0) {
      console.log("Deleting fake @star.local users:", fakeUsers.map(u => u.name));
      await client.query("DELETE FROM class_members WHERE user_id = ANY($1)", [fakeUsers.map(u => u.id)]);
      await client.query("DELETE FROM board_user_data WHERE user_id = ANY($1)", [fakeUsers.map(u => u.id)]).catch(() => {});
      await client.query("DELETE FROM users WHERE email LIKE '%@star.local'");
    }

    // Delete the fake Star class itself
    const { rowCount: fakeClassDel } = await client.query(
      "DELETE FROM classes WHERE id = $1",
      [FAKE_CLASS_ID]
    );
    console.log(`Deleted fake class: ${fakeClassDel} rows`);

    console.log("\n=== FINAL STATE ===");
    const { rows: finalMembers } = await client.query(
      `SELECT u.id, u.name, u.email, u.specials_grade
       FROM users u JOIN class_members cm ON cm.user_id = u.id
       WHERE cm.class_id = $1 ORDER BY u.name`,
      [realStarClass.id]
    );
    console.log(`Students in Star class (${realStarClass.id}):`, finalMembers);

    const { rows: finalClasses } = await client.query(
      "SELECT id, name, code FROM classes ORDER BY created_at ASC"
    );
    console.log("\nAll classes after fix:", finalClasses);

    console.log("\nDone!");
  } catch (e) {
    console.error("Script failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
