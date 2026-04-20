const { Client } = require('pg');
const { randomUUID } = require('crypto');

const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';
const TEACHER_ID_QUERY = "SELECT id FROM users WHERE role = 'teacher' LIMIT 1";

// Existing class-wide assignment IDs to use as per-day defaults
const WIRE = {
  math: {
    Mon: { assignmentId: 'c1044937-0000-0000-0000-000000000000', real: 'c1044937' }, // Multiplication Word Problems
    Tue: { real: 'c1044937' },  // reuse Mon
    Wed: { real: 'c1044937' },  // reuse Mon
    Thu: { real: '99fb47e5' },  // Equivalent Fractions
    Fri: { real: '99fb47e5' },  // reuse Thu
  },
  reading: {
    Mon: { real: 'f9ab825a' },  // The Lost Kitten
    Tue: { real: 'f9ab825a' },  // already wired (bce5ab4e g3-3, use class-wide f9ab825a)
    Wed: { real: 'f9ab825a' },
    Thu: { real: '53439ff9' },  // Saving the Baby Bird
    Fri: { real: '53439ff9' },  // already wired
  },
  writing: {
    Mon: { real: '2ddc1aa5' },  // My Favorite Place
    Tue: { real: '2ddc1aa5' },
    Wed: { real: '2ddc1aa5' },  // already wired (5f450090 g2-2, use class-wide 2ddc1aa5)
    Thu: { real: '2ddc1aa5' },
    Fri: { real: '65cb376b' },  // My Favorite Animal
  },
};

