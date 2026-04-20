const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_zytaKih7Mc4O@ep-curly-poetry-akxmmkg7.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'
});

const TEACHER_ID = 'fc03e110-b33f-4bf2-975c-d3c0b8b454f8';
const CLASS_ID = '0a635d79-4028-480c-8240-652a67bd973d';
const SEL_SCHEDULE_ID = '18a91b90-7286-4d74-8c08-8e193115b9e2';

async function main() {
  await client.connect();

  // Insert Tue 4/21 SEL — Empathy (ClassDojo)
  const tueSEL = await client.query(`
    INSERT INTO assignments (
      class_id, teacher_id, title, target_subject, scheduled_date,
      content, video_url, description, estimated_minutes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, title, scheduled_date
  `, [
    CLASS_ID,
    TEACHER_ID,
    'Empathy — Understanding Others\' Feelings',
    'sel',
    '2026-04-21',
    JSON.stringify({
      title: "Empathy — Understanding Others' Feelings",
      subject: 'SEL',
      grade: 'All Grades',
      instructions: 'Watch the video about empathy. Then answer the questions below. Think carefully about how you treat others.',
      totalPoints: 12,
      sections: [{
        title: 'After the Video',
        questions: [
          {
            type: 'short_answer',
            text: 'What is empathy in your own words?',
            correctAnswer: 'Personal definition — accept any answer that conveys understanding how others feel',
            points: 4,
            lines: 3
          },
          {
            type: 'short_answer',
            text: 'Describe a time when someone showed empathy toward you. How did it make you feel?',
            correctAnswer: 'Personal reflection — accept any genuine answer',
            points: 4,
            lines: 3
          },
          {
            type: 'short_answer',
            text: 'What is one way you can show empathy to a classmate today?',
            correctAnswer: 'Personal reflection — accept any specific, actionable answer',
            points: 4,
            lines: 2
          }
        ]
      }]
    }),
    'https://www.youtube.com/watch?v=ENIB2H3S_oQ',
    'ClassDojo Empathy video + reflection questions. Discussion: What is empathy? Share a time someone showed you empathy. One way to show empathy today.',
    20
  ]);
  console.log('Inserted Tue SEL:', tueSEL.rows[0]);

  // Insert Thu 4/24 SEL — Belly Breathe (Sesame Street)
  const thuSEL = await client.query(`
    INSERT INTO assignments (
      class_id, teacher_id, title, target_subject, scheduled_date,
      content, video_url, description, estimated_minutes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, title, scheduled_date
  `, [
    CLASS_ID,
    TEACHER_ID,
    'Belly Breathing — Calming My Body & Mind',
    'sel',
    '2026-04-23',
    JSON.stringify({
      title: 'Belly Breathing — Calming My Body & Mind',
      subject: 'SEL',
      grade: 'All Grades',
      instructions: 'Watch the Belly Breathe video with Elmo, Common, and Colbie Caillat. Then try the breathing yourself and answer the questions.',
      totalPoints: 12,
      sections: [{
        title: 'Reflection',
        questions: [
          {
            type: 'short_answer',
            text: 'When would belly breathing be helpful? Give a specific example from school or home.',
            correctAnswer: 'Personal reflection — accept any relevant scenario (e.g., before a test, when angry)',
            points: 4,
            lines: 3
          },
          {
            type: 'short_answer',
            text: 'What does your body feel like after belly breathing? Describe at least two things.',
            correctAnswer: 'Personal reflection — accept answers describing calmness, slower heartbeat, relaxed muscles, etc.',
            points: 4,
            lines: 3
          },
          {
            type: 'short_answer',
            text: 'Who could you teach belly breathing to, and why would it help them?',
            correctAnswer: 'Personal reflection — accept any thoughtful answer naming a person and reason',
            points: 4,
            lines: 2
          }
        ]
      }]
    }),
    'https://www.youtube.com/watch?v=_mZbzDOpylA',
    'Sesame Street "Belly Breathe" with Elmo, Common & Colbie Caillat. Discussion: When would you use belly breathing? What does your body feel like after? Who could you teach this to?',
    15
  ]);
  console.log('Inserted Thu SEL:', thuSEL.rows[0]);

  const tueSELId = tueSEL.rows[0].id;
  const thuSELId = thuSEL.rows[0].id;

  // Update the class_schedule SEL block's content_source to include Tue and Thu
  const updatedContentSource = {
    byDay: {
      Mon: {
        videoUrl: 'https://www.youtube.com/watch?v=p3zyMPwfzhA',
        assignmentId: '34f9e542-ce56-4d7b-a719-eefab0e0e067'
      },
      Tue: {
        videoUrl: 'https://www.youtube.com/watch?v=ENIB2H3S_oQ',
        assignmentId: tueSELId
      },
      Wed: {
        videoUrl: 'https://www.youtube.com/watch?v=2zrtHt3bBmQ',
        assignmentId: '3d6f8a18-5c4f-4974-be20-02e5fa0874d3'
      },
      Thu: {
        videoUrl: 'https://www.youtube.com/watch?v=_mZbzDOpylA',
        assignmentId: thuSELId
      },
      Fri: {
        videoUrl: 'https://www.youtube.com/watch?v=Itp21tly8nM',
        assignmentId: '59ba05ab-80cc-4957-a85a-ee82fac12f22'
      }
    }
  };

  await client.query(`
    UPDATE class_schedule
    SET content_source = $1
    WHERE id = $2
  `, [JSON.stringify(updatedContentSource), SEL_SCHEDULE_ID]);
  console.log('Updated class_schedule SEL block content_source');
  console.log('New content_source:', JSON.stringify(updatedContentSource, null, 2));

  // Final verify
  const verify = await client.query(`
    SELECT id, title, scheduled_date, video_url
    FROM assignments
    WHERE class_id = $1 AND target_subject = 'sel'
    ORDER BY scheduled_date
  `, [CLASS_ID]);
  console.log('\nAll SEL assignments now:', JSON.stringify(verify.rows, null, 2));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
