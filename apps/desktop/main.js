// Electron main process for Scratch Classroom Desktop.
//
// Strategy: thin wrapper. We DON'T bundle the web app — we point a
// BrowserWindow at the live Vercel URL. That way:
//   - The app always shows the latest deploy (no stale cache pain).
//   - We never have to ship updates separately when the web changes.
//   - Build size stays tiny (~80 MB DMG, ~60 MB EXE).
//
// To make this an offline-first app later, swap PROD_URL for a
// `loadFile(...)` that points at a bundled apps/web/dist build.

const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("path");

// Production URL the desktop window opens. Override at launch time
// with --url=https://... to test against a preview deploy or local
// dev server.
const DEFAULT_PROD_URL = "https://scratch-classroom.vercel.app/";

function pickUrl() {
  const flag = process.argv.find((a) => a.startsWith("--url="));
  if (flag) return flag.slice("--url=".length);
  if (process.env.SCRATCH_URL) return process.env.SCRATCH_URL;
  return DEFAULT_PROD_URL;
}

// Single-instance lock — re-clicking the dock icon focuses the existing
// window instead of opening a second one. (Standard Electron pattern.)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

let mainWindow = null;

function createWindow() {
  const url = pickUrl();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0414", // matches the violet/pink dark theme so
                                // the white-flash on load is invisible
    title: "Scratch Classroom",
    show: false, // wait for ready-to-show so users don't see a blank flash
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the page to use the camera (StarPhonePage worksheet capture)
      // and audio APIs (sound effects). The site is HTTPS via Vercel so
      // permissions are granted automatically by Electron in normal
      // browser fashion.
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links (target=_blank, http://, mailto:) in the system
  // browser instead of inside the app — this keeps Slack links etc.
  // out of the classroom app window.
  mainWindow.webContents.setWindowOpenHandler(({ url: outUrl }) => {
    shell.openExternal(outUrl);
    return { action: "deny" };
  });

  // Reasonable error message instead of a generic Chromium screen if
  // there's no internet on first load.
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    if (code === -3) return; // -3 is user-aborted (e.g. reload), ignore
    dialog.showErrorBox(
      "Couldn't reach Scratch Classroom",
      `Network error (${code}): ${desc}\n\nCheck your internet connection and try again.\n\nLoading: ${url}`,
    );
  });

  mainWindow.loadURL(url);
}

// Lightweight menu — keeps the standard Mac shortcuts (Quit, Hide,
// Reload, Inspect) without leaning into Electron's "View → Toggle
// Developer Tools" defaults that look messy in a teacher tool.
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: "Scratch Classroom",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
        ...(isMac ? [{ type: "separator" }, { role: "front" }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  // macOS: re-open window if the dock icon is clicked and no windows are open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Standard quit-on-all-windows-closed for non-mac.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
