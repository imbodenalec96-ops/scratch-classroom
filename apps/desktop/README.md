# Scratch Classroom — Desktop

Electron wrapper that opens [scratch-classroom.vercel.app](https://scratch-classroom-api-td1x.vercel.app/) in a native window. Distributable as **.dmg** for Mac and **.exe** for Windows.

## Why a wrapper?

So you can install it like a real app (Dock / Start Menu / Launchpad) without typing the URL each time. The window points at the live deploy, so updates land automatically — no separate version management.

## How to get the installers

### Easy path: download from GitHub Actions (recommended)

GitHub Actions builds both `.dmg` and `.exe` on every manual run.

1. Go to **[Actions tab on GitHub](https://github.com/imbodenalec96-ops/scratch-classroom/actions/workflows/desktop-build.yml)**
2. Click **Run workflow** → **Run workflow** (the green button)
3. Wait ~5 minutes for both jobs to finish
4. Click into the run → scroll to the **Artifacts** section at the bottom
5. Download:
   - **`scratch-classroom-mac`** zip (contains the `.dmg`)
   - **`scratch-classroom-win`** zip (contains the `.exe`)
6. Unzip, install. Done.

### Permanent download links via Releases

Push a tag like `desktop-v1.0.0`:
```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```
The workflow attaches both installers to a real GitHub Release at https://github.com/imbodenalec96-ops/scratch-classroom/releases — share that URL with anyone who needs to install.

### Local build (only works for your own platform)

```bash
# from repo root
npm install
cd apps/desktop
node build/make-icons.js
npm run build:mac          # → dist/*.dmg  (Mac only — Windows build needs Wine or a Windows machine)
```

> Local Mac builds may hit a Gatekeeper "ENOENT" on the unsigned `app-builder` helper binary. Fix by running `xattr -d com.apple.quarantine node_modules/app-builder-bin/mac/*` once. (We don't auto-do this because it bypasses macOS code signing — only do it for trusted local builds.)

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
