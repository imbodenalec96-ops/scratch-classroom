import React, { useState, useRef, useEffect } from "react";
import type { AIMessage } from "@scratch/shared";
import { api } from "../lib/api.ts";

interface Props {
  projectContext?: string;
  enabled?: boolean;
}

export default function AIAssistant({ projectContext, enabled = true }: Props) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: AIMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const reply = await api.aiChat(newMessages, projectContext);
      setMessages([...newMessages, reply]);
    } catch (err: any) {
      setMessages([...newMessages, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    { text: "How do I make a sprite move?", icon: "→" },
    { text: "Help me debug my code", icon: "🔧" },
    { text: "Give me a project idea", icon: "💡" },
    { text: "Explain loops", icon: "🔄" },
    { text: "How do 3D shapes work?", icon: "🧊" },
    { text: "Add physics to my project", icon: "⚡" },
  ];

  if (!enabled) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-xl p-4 text-sm text-white/40">
          AI Assistant is disabled by your teacher
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                     rounded-2xl shadow-xl shadow-violet-600/25 flex items-center justify-center text-xl transition-all
                     duration-300 hover:scale-110 hover:shadow-violet-600/40 active:scale-95 border border-white/10">
          ✦
        </button>
      )}

      {isOpen && (
        <div className="w-80 h-[500px] bg-[#0d0d1a]/95 backdrop-blur-xl rounded-2xl border border-white/[0.08]
                        shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600/90 to-indigo-600/90 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">✦</div>
              <div>
                <span className="font-semibold text-white text-sm">AI Assistant</span>
                <span className="block text-[10px] text-white/50">Powered by BlockForge</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors text-xs">
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-white/40">Hi! I can help you code. Try asking:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickPrompts.map((p) => (
                    <button key={p.text} onClick={() => setInput(p.text)}
                      className="text-left text-[11px] bg-white/[0.04] hover:bg-white/[0.08] rounded-lg px-2.5 py-2
                                 text-white/50 hover:text-violet-300 transition-colors border border-white/[0.04]
                                 leading-tight">
                      <span className="mr-1">{p.icon}</span> {p.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    : "bg-white/[0.06] text-white/80 border border-white/[0.06]"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] rounded-xl px-4 py-2.5 border border-white/[0.06]">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about coding..."
                className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20
                           focus:border-violet-500/50 focus:outline-none" />
              <button onClick={sendMessage} disabled={loading}
                className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center
                           disabled:opacity-40 transition-colors text-sm font-bold">
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
