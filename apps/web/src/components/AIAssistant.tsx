import React, { useState, useRef, useEffect } from "react";
import type { AIMessage } from "@scratch/shared";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Sparkles, X, ArrowUp } from "lucide-react";

interface Props {
  projectContext?: string;
  enabled?: boolean;
}

const QUICK_PROMPTS = [
  { text: "How do I make a sprite move with WASD?", label: "WASD move" },
  { text: "Help me add jumping to my game", label: "Jumping" },
  { text: "How do I use operators with variables?", label: "Operators" },
  { text: "Give me a game project idea", label: "Project idea" },
  { text: "How do I make 3D environments work?", label: "3D worlds" },
  { text: "Help me draw with Pen+ blocks", label: "Pen drawing" },
  { text: "How do I make music with blocks?", label: "Music" },
  { text: "Explain if/else and loops", label: "If / loops" },
];

export default function AIAssistant({ projectContext, enabled = true }: Props) {
  const { theme } = useTheme();
  const dk = theme === "dark";
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

  if (!enabled) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="card text-sm px-4 py-3" style={{ color: "var(--text-3)" }}>
          AI Assistant is disabled by your teacher
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                     rounded-2xl shadow-xl shadow-violet-600/25 flex items-center justify-center transition-all
                     duration-300 hover:scale-110 hover:shadow-violet-600/40 active:scale-95 border border-white/10 cursor-pointer"
          title="AI Assistant"
        >
          <Sparkles size={22} className="text-white" />
        </button>
      )}

      {isOpen && (
        <div className="ai-panel w-80 h-[500px] animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600/90 to-indigo-600/90 border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <span className="font-semibold text-white text-sm">AI Assistant</span>
                <span className="block text-[10px] text-white/50">Powered by BlockForge</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  Hi! I can help you code. Try asking:
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p.text}
                      onClick={() => setInput(p.text)}
                      className="text-left text-[11px] rounded-lg px-2.5 py-2 leading-tight transition-colors cursor-pointer border"
                      style={{
                        background: "var(--bg-muted)",
                        color: "var(--text-3)",
                        borderColor: "var(--border)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-accent)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-focus)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-muted)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "user" ? (
                  <div className="bubble-me max-w-[85%]">{msg.content}</div>
                ) : (
                  <div className="bubble-other max-w-[85%]">{msg.content}</div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bubble-other">
                  <div className="flex gap-1.5 py-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about coding..."
                className="input flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={loading}
                className="btn-primary w-9 h-9 p-0 flex-shrink-0"
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
