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
