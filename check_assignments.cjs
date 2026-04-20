const { Client } = require('pg');
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require" });
client.connect().then(async () => {
  const classes = await client.query("SELECT id, name FROM classes LIMIT 5");
  console.log("Classes:", JSON.stringify(classes.rows));
  const classId = classes.rows[0]?.id;
  const assignments = await client.query(
    "SELECT id, title, target_subject, scheduled_date, due_date FROM assignments WHERE class_id = $1 ORDER BY created_at DESC LIMIT 30",
    [classId]
  );
  console.log(`\nAssignments for class ${classId} (${assignments.rows.length} total):`);
  assignments.rows.forEach(r => console.log(`  ${r.target_subject?.padEnd(10)} | ${r.scheduled_date} | ${r.title?.substring(0,60)}`));
  await client.end();
}).catch(e => { console.error(e.message); process.exit(1); });
