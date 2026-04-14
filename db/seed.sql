-- Seed demo data
-- Passwords are bcrypt hash of "password123"
-- $2b$10$EpRnTzVlqHgE.HQKXnE1he is a placeholder; real hash set by seed script

INSERT INTO users (id, email, password_hash, name, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@school.edu',   '$HASH', 'Admin User',   'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'teacher@school.edu', '$HASH', 'Jane Teacher',  'teacher'),
  ('a0000000-0000-0000-0000-000000000003', 'student1@school.edu','$HASH', 'Alice Student', 'student'),
  ('a0000000-0000-0000-0000-000000000004', 'student2@school.edu','$HASH', 'Bob Student',   'student')
ON CONFLICT DO NOTHING;

INSERT INTO classes (id, name, teacher_id, code) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Intro to Coding', 'a0000000-0000-0000-0000-000000000002', 'CODE101')
ON CONFLICT DO NOTHING;

INSERT INTO class_members (user_id, class_id) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO leaderboard (user_id, points, badges, level) VALUES
  ('a0000000-0000-0000-0000-000000000003', 120, '["first-project","10-blocks"]', 2),
  ('a0000000-0000-0000-0000-000000000004', 80,  '["first-project"]', 1)
ON CONFLICT DO NOTHING;

INSERT INTO teacher_controls (class_id, student_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
