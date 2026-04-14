import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = io(window.location.origin.replace(":5173", ":4000"), {
      auth: { token },
      transports: ["websocket"],
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
