import React, { useEffect, useState, useRef } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { getSocket } from "../lib/ws.ts";
import { useTheme } from "../lib/theme.tsx";
import { Send } from "lucide-react";

interface Props { classId: string; }

export default function ChatPanel({ classId }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.getChat(classId).then(setMessages).catch(() => {}); }, [classId]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (msg: any) => {
      if (msg.classId !== classId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on("chat:message", handler);
    return () => { socket.off("chat:message", handler); };
  }, [classId]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const msg = await api.sendChat(classId, text);
    setMessages((prev) => [...prev, { ...msg, sender_name: user?.name }]);
    setInput("");
  };

  return (
    <div className="card flex flex-col" style={{ height: 400 }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-1)" }}>Class Chat</h3>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3 scrollbar-thin">
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              {isMe ? (
                <div className="bubble-me max-w-[75%]">{msg.text}</div>
              ) : (
                <div className="bubble-other max-w-[75%]">
                  <div className="text-[10px] text-violet-400 font-medium mb-0.5">{msg.sender_name}</div>
                  {msg.text}
                </div>
              )}
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="text-center text-sm py-8" style={{ color: "var(--text-3)" }}>
            No messages yet
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          className="input flex-1"
        />
        <button onClick={send} className="btn-primary px-3 py-2">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
