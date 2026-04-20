const { Client } = require('pg');
const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';
(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();
  const blocks = await c.query("SELECT id, block_number, start_time, end_time, label, subject, active_days, content_source FROM class_schedule WHERE class_id=$1 AND subject='math' ORDER BY block_number", [CLASS_ID]);
  console.log("MATH BLOCKS for Star:");
  for (const b of blocks.rows) {
    console.log(`  #${b.block_number} ${b.start_time}-${b.end_time} ${b.label} days=${b.active_days}`);
    console.log(`    content_source: ${b.content_source}`);
  }
  // Resolve today's assignment id
  const cs = blocks.rows[0]?.content_source;
  if (cs) {
    try {
      const p = JSON.parse(cs);
      const monId = p.byDay?.Mon?.assignmentId;
      console.log(`\nResolved Mon assignmentId: ${monId}`);
      if (monId) {
        const a = await c.query("SELECT id, title, class_id, scheduled_date, target_subject, target_grade_min FROM assignments WHERE id=$1", [monId]);
        console.log(`  Assignment row:`, a.rows[0] || '(NOT FOUND)');
      }
    } catch(e) { console.log('parse err', e.message); }
  }
  // Also list all math assignments scheduled for today in this class
  const all = await c.query("SELECT id, title, target_grade_min, target_grade_max FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-20' AND target_subject='math'", [CLASS_ID]);
  console.log(`\nAll math assignments scheduled for 2026-04-20:`);
  for (const a of all.rows) console.log(`  ${a.id} | ${a.title} | grade ${a.target_grade_min}-${a.target_grade_max}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
