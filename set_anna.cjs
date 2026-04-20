const { Client } = require('pg');
const bcrypt = require('bcrypt');
const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();
  const hash = await bcrypt.hash('Test1234!', 10);
  const r = await c.query(`UPDATE users SET password_hash=$1 WHERE email='anna@gmail.com' RETURNING id, email, name, role`, [hash]);
  console.log('Updated:', r.rows[0]);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
