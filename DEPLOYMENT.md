# Deployment Guide

## One-button deploy from VS Code

**Cmd+Shift+B** → type what you fixed → Enter → done.

This stages all changes, commits with your message, and pushes to `main`. Vercel and Railway pick it up automatically within ~60 seconds.

- Frontend live at: https://scratch-classroom.vercel.app
- Vercel dashboard: https://vercel.com/dashboard
- Railway dashboard: https://railway.app/dashboard

## Quick deploy (no prompt)

Run the **Quick Deploy** task: Cmd+Shift+B → select "Quick Deploy" → commits as "quick update".

## Local dev
```bash
npm run dev        # starts frontend (port 5173) + API (port 4000)
npm run dev:web    # frontend only
npm run dev:api    # API only
```

## Auto-deploy
- **Frontend → Vercel** (`scratch-classroom.vercel.app`) — deploys on every push to `main`
- **API → Railway** — deploys on every push to `main`

## Roll back
Go to Vercel/Railway dashboard → Deployments → click any previous deploy → Promote to Production.

## Debugging
Open Claude Code (`claude` in terminal) from `/Users/alecimboden/Thign` — it has full context.
