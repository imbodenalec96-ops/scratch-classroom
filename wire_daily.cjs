const { Client } = require('pg');
const { randomUUID } = require('crypto');

const DB = "postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';

// New math assignments: Tue 04/21, Wed 04/22, Fri 04/24
const NEW_MATH = [
  // Tuesday — place value & addition
  { date: '2026-04-21', title: 'Counting & Number Patterns', gradeMin: null, gradeMax: null,
    qs: [
      { prompt: 'Count by 10s from 30 to 100. Write the numbers.', answer: '30, 40, 50, 60, 70, 80, 90, 100' },
      { prompt: 'What number is 10 more than 45?', answer: '55' },
      { prompt: 'Fill in the blank: 62, 64, ___, 68', answer: '66' },
    ]},
  { date: '2026-04-21', title: 'Addition & Subtraction Review', gradeMin: 2, gradeMax: 3,
    qs: [
      { prompt: 'Solve: 354 + 278 = ?', answer: '632' },
      { prompt: 'Solve: 500 - 163 = ?', answer: '337' },
      { prompt: 'A store had 486 apples. They sold 219. How many are left?', answer: '267' },
    ]},
  { date: '2026-04-21', title: 'Decimals & Place Value', gradeMin: 4, gradeMax: 5,
    qs: [
      { prompt: 'Write 3.47 in expanded form.', answer: '3 + 0.4 + 0.07' },
      { prompt: 'Order from least to greatest: 2.9, 2.09, 2.19', answer: '2.09, 2.19, 2.9' },
      { prompt: 'Round 7.65 to the nearest tenth.', answer: '7.7' },
    ]},

  // Wednesday — geometry & shapes
  { date: '2026-04-22', title: 'Shapes & Sorting', gradeMin: null, gradeMax: null,
    qs: [
      { prompt: 'How many sides does a triangle have?', answer: '3' },
      { prompt: 'Name a shape with 4 equal sides.', answer: 'square' },
      { prompt: 'Draw a circle and a rectangle. Write one difference between them.', answer: 'accept reasonable' },
    ]},
  { date: '2026-04-22', title: 'Perimeter & Area', gradeMin: 2, gradeMax: 3,
    qs: [
      { prompt: 'A rectangle is 6 cm long and 4 cm wide. What is its perimeter?', answer: '20 cm' },
      { prompt: 'A square has a side of 5 cm. What is its area?', answer: '25 sq cm' },
      { prompt: 'A garden is 8 m by 3 m. Find the perimeter and area.', answer: 'P=22 m, A=24 sq m' },
    ]},
  { date: '2026-04-22', title: 'Volume & Surface Area', gradeMin: 4, gradeMax: 5,
    qs: [
      { prompt: 'A box is 5 cm × 4 cm × 3 cm. What is its volume?', answer: '60 cubic cm' },
      { prompt: 'How many unit cubes fit in a box 6 × 2 × 4?', answer: '48' },
      { prompt: 'A rectangular prism has L=7, W=3, H=2. Find the volume.', answer: '42 cubic units' },
    ]},

  // Friday — review & word problems
  { date: '2026-04-24', title: 'Number Sense & Comparison', gradeMin: null, gradeMax: null,
    qs: [
      { prompt: 'Which is greater: 57 or 75? Write >, <, or =.', answer: '57 < 75' },
      { prompt: 'Write the number 32 in words.', answer: 'thirty-two' },
      { prompt: 'Tara has 8 stickers. Ben has 5. How many more does Tara have?', answer: '3' },
    ]},
  { date: '2026-04-24', title: 'Multiplication & Division Facts', gradeMin: 2, gradeMax: 3,
    qs: [
      { prompt: 'Solve: 7 × 8 = ?', answer: '56' },
      { prompt: 'Solve: 63 ÷ 9 = ?', answer: '7' },
      { prompt: 'Write a word problem for 4 × 6.', answer: 'accept reasonable' },
    ]},
  { date: '2026-04-24', title: 'Fractions Review', gradeMin: 4, gradeMax: 5,
    qs: [
      { prompt: 'Add: 2/5 + 3/10 = ?', answer: '7/10' },
      { prompt: 'Subtract: 3/4 - 1/3 = ?', answer: '5/12' },
      { prompt: 'Multiply: 2/3 × 3/4 = ?', answer: '1/2' },
    ]},
];

