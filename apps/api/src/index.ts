import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import app from "./app.js";
import { setupWebSocket } from "./ws.js";

const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true },
});

// WebSocket
setupWebSocket(io);

const PORT = parseInt(process.env.PORT || "4000");
httpServer.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
