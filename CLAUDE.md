# Thign / Scratch Classroom — Claude Operating Instructions

This is the Scratch Classroom platform (internal codename: Thign). It is a web application for managing student coding sessions built with React, TypeScript, Vite, Express, and Postgres/Neon.

## Architecture quick-reference

- `apps/web/` — React/TypeScript frontend (Vite)
- `apps/api/` — Express REST API + WebSocket server
- `packages/` — shared types and utilities
- Deploy target: Vercel (frontend) + Railway/Neon (API + DB)

When working on this repo, read `raw-sources/code-graph/thign-architecture.md` in the vault (see below) before grepping blindly — it has the full module dependency graph, API routes, and DB schema already mapped.

---

## Personal second brain

Non-code context for the user (past Claude conversations, personal notes, project overviews, business knowledge) lives in their Obsidian vault:

`/Users/alecimboden/Documents/Second Brain`

When a question isn't purely about this repo's code, consult:
- `<vault>/CLAUDE.md` — the vault's operating rules
- `<vault>/wiki/topics/` — topic hub pages with cross-references to 535+ Claude sessions
- `<vault>/wiki/topics/thign-classroom-core.md` — Thign-specific knowledge hub (96 source sessions)
- `<vault>/raw-sources/claude-sessions/` — prior Claude conversation history
- `<vault>/raw-sources/thign-code-sessions/` — Thign-specific session transcripts
- `<vault>/raw-sources/code-graph/thign-architecture.md` — live code architecture doc

Cite files with Obsidian-style wiki-links: `[[raw-sources/...]]` or `[[wiki/...]]`.

---

## Deployment

- **Production URL:** https://scratch-classroom.vercel.app
- **Deploys happen automatically** via Vercel's GitHub integration on every push to `main`. That is the only correct deploy path.
- To ship a change: `git add <files>`, `git commit -m "..."`, `git push origin main`. That's it.
- **NEVER run `vercel`, `npx vercel`, `vercel --prod`, or any Vercel CLI command.** They fail silently (invalid/missing token) and will mislead you into thinking you shipped when you didn't.
- **NEVER claim "deployed" unless you've verified** a new deployment for the latest commit SHA appears on https://vercel.com/dashboard and its status is **Ready**. If it's Building, wait. If it's Failed, open the build logs, fix the error, push again.

## Before pushing

- Run `npm run build` locally and confirm it succeeds. If it fails, fix before pushing — a broken build will fail Vercel's build and students won't see the change.
- Check `git status` for uncommitted changes you didn't mean to include.
- One-time setup: run `bash scripts/install-hooks.sh` to install a local pre-push hook that runs the build check automatically.

## Environments

- Frontend + API are both served by Vercel (scratch-classroom project). Database is Neon Postgres.
- Env vars live in Vercel project settings (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, CLIENT_URL). Don't commit them.
- Do NOT commit `.env` files or any file starting with `.env.` other than `.env.example`.

## When something goes wrong

- **"I don't see my change"** → you probably deployed wrong. Hard-refresh scratch-classroom.vercel.app. If it's still the old version, check the Vercel dashboard: is there a deployment for your commit SHA and is it Ready?
- **"Build failed on Vercel"** → pull the logs from vercel.com/dashboard → Deployments → failed build → Build Logs. The error is near the bottom.

## Do not

- Do NOT run any `vercel` CLI commands.
- Do NOT claim a task is done without live verification.
- Do NOT commit `.env*` files (other than `.env.example`).
- Do NOT touch the Neon production database without explicit user confirmation.
