const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require' });

async function main() {
  await client.connect();

  // Check existing SEL entries
  const sel = await client.query(`
    SELECT id, title, scheduled_date, content, video_url
    FROM assignments
    WHERE class_id = '0a635d79-4028-480c-8240-652a67bd973d'
      AND target_subject = 'sel'
    ORDER BY scheduled_date
  `);
  console.log('Existing SEL:', JSON.stringify(sel.rows, null, 2));

  // Get teacher id
  const teacher = await client.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
  console.log('Teacher:', teacher.rows);

  // Check for Ameer
  const ameer = await client.query("SELECT id, name, role FROM users WHERE name ILIKE '%ameer%' OR name ILIKE '%amaar%'");
  console.log('Ameer/Amaar users:', ameer.rows);

  // Check class_schedule table
  const schedCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'class_schedule' ORDER BY ordinal_position`);
  console.log('class_schedule columns:', schedCols.rows.map(r => r.column_name));

  const sched = await client.query(`SELECT * FROM class_schedule WHERE class_id = '0a635d79-4028-480c-8240-652a67bd973d'`);
  console.log('class_schedule rows:', JSON.stringify(sched.rows, null, 2));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
