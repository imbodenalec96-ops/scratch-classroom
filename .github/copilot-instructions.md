# Agent instructions for scratch-classroom

This is the Scratch Classroom platform (internal codename: Thign). React/TypeScript/Vite frontend + Express API, both on Vercel. Database: Neon Postgres.

## Deployment

- **Production URL:** https://scratch-classroom.vercel.app
- **Deploys happen automatically** via Vercel's GitHub integration on every push to `main`. That is the only correct deploy path.
- To ship a change: `git add <files>`, `git commit -m "..."`, `git push origin main`. That's it.
- **NEVER run `vercel`, `npx vercel`, `vercel --prod`, or any Vercel CLI command.** They fail silently (invalid/missing token) and will mislead you into thinking you shipped when you didn't.
- **NEVER claim "deployed" unless you've verified** a new deployment for the latest commit SHA appears on https://vercel.com/dashboard and its status is **Ready**. If it's Building, wait. If it's Failed, open the build logs, fix the error, push again.

## Before pushing

- Run `npm run build` locally and confirm it succeeds. A broken build will fail Vercel and students won't see the change.
- Check `git status` for uncommitted changes you didn't mean to include.

## Environments

- Frontend + API are both served by Vercel (scratch-classroom project). Database is Neon Postgres.
- Env vars live in Vercel project settings. Do NOT commit `.env*` files (other than `.env.example`).

## Architecture

- `apps/web/` — React/TypeScript frontend (Vite)
- `apps/api/` — Express REST API (runs as Vercel serverless functions at `/api`)
- `packages/` — shared types

## Do not

- Do NOT run any `vercel` CLI commands.
- Do NOT claim a task is done without live verification.
- Do NOT commit `.env*` files (other than `.env.example`).
- Do NOT touch the Neon production database without explicit user confirmation.
