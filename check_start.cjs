const { Client } = require('pg');
const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';
(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();
  console.log("=== Today's assignments (2026-04-20) for Star ===");
  const rows = await c.query(
    `SELECT id, title, target_subject, target_grade_min, target_grade_max,
            (content IS NULL OR content = '') AS no_content,
            LENGTH(COALESCE(content,'')) AS content_len,
            attached_pdf_path IS NOT NULL AS has_pdf,
            target_student_ids
       FROM assignments
      WHERE class_id=$1 AND scheduled_date='2026-04-20'
      ORDER BY target_subject, target_grade_min`, [CLASS_ID]);
  for (const r of rows.rows) {
    console.log(`  ${r.target_subject} g${r.target_grade_min}-${r.target_grade_max} | ${r.title.slice(0,50)} | content_len=${r.content_len} has_pdf=${r.has_pdf} targeted=${r.target_student_ids || 'all'}`);
  }
  // Grab one math assignment's content to inspect structure
  const math = await c.query(`SELECT id, title, content FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-20' AND target_subject='math' AND target_grade_min IS NULL LIMIT 1`, [CLASS_ID]);
  if (math.rows[0]) {
    console.log("\n=== Sample math assignment content ===");
    console.log("ID:", math.rows[0].id, "Title:", math.rows[0].title);
    const content = math.rows[0].content;
    if (content) {
      try {
        const p = JSON.parse(content);
        console.log("Sections:", p.sections?.length);
        if (p.sections?.[0]) {
          console.log("Section 0 type:", p.sections[0].type, "title:", p.sections[0].title);
          console.log("Questions count:", p.sections[0].questions?.length || 0);
          if (p.sections[0].questions?.[0]) console.log("Q0:", JSON.stringify(p.sections[0].questions[0]).slice(0,200));
        }
      } catch(e) { console.log("Parse failed:", e.message, "\nRaw first 300:", content.slice(0, 300)); }
    }
  }
  // Students in class
  const students = await c.query(`SELECT u.id, u.name, u.role, u.specials_grade FROM users u JOIN class_members cm ON u.id = cm.user_id WHERE cm.class_id=$1 AND u.role='student' ORDER BY u.name LIMIT 5`, [CLASS_ID]);
  console.log("\n=== Sample students ===");
  for (const s of students.rows) console.log(`  ${s.name} (${s.id.slice(0,8)}) grade=${s.specials_grade}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
