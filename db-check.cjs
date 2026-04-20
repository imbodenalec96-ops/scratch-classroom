const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  await client.connect();

  // Check for Amaar
  console.log('\n--- Users with name ILIKE Amaar ---');
  const amaar = await client.query("SELECT id, name, role FROM users WHERE name ILIKE '%amaar%'");
  console.log(amaar.rows);

  // Check assignments for the week
  console.log('\n--- Existing assignments for class 0a635d79 week of 4/20-4/24 ---');
  const assignments = await client.query(`
    SELECT id, title, target_subject, scheduled_date, target_grade_min, target_grade_max
    FROM assignments
    WHERE class_id = '0a635d79-4028-480c-8240-652a67bd973d'
      AND scheduled_date >= '2026-04-20'
      AND scheduled_date <= '2026-04-24'
    ORDER BY scheduled_date, target_subject
  `);
  console.log(JSON.stringify(assignments.rows, null, 2));

  // Check assignments table columns
  console.log('\n--- assignments table columns ---');
  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'assignments'
    ORDER BY ordinal_position
  `);
  console.log(cols.rows);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
