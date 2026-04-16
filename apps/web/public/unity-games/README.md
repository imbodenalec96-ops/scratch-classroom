# How to add a Unity WebGL game to the Arcade

## Steps

1. **Build your game in Unity** for WebGL (File → Build Settings → WebGL → Build)
2. **Copy the output folder** into this directory:
   ```
   apps/web/public/unity-games/<your-game-name>/
   ├── Build/
   │   ├── <name>.data
   │   ├── <name>.framework.js
   │   ├── <name>.loader.js
   │   └── <name>.wasm
   ├── TemplateData/
   └── index.html
   ```
3. **Register the game card** in `apps/web/src/components/ArcadePage.tsx` — add an entry to the `GAMES` array:
   ```ts
   {
     id: "my-unity-game",
     title: "My Unity Game",
     description: "Short description shown on the card",
     category: "Action",          // Action | Puzzle | Education | Creative
     stars: 4,
     plays: "0",
     accentColor: "#22d3ee",
     emoji: "🎮",
     type: "unity",
     embedUrl: "/unity-games/my-game-name/index.html",
     hint: "WASD + Mouse",
   }
   ```
4. **Commit and push** — Vercel will auto-deploy and the game will appear in the Arcade.

## Notes
- Unity's WebGL output serves static files — no server-side code needed.
- The iframe in the Arcade modal has `allow="autoplay; fullscreen"` and `sandbox="allow-scripts allow-same-origin"` which is enough for most Unity WebGL games.
- If your game needs keyboard input, click inside the iframe frame first to focus it.
- For large builds (>50MB), consider using Unity's Addressables or Brotli compression to reduce load time.
