# Scratch Classroom — Full-Stack Coding Platform

A comprehensive Scratch-inspired classroom coding platform with drag-and-drop blocks, 2D/3D stages, real-time collaboration, AI assistance, and full teacher/student/admin role management.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| 3D Engine | Three.js, @react-three/fiber, @react-three/drei |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken + bcrypt) |
| Realtime | Socket.IO |
| AI | OpenAI API (optional, with mock fallback) |

## Monorepo Structure

```
├── apps/
│   ├── api/          # Express backend (port 4000)
│   └── web/          # React frontend (Vite dev server, port 5173)
├── db/
│   ├── schema.sql    # PostgreSQL schema (14+ tables)
│   └── seed.sql      # Seed template
├── packages/
│   └── shared/       # Shared TypeScript types
├── package.json      # Workspace root
└── .env.example      # Environment variables template
```

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14 (running locally or remote)
- **npm** ≥ 9

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create database

```bash
createdb scratch_classroom
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL connection string:
# DATABASE_URL=postgresql://user:password@localhost:5432/scratch_classroom
# JWT_SECRET=your-random-secret-key
# OPENAI_API_KEY=sk-... (optional — AI features have mock fallback)
```

### 4. Run schema + seed

```bash
psql scratch_classroom < db/schema.sql
npx tsx apps/api/src/data/seed.ts
```

### 5. Start development servers

```bash
# Terminal 1 — Backend
npm run dev --workspace=apps/api

# Terminal 2 — Frontend
npm run dev --workspace=apps/web
```

Frontend: http://localhost:5173  
API: http://localhost:4000  

The Vite dev server proxies `/api` requests to the backend automatically.

## Demo Accounts

After seeding, these accounts are available (password: `password123`):

| Role | Email | Name |
|------|-------|------|
| Admin | admin@school.edu | Admin User |
| Teacher | teacher@school.edu | Ms. Smith |
| Student | alice@school.edu | Alice Johnson |
| Student | bob@school.edu | Bob Williams |

**Demo class:** "Intro to Coding" — code `CODE101`

## Features

### Core Coding Platform
- 65+ drag-and-drop blocks across 11 categories (motion, looks, sound, events, control, operators, variables, lists, physics, sensing, custom)
- Real-time block-to-JavaScript transpiler with code viewer
- 2D canvas stage with sprite rendering, speech bubbles, physics
- 3D stage with Three.js (OrbitControls, environment lighting, transform tools)
- Sprite management (add, delete, rename, duplicate, color-coded)
- Keyframe-based animation timeline
- Asset manager (images, sounds, 3D models) with file upload
- Auto-save (30s intervals) with version history

### Teacher Tools
- Class creation with invite codes
- Bulk student import (CSV-style)
- Assignment builder with rubric editor
- Quiz builder (manual + AI-generated)
- Auto-grading engine (checks blocks, events, control flow)
- Manual grading panel with feedback
- Student screen monitor (real-time via WebSocket)
- Lock/unlock student screens
- Broadcast announcements
- Attendance tracking
- Behavior log system
- Per-student AI assistant toggle
- Analytics dashboard with CSV export

### Student Tools
- Join class by code
- Project workspace with 2D/3D toggle
- Quiz participation with instant scoring
- Assignment submission with auto-grade preview
- Personal analytics
- Achievement badges & XP leveling
- Leaderboard with ranking
- Class chat (real-time)
- AI coding assistant

### Admin Tools
- User management (list, change roles, delete)
- Platform-wide stats
- Class overview

### AI Integration
- Chat-based coding assistant (OpenAI or mock)
- AI project generator
- AI quiz generator

### Security
- JWT authentication with bcrypt password hashing
- Role-based access control middleware
- Input validation on all endpoints
- CORS configuration
- File upload restrictions (10MB limit)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Sign in |
| GET | /api/auth/me | Current user info |
| GET/POST | /api/classes | List/create classes |
| POST | /api/classes/:id/join | Join by code |
| GET | /api/classes/:id/students | List students |
| POST | /api/classes/:id/import | Bulk import |
| GET/POST | /api/projects | List/create projects |
| PUT | /api/projects/:id | Save project |
| GET/POST | /api/assignments | Assignments CRUD |
| POST | /api/submissions | Submit assignment |
| POST | /api/submissions/:id/grade | Grade submission |
| GET/POST | /api/quizzes | Quizzes CRUD |
| POST | /api/quizzes/:id/attempt | Submit quiz |
| POST | /api/analytics/track | Track events |
| GET | /api/analytics/class/:id | Class analytics |
| GET | /api/analytics/class/:id/export | CSV export |
| GET/POST | /api/chat/:classId | Chat messages |
| GET | /api/leaderboard | Top 50 |
| POST | /api/leaderboard/points | Award points |
| GET/PUT/DELETE | /api/users | Admin user management |
| POST | /api/ai/chat | AI assistant |
| POST | /api/ai/generate-project | AI project gen |
| POST | /api/ai/generate-quiz | AI quiz gen |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| project:update | Client → Server | Broadcast project changes |
| chat:message | Bidirectional | Real-time chat |
| class:broadcast | Server → Client | Teacher announcements |
| class:lock | Server → Client | Lock/unlock student screens |
| student:screen | Client → Server | Screen sharing |

## License

MIT