// New reading assignments: Mon 04/20, Wed 04/22, Thu 04/23
const NEW_READING = [
  // Monday — fiction/adventure
  { date: '2026-04-20', title: 'The Magic Garden — Fiction Story', gradeMin: null, gradeMax: null,
    passage: 'Maya found a secret garden behind her school. Every flower was a different color of the rainbow. She picked one purple flower and put it in her hair. Suddenly, she could fly!',
    qs: [
      { prompt: 'Where did Maya find the garden?', answer: 'behind her school' },
      { prompt: 'What happened when she put the flower in her hair?', answer: 'she could fly' },
      { prompt: 'What is the main idea of this story?', answer: 'a girl finds a magical garden' },
    ]},
  { date: '2026-04-20', title: 'Journey to the Amazon — Nonfiction', gradeMin: 2, gradeMax: 3,
    passage: 'The Amazon rainforest is the world\'s largest tropical rainforest. It covers over 5.5 million square kilometers. More than 10% of all species on Earth live here. Scientists call it the "lungs of the Earth" because its trees produce so much oxygen.',
    qs: [
      { prompt: 'What is the Amazon rainforest?', answer: 'the world\'s largest tropical rainforest' },
      { prompt: 'Why do scientists call it the "lungs of the Earth"?', answer: 'because its trees produce so much oxygen' },
      { prompt: 'What percentage of Earth\'s species live there?', answer: 'more than 10%' },
    ]},
  { date: '2026-04-20', title: 'The Discovery of DNA — Science Text', gradeMin: 4, gradeMax: 5,
    passage: 'In 1953, scientists James Watson and Francis Crick discovered the double helix structure of DNA. This breakthrough changed biology forever. DNA carries the genetic instructions for the growth, development, and reproduction of all living things. Every cell in your body contains approximately 6 feet of DNA, tightly coiled.',
    qs: [
      { prompt: 'When was the double helix structure of DNA discovered?', answer: '1953' },
      { prompt: 'What does DNA carry?', answer: 'genetic instructions for growth, development, and reproduction' },
      { prompt: 'How much DNA is in each cell?', answer: 'approximately 6 feet' },
    ]},

  // Wednesday — poetry/science
  { date: '2026-04-22', title: 'Puddles and Rain — Simple Science Text', gradeMin: null, gradeMax: null,
    passage: 'When it rains, water collects in puddles. The sun makes puddles disappear. The heat turns water into steam, which goes up into the air. This is called evaporation. Later, the steam cools and becomes clouds. Rain falls again. This is the water cycle.',
    qs: [
      { prompt: 'What happens to puddles when the sun shines on them?', answer: 'they disappear / evaporate' },
      { prompt: 'What is evaporation?', answer: 'when heat turns water into steam/vapor' },
      { prompt: 'What is the name of the process described?', answer: 'the water cycle' },
    ]},
  { date: '2026-04-22', title: 'Ancient Egypt — Social Studies Text', gradeMin: 2, gradeMax: 3,
    passage: 'Ancient Egypt was one of the world\'s first great civilizations. It grew along the Nile River, which provided water for farming. The Egyptians built enormous pyramids as tombs for their pharaohs. They also invented a writing system called hieroglyphics, which used pictures as symbols.',
    qs: [
      { prompt: 'Where did Ancient Egypt grow?', answer: 'along the Nile River' },
      { prompt: 'What were the pyramids used for?', answer: 'tombs for pharaohs' },
      { prompt: 'What was the Egyptian writing system called?', answer: 'hieroglyphics' },
    ]},
  { date: '2026-04-22', title: 'Climate Change — Argumentative Text', gradeMin: 4, gradeMax: 5,
    passage: 'Scientists overwhelmingly agree that climate change is caused by human activity, particularly the burning of fossil fuels. Rising temperatures are causing glaciers to melt, sea levels to rise, and weather patterns to become more extreme. Some people argue that natural cycles cause these changes, but 97% of climate scientists disagree with this claim.',
    qs: [
      { prompt: 'What do scientists say causes climate change?', answer: 'human activity / burning fossil fuels' },
      { prompt: 'What are three effects of rising temperatures?', answer: 'glaciers melting, sea levels rising, extreme weather' },
      { prompt: 'What percentage of climate scientists agree on human-caused climate change?', answer: '97%' },
    ]},

  // Thursday — biography/history
  { date: '2026-04-23', title: 'The Brave Firefighter — Community Helpers', gradeMin: null, gradeMax: null,
    passage: 'Firefighters work hard to keep our neighborhoods safe. They rush to fires and rescue people from danger. They also help in car accidents and other emergencies. Firefighters train every day to stay strong and ready. They are true community heroes.',
    qs: [
      { prompt: 'What do firefighters do besides fight fires?', answer: 'help in car accidents and emergencies' },
      { prompt: 'Why do firefighters train every day?', answer: 'to stay strong and ready' },
      { prompt: 'What is the main idea of this passage?', answer: 'firefighters are community heroes / keep us safe' },
    ]},
  { date: '2026-04-23', title: 'Rosa Parks — Biography', gradeMin: 2, gradeMax: 3,
    passage: 'Rosa Parks was an African American civil rights activist. On December 1, 1955, she refused to give up her seat on a Montgomery bus to a white passenger. Her arrest sparked the Montgomery Bus Boycott, a 381-day protest where Black residents refused to ride city buses. Her bravery helped end segregation on public transportation.',
    qs: [
      { prompt: 'What did Rosa Parks refuse to do?', answer: 'give up her seat on a bus' },
      { prompt: 'How long did the Montgomery Bus Boycott last?', answer: '381 days' },
      { prompt: 'What was the result of the boycott?', answer: 'helped end segregation on public transportation' },
    ]},
  { date: '2026-04-23', title: 'The American Revolution — Historical Text', gradeMin: 4, gradeMax: 5,
    passage: 'The American Revolution (1775–1783) was a political uprising in which thirteen American colonies broke free from British rule. The colonists were frustrated by taxation without representation in Parliament. Key figures included George Washington, Benjamin Franklin, and Thomas Jefferson. The Declaration of Independence, signed in 1776, announced the colonies\' separation from Britain.',
    qs: [
      { prompt: 'What years did the American Revolution take place?', answer: '1775–1783' },
      { prompt: 'What frustrated the colonists?', answer: 'taxation without representation' },
      { prompt: 'What did the Declaration of Independence announce?', answer: 'the colonies\' separation from Britain' },
    ]},
];

