# Deployment Guide

## Local dev
```bash
npm run dev        # starts both frontend (port 5173) and API (port 3001)
npm run dev:web    # frontend only
npm run dev:api    # API only
```

## Push to production
```bash
git add .
git commit -m "your message"
git push origin main
```

## Auto-deploy
- **Frontend → Vercel** (`scratch-classroom.vercel.app`) — deploys automatically when `main` is pushed
- **API → Railway** — deploys automatically when `main` is pushed

## View deploy logs
- Vercel: vercel.com → scratch-classroom → Deployments
- Railway: railway.app → your project → Deployments

## When something breaks
Open Claude Code (`claude` in terminal) from `/Users/alecimboden/Thign` — it has full context of this codebase.
