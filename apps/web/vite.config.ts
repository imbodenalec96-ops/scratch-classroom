import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

// Build-time version stamp. Used by:
//   1. The client-side UpdateChecker (compares against /version.json)
//   2. The console banner so we can confirm what's deployed
// Tries the short git SHA first; falls back to the build epoch.
function buildVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return `t${Date.now()}`;
  }
}

const VERSION = buildVersion();

// Plugin that drops a /version.json into the dist root after build so
// the client can poll it. Vercel headers (vercel.json) keep this file
// uncached so polling actually sees fresh values.
function versionJsonPlugin(): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: VERSION, builtAt: new Date().toISOString() }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