function makeContent(title, qs, passage) {
  const sections = [];
  if (passage) sections.push({ type: 'passage', title, text: passage });
  sections.push({
    type: 'questions',
    title: 'Comprehension Questions',
    questions: qs.map((q, i) => ({ id: String(i+1), prompt: q.prompt, answer: q.answer })),
  });
  return JSON.stringify({ sections });
}

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  const teacherRow = await client.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
  const teacherId = teacherRow.rows[0].id;

  // Insert new math assignments
  const mathIds = {}; // date → class-wide id
  for (const a of NEW_MATH) {
    const id = randomUUID();
    const content = makeContent(a.title, a.qs);
    await client.query(
      `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, content, scheduled_date, target_grade_min, target_grade_max, target_subject, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,NULL,'[]',$6,$7,$8,$9,'math',20)`,
      [id, CLASS_ID, teacherId, a.title, a.title, content, a.date, a.gradeMin, a.gradeMax]
    );
    if (a.gradeMin === null) mathIds[a.date] = id;
    console.log(`Math ${a.date} g${a.gradeMin}-${a.gradeMax}: ${a.title}`);
  }

  // Insert new reading assignments
  const readIds = {};
  for (const a of NEW_READING) {
    const id = randomUUID();
    const content = makeContent(a.title, a.qs, a.passage);
    await client.query(
      `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, content, scheduled_date, target_grade_min, target_grade_max, target_subject, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,NULL,'[]',$6,$7,$8,$9,'reading',20)`,
      [id, CLASS_ID, teacherId, a.title, a.title, content, a.date, a.gradeMin, a.gradeMax]
    );
    if (a.gradeMin === null) readIds[a.date] = id;
    console.log(`Reading ${a.date} g${a.gradeMin}-${a.gradeMax}: ${a.title}`);
  }

  // Get existing math class-wide IDs
  const m20 = (await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-20' AND target_subject='math' AND target_grade_min IS NULL ORDER BY created_at LIMIT 1", [CLASS_ID])).rows[0]?.id;
  const m23 = (await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-23' AND target_subject='math' AND target_grade_min IS NULL ORDER BY created_at LIMIT 1", [CLASS_ID])).rows[0]?.id;
  // Get existing reading class-wide IDs
  const r21 = (await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-21' AND target_subject='reading' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID])).rows[0]?.id;
  const r24 = (await client.query("SELECT id FROM assignments WHERE class_id=$1 AND scheduled_date='2026-04-24' AND target_subject='reading' AND target_grade_min IS NULL LIMIT 1", [CLASS_ID])).rows[0]?.id;

  // Math content_source: Mon=04/20, Tue=04/21, Wed=04/22, Thu=04/23, Fri=04/24
  const mathCS = JSON.stringify({ byDay: {
    Mon: { assignmentId: m20 },
    Tue: { assignmentId: mathIds['2026-04-21'] },
    Wed: { assignmentId: mathIds['2026-04-22'] },
    Thu: { assignmentId: m23 },
    Fri: { assignmentId: mathIds['2026-04-24'] },
  }});

  // Reading content_source: Mon=04/20, Tue=04/21, Wed=04/22, Thu=04/23, Fri=04/24
  const readCS = JSON.stringify({ byDay: {
    Mon: { assignmentId: readIds['2026-04-20'] },
    Tue: { assignmentId: r21 },
    Wed: { assignmentId: readIds['2026-04-22'] },
    Thu: { assignmentId: readIds['2026-04-23'] },
    Fri: { assignmentId: r24 },
  }});

  // Writing: spread 5 existing writing assignments across 5 days
  const writingIds = (await client.query(
    "SELECT id FROM assignments WHERE class_id=$1 AND target_subject='writing' ORDER BY created_at",
    [CLASS_ID]
  )).rows.map(r => r.id);
  const writeCS = JSON.stringify({ byDay: {
    Mon: { assignmentId: writingIds[0] },
    Tue: { assignmentId: writingIds[1] },
    Wed: { assignmentId: writingIds[2] },
    Thu: { assignmentId: writingIds[3] },
    Fri: { assignmentId: writingIds[4] || writingIds[3] },
  }});

  // Update schedule
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='math'", [mathCS, CLASS_ID]);
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='reading'", [readCS, CLASS_ID]);
  await client.query("UPDATE class_schedule SET content_source=$1 WHERE class_id=$2 AND subject='writing'", [writeCS, CLASS_ID]);

  console.log('\nMath wiring:', Object.entries(JSON.parse(mathCS).byDay).map(([d,v]) => `${d}:${v.assignmentId?.slice(0,8)}`).join(', '));
  console.log('Reading wiring:', Object.entries(JSON.parse(readCS).byDay).map(([d,v]) => `${d}:${v.assignmentId?.slice(0,8)}`).join(', '));
  console.log('Writing wiring (', writingIds.length, 'assignments ):', Object.entries(JSON.parse(writeCS).byDay).map(([d,v]) => `${d}:${v.assignmentId?.slice(0,8)}`).join(', '));

  await client.end();
  console.log('\nDone — each subject now has a unique assignment per day.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
