const { Client } = require('pg');
const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';
(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();
  const r = await c.query(`SELECT u.id, u.email, u.name FROM users u JOIN class_members cm ON u.id=cm.user_id WHERE cm.class_id=$1 AND u.role='student' ORDER BY u.name LIMIT 3`, [CLASS_ID]);
  for (const s of r.rows) console.log(`${s.name} | ${s.email} | ${s.id}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
