-- Scratch Classroom Platform – SQLite Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  teacher_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_members (
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, class_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '2d' CHECK (mode IN ('2d','3d')),
  data TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  rubric TEXT DEFAULT '[]',
  starter_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  submitted_at TEXT DEFAULT (datetime('now')),
  grade REAL,
  feedback TEXT,
  auto_grade_result TEXT
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  answers TEXT NOT NULL DEFAULT '[]',
  score REAL NOT NULL DEFAULT 0,
  submitted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  time_spent INTEGER DEFAULT 0,
  blocks_used INTEGER DEFAULT 0,
  errors_made INTEGER DEFAULT 0,
  last_active TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  present INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS behavior_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('warning','positive','note')),
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaderboard (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0,
  badges TEXT DEFAULT '[]',
  level INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS teacher_controls (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ai_enabled INTEGER DEFAULT 1,
  ai_prompt_limit INTEGER DEFAULT 50,
  blocks_disabled TEXT DEFAULT '[]',
  editing_locked INTEGER DEFAULT 0,
  screen_locked INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_chat_class ON chat_messages(class_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics(user_id);

-- ═══════════════ Student Dashboard & Break System Extension ═══════════════

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL DEFAULT '🐱',
  reading_min_grade INTEGER NOT NULL DEFAULT 1,
  reading_max_grade INTEGER NOT NULL DEFAULT 3,
  math_min_grade INTEGER NOT NULL DEFAULT 1,
  math_max_grade INTEGER NOT NULL DEFAULT 3,
  writing_min_grade INTEGER NOT NULL DEFAULT 1,
  writing_max_grade INTEGER NOT NULL DEFAULT 3,
  behavior_points INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  skip_work_day_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_tasks (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (subject IN ('reading','math','writing')),
  prompt TEXT NOT NULL,
  hint TEXT,
  student_answer TEXT,
  passed INTEGER,
  ai_feedback TEXT,
  assigned_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_student_date ON daily_tasks(student_id, date);

CREATE TABLE IF NOT EXISTS task_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  subject TEXT NOT NULL DEFAULT 'all',
  base_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO task_config (id, subject, base_count) VALUES (1, 'reading', 1);
INSERT OR IGNORE INTO task_config (id, subject, base_count) VALUES (2, 'math', 1);
INSERT OR IGNORE INTO task_config (id, subject, base_count) VALUES (3, 'writing', 1);

CREATE TABLE IF NOT EXISTS behavior_log (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  note TEXT,
  extra_tasks_assigned INTEGER DEFAULT 0,
  extra_worksheets_assigned INTEGER DEFAULT 0,
  logged_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS break_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  work_minutes_before_first_break INTEGER NOT NULL DEFAULT 10,
  work_minutes_before_next_break INTEGER NOT NULL DEFAULT 15,
  break_duration_minutes INTEGER NOT NULL DEFAULT 10,
  calming_corner_enabled INTEGER NOT NULL DEFAULT 1,
  break_system_enabled INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO break_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS break_game_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3)
);

CREATE TABLE IF NOT EXISTS break_log (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  break_start TEXT,
  break_end TEXT,
  option_chosen TEXT,
  work_minutes_before INTEGER
);

CREATE TABLE IF NOT EXISTS worksheet_library (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_min INTEGER NOT NULL DEFAULT 1,
  grade_max INTEGER NOT NULL DEFAULT 6,
  source_url TEXT,
  file_path TEXT,
  source_site TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS worksheet_assignments (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheet_library(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assigned_date TEXT NOT NULL,
  due_date TEXT,
  instructions TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ws_assign_student ON worksheet_assignments(student_id);

CREATE TABLE IF NOT EXISTS youtube_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  teacher_note TEXT,
  requested_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approved_urls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  category TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('teacher_password', 'blockforge2024');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('school_name', 'My School');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('class_name', 'My Class');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('scratch_url', 'https://scratch.mit.edu');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('remote_access_pin', '1234');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('default_grade_min', '1');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('default_grade_max', '6');

CREATE INDEX IF NOT EXISTS idx_break_log_student ON break_log(student_id, date);
