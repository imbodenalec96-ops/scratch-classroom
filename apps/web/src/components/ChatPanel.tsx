import React, { useEffect, useState, useRef } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { getSocket } from "../lib/ws.ts";

interface Props { classId: string; }

export default function ChatPanel({ classId }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.getChat(classId).then(setMessages).catch(() => {}); }, [classId]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (msg: any) => { if (msg.classId === classId) setMessages((prev) => [...prev, msg]); };
    socket.on("chat:message", handler);
    return () => { socket.off("chat:message", handler); };
  }, [classId]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    await api.sendChat(classId, input.trim());
    setInput("");
  };

  return (
    <div className="card flex flex-col" style={{ height: 400 }}>
      <h3 className="text-sm font-semibold text-white mb-3">Class Chat</h3>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3">
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                isMe ? "bg-violet-600/80 text-white" : "bg-white/[0.06] text-white/80 border border-white/[0.06]"}`}>
                {!isMe && <div className="text-[10px] text-violet-400 font-medium mb-0.5">{msg.sender_name}</div>}
                {msg.text}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <div className="text-center text-white/20 text-sm py-8">No messages yet</div>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message..."
          className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
        <button onClick={send} className="px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 text-sm font-medium transition-colors">Send</button>
      </div>
    </div>
  );
}
