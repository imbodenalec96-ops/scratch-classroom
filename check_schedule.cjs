const { Client } = require('pg');
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require" });
client.connect().then(async () => {
  const r = await client.query(
    "SELECT block_number, subject, label, active_days, content_source FROM class_schedule WHERE subject IN ('math','reading','writing','spelling','sel') ORDER BY block_number"
  );
  r.rows.forEach(b => {
    const cs = b.content_source ? JSON.parse(b.content_source) : null;
    const days = cs?.byDay ? Object.keys(cs.byDay) : [];
    console.log(`Block ${b.block_number}: ${b.subject} | active_days: ${b.active_days} | wired days: [${days.join(',')}]`);
    if (cs?.byDay) {
      Object.entries(cs.byDay).forEach(([d, v]) => {
        console.log(`  ${d}: ${JSON.stringify(v)}`);
      });
    }
  });
  await client.end();
}).catch(e => console.error(e.message));
