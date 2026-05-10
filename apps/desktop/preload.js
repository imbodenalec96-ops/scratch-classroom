// Empty preload — kept so contextIsolation + a future bridge has a
// place to live. Right now the web app talks straight to the API
// without any Node integration, so there's nothing to expose.

// eslint-disable-next-line no-unused-vars
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("scratchDesktop", {
  isDesktop: true,
  platform: process.platform,
});
