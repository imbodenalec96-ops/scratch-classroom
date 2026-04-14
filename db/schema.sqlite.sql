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