// Spelling assignments to create — 5 days × 3 grade bands
const SPELLING_ASSIGNMENTS = [
  // Monday — CVC & consonant blends
  { date: '2026-04-20', day: 'Mon', gradeMin: null, gradeMax: null, title: 'Spelling — Short Vowel Words', words: ['cat','hat','sit','hop','fun','map','pet','big','cup','run'], hint: 'Use these in sentences.' },
  { date: '2026-04-20', day: 'Mon', gradeMin: 2, gradeMax: 3, title: 'Spelling — Blends & Digraphs', words: ['ship','chain','thick','blend','clock','fresh','strap','shred','print','float'], hint: 'Write each word twice, then in a sentence.' },
  { date: '2026-04-20', day: 'Mon', gradeMin: 4, gradeMax: 5, title: 'Spelling — Prefixes & Suffixes', words: ['preview','rebuild','unhappy','careless','powerful','disorder','impossible','reappear','misplace','hopeful'], hint: 'Circle the prefix or suffix, then define the word.' },
  // Tuesday — word families
  { date: '2026-04-21', day: 'Tue', gradeMin: null, gradeMax: null, title: 'Spelling — Long Vowel Words', words: ['cake','bike','rope','tune','made','kite','home','cute','late','fine'], hint: 'Underline the silent e in each word.' },
  { date: '2026-04-21', day: 'Tue', gradeMin: 2, gradeMax: 3, title: 'Spelling — R-Controlled Vowels', words: ['bird','corn','burn','shirt','storm','curve','sport','fern','torch','purse'], hint: 'Sort: ar, er, ir, or, ur.' },
  { date: '2026-04-21', day: 'Tue', gradeMin: 4, gradeMax: 5, title: 'Spelling — Greek & Latin Roots', words: ['biology','geography','thermometer','telescope','microscope','photograph','telephone','autograph','television','sympathy'], hint: 'Identify the root in each word and its meaning.' },
  // Wednesday — practice & sentences
  { date: '2026-04-22', day: 'Wed', gradeMin: null, gradeMax: null, title: 'Spelling — Sight Words Practice', words: ['they','said','come','some','have','give','live','once','done','gone'], hint: 'Write a silly sentence using at least 3 words.' },
  { date: '2026-04-22', day: 'Wed', gradeMin: 2, gradeMax: 3, title: 'Spelling — Vowel Teams', words: ['rain','wait','play','stay','feet','need','boat','coat','food','soon'], hint: 'Color-code the vowel teams.' },
  { date: '2026-04-22', day: 'Wed', gradeMin: 4, gradeMax: 5, title: 'Spelling — Homophones & Confusing Words', words: ['their','there','they\'re','to','too','two','its','it\'s','your','you\'re'], hint: 'Write a sentence for each pair to show the difference.' },
  // Thursday — challenge words
  { date: '2026-04-23', day: 'Thu', gradeMin: null, gradeMax: null, title: 'Spelling — Plurals (-s & -es)', words: ['cats','boxes','dishes','buses','foxes','hats','dogs','benches','buzzes','fixes'], hint: 'Write the singular form of each word.' },
  { date: '2026-04-23', day: 'Thu', gradeMin: 2, gradeMax: 3, title: 'Spelling — Silent Letters', words: ['knife','write','know','lamb','comb','wrap','sign','gnaw','debt','thumb'], hint: 'Circle the silent letter in each word.' },
  { date: '2026-04-23', day: 'Thu', gradeMin: 4, gradeMax: 5, title: 'Spelling — Words with -tion & -sion', words: ['nation','station','fiction','section','mission','vision','tension','action','caption','explosion'], hint: 'Decide if the ending is -tion or -sion and explain why.' },
  // Friday — review/test
  { date: '2026-04-24', day: 'Fri', gradeMin: null, gradeMax: null, title: 'Spelling Review — Weekly Words', words: ['cat','cake','they','cats','ship'], hint: 'Write each word in alphabetical order, then use each in a sentence.' },
  { date: '2026-04-24', day: 'Fri', gradeMin: 2, gradeMax: 3, title: 'Spelling Review — Weekly Challenge Words', words: ['blend','rain','knife','boxes','bird'], hint: 'Write each word, then draw a picture for two of them.' },
  { date: '2026-04-24', day: 'Fri', gradeMin: 4, gradeMax: 5, title: 'Spelling Review — Weekly Vocabulary Test', words: ['preview','biology','their','nation','impossible'], hint: 'Define each word without looking, then check yourself.' },
];

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  const teacherRow = await client.query(TEACHER_ID_QUERY);
  const teacherId = teacherRow.rows[0].id;
  console.log('Teacher:', teacherId);

  // 1. Insert spelling assignments
  const spellingByDay = {};
  for (const s of SPELLING_ASSIGNMENTS) {
    const id = randomUUID();
    const content = JSON.stringify({
      sections: [{
        type: 'spelling',
        title: s.title,
        words: s.words,
        instructions: s.hint,
        questions: s.words.map((w, i) => ({ id: String(i+1), prompt: `Spell the word: ${w}`, answer: w })),
      }]
    });
    await client.query(
      `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, content, scheduled_date, target_grade_min, target_grade_max, target_subject, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,NULL,'[]',$6,$7,$8,$9,'spelling',15)`,
      [id, CLASS_ID, teacherId, s.title, `Spelling practice: ${s.words.slice(0,3).join(', ')}...`,
       content, s.date, s.gradeMin, s.gradeMax]
    );
    // Track one class-wide (gradeMin=null) per day for wiring
    if (s.gradeMin === null) spellingByDay[s.day] = { assignmentId: id };
    console.log(`  Created spelling: ${s.day} g${s.gradeMin}-${s.gradeMax} → ${s.title}`);
  }

  // 2. Build content_source for math (all 5 days)
  const mathByDay = {
    Mon: { assignmentId: 'c1044937-c1044937' }, // placeholder — will be fixed below
    Tue: { assignmentId: 'c1044937-c1044937' },
    Wed: { assignmentId: 'c1044937-c1044937' },
    Thu: { assignmentId: '99fb47e5-99fb47e5' },
    Fri: { assignmentId: '99fb47e5-99fb47e5' },
  };

  // Get actual full UUIDs
  const mathMon = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-20' AND target_subject='math' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID]);
  const mathMonId = mathMon.rows[0]?.id;
  const mathThu = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-23' AND target_subject='math' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID]);
  const mathThuId = mathThu.rows[0]?.id;

  const mathContent = JSON.stringify({ byDay: {
    Mon: { assignmentId: mathMonId },
    Tue: { assignmentId: mathMonId },
    Wed: { assignmentId: mathMonId },
    Thu: { assignmentId: mathThuId },
    Fri: { assignmentId: mathThuId },
  }});

  // 3. Reading (all 5 days)
  const readMon = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-21' AND target_subject='reading' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID]);
  const readMonId = readMon.rows[0]?.id;
  const readFri = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-24' AND target_subject='reading' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID]);
  const readFriId = readFri.rows[0]?.id;

  const readingContent = JSON.stringify({ byDay: {
    Mon: { assignmentId: readMonId },
    Tue: { assignmentId: readMonId },
    Wed: { assignmentId: readMonId },
    Thu: { assignmentId: readFriId },
    Fri: { assignmentId: readFriId },
  }});

  // 4. Writing (all 5 days)
  const writeMon = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-22' AND target_subject='writing' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID]);
  const writeMonId = writeMon.rows[0]?.id;
  const writeFri = await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-22' AND target_subject='writing' AND target_grade_min IS NULL AND title LIKE '%Animal%' LIMIT 1", [CLASS_ID]);
  const writeFriId = writeFri.rows[0]?.id || writeMonId;

  const writingContent = JSON.stringify({ byDay: {
    Mon: { assignmentId: writeMonId },
    Tue: { assignmentId: writeMonId },
    Wed: { assignmentId: writeMonId },
    Thu: { assignmentId: writeMonId },
    Fri: { assignmentId: writeFriId },
  }});

  // 5. Spelling content (all 5 days)
  const spellingContent = JSON.stringify({ byDay: spellingByDay });

  // Update blocks
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='math'", [mathContent, CLASS_ID]);
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='reading'", [readingContent, CLASS_ID]);
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='writing'", [writingContent, CLASS_ID]);
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='spelling'", [spellingContent, CLASS_ID]);

  console.log('\nMath content_source:', mathContent);
  console.log('Reading content_source:', readingContent);
  console.log('Writing content_source:', writingContent);
  console.log('Spelling byDay days:', Object.keys(spellingByDay).join(','));

  await client.end();
  console.log('\nDone!');
}

run().catch(e => { console.error(e.message); process.exit(1); });
