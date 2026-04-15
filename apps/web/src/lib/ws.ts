import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

function getWsUrl(): string {
  // In local dev, API runs on port 4000
  if (window.location.hostname === "localhost") {
    return window.location.origin.replace(":5173", ":4000");
  }
  // On Vercel (or other deployments), WS is not available via serverless
  return window.location.origin;
}

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = io(getWsUrl(), {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 3,
      timeout: 5000,
    });
    socket.on("connect_error", () => {
      // Silently handle connection failures (e.g., on Vercel where WS is unavailable)
      console.warn("WebSocket unavailable — real-time features disabled");
    });
  }
  return socket;
}

export function useSocket(event: string, handler: (data: any) => void) {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const s = getSocket();
    const fn = (data: any) => savedHandler.current(data);
    s.on(event, fn);
    return () => { s.off(event, fn); };
  }, [event]);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
