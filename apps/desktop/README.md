# Scratch Classroom — Desktop

Electron wrapper that opens [scratch-classroom.vercel.app](https://scratch-classroom.vercel.app/) in a native window. Builds **.dmg** for Mac and **.exe** for Windows.

## Why a wrapper?

So you can install it like a real app (Dock / Start Menu / Launchpad) without typing the URL each time. The window points at the live deploy, so updates land automatically — no separate version management.

## First-time build (one-time setup)

```bash
# from repo root
npm install                      # picks up the new @scratch/desktop workspace
cd apps/desktop
node build/make-icons.js         # generates icon.icns + icon.ico from web/public/icons/icon-512.png
```

## Build the installers

```bash
# from apps/desktop
npm run build:mac     # → dist/Scratch Classroom-1.0.0.dmg  (universal x64+arm64)
npm run build:win     # → dist/Scratch Classroom Setup 1.0.0.exe  (Windows x64)
npm run build:all     # both
```

> **Building Windows from a Mac** requires [Wine](https://www.winehq.org/) installed (`brew install --cask wine-stable`), or use a Windows machine, or a CI runner. Same the other way around for `.dmg` from Windows (use a Mac).

## Test before building

```bash
cd apps/desktop
npm start
```

Opens the Electron app pointed at the live URL. Add `--url=` to test against a different deploy:

```bash
npm start -- --url=https://scratch-classroom-git-some-branch.vercel.app/
SCRATCH_URL=http://localhost:5173 npm start    # against local Vite dev server
```

## Distribution

The output `.dmg` and `.exe` are not code-signed (no Apple/Windows signing certificates configured). Users will see a Gatekeeper / SmartScreen warning the first time they run the app — they need to right-click → Open (Mac) or "More info → Run anyway" (Windows). For internal classroom use this is fine; for wider distribution, you'd add signing certificates to the `mac.identity` / `win.certificateFile` fields in `package.json`.

## Where the installers go

`apps/desktop/dist/` — both `.dmg` and `.exe` files plus `latest.yml` / `latest-mac.yml` metadata files (used by auto-updaters; not strictly needed if you're hand-distributing).

## What it includes

- The live web app (no offline cache — needs internet)
- All the STAR features (barcode scanning works through Electron's webRequest just like a browser)
- Camera + microphone access for `/star/phone` worksheet capture
- Single-instance lock (re-clicking the icon focuses the existing window)
- External links open in the system browser
- Fullscreen toggle (View → Toggle Fullscreen, or ⌃⌘F on Mac / F11 on Windows)
