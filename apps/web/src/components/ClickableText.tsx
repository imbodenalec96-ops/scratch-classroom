import React, { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.ts";

/**
 * ClickableText — wraps every word in the given text with a tap target so
 * the student can ask "what does this mean?" on any word they don't know.
 * On tap, fetches a kid-friendly definition from /api/ai/define and shows
 * a small popover above (or below, if there's no room) the tapped word.
 *
 * Punctuation stays attached to the word visually but is stripped from
 * the API request so "tree." and "tree," both look up "tree".
 *
 * Use anywhere a student reads text: question prompt, passage, instructions.
 * Options/choices stay non-clickable since tapping them is the answer action.
 */
export default function ClickableText({
  text,
  gradeLevel,
  contextForDefine,
  className,
  style,
}: {
  text: string;
  gradeLevel?: number;
  contextForDefine?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [popover, setPopover] = useState<{
    word: string;
    rect: DOMRect;
    state: "loading" | "ready" | "error";
    definition?: string;
    example?: string;
  } | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!popover) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setPopover(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopover(null); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    e.stopPropagation();
    const cleaned = raw.replace(/[^A-Za-z'-]/g, "");
    if (!cleaned) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ word: cleaned, rect, state: "loading" });
    try {
      const d = await api.defineWord(cleaned, gradeLevel, contextForDefine);
      setPopover((prev) =>
        prev && prev.word === cleaned
          ? { ...prev, state: "ready", definition: d.definition, example: d.example }
          : prev,
      );
    } catch {
      setPopover((prev) =>
        prev && prev.word === cleaned ? { ...prev, state: "error" } : prev,
      );
    }
  };

  // Split text into tokens (words + non-word chunks). Non-word chunks
  // (whitespace, punctuation between words) are rendered as plain text.
  // Words get wrapped in clickable spans.
  const tokens = React.useMemo(() => {
    if (!text) return [] as Array<{ kind: "word" | "gap"; value: string }>;
    const out: Array<{ kind: "word" | "gap"; value: string }> = [];
    const re = /([A-Za-z][A-Za-z'-]*)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) out.push({ kind: "gap", value: text.slice(lastIdx, m.index) });
      out.push({ kind: "word", value: m[0] });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) out.push({ kind: "gap", value: text.slice(lastIdx) });
    return out;
  }, [text]);

  // Popover positioning — try above the word; if no room, go below.
  const popoverStyle: React.CSSProperties = popover
    ? (() => {
        const margin = 10;
        const popWidth = Math.min(320, window.innerWidth - 24);
        const above = popover.rect.top > 180;
        const top = above ? popover.rect.top - margin : popover.rect.bottom + margin;
        let left = popover.rect.left + popover.rect.width / 2 - popWidth / 2;
        left = Math.max(12, Math.min(window.innerWidth - popWidth - 12, left));
        return {
          position: "fixed",
          top,
          left,
          width: popWidth,
          transform: above ? "translateY(-100%)" : undefined,
          zIndex: 9999,
        };
      })()
    : { display: "none" };

  return (
    <span ref={containerRef} className={className} style={style}>
      {tokens.map((t, i) =>
        t.kind === "gap" ? (
          <span key={i}>{t.value}</span>
        ) : (
          <span
            key={i}
            onClick={(e) => handleWordClick(e, t.value)}
            style={{
              cursor: "help",
              borderBottom: "1px dotted rgba(124,58,237,0.35)",
              transition: "background-color 0.15s",
              borderRadius: 3,
              padding: "0 1px",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124,58,237,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
            title="Tap to see what this word means"
          >
            {t.value}
          </span>
        ),
      )}

      {popover && (
        <div
          style={{
            ...popoverStyle,
            background: "#fffbeb",
            border: "1px solid #fbbf24",
            borderRadius: 12,
            padding: "12px 14px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            color: "#3a2410",
            fontSize: 14,
            lineHeight: 1.4,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>📖</span>
            <span style={{ fontWeight: 800, color: "#92400e", textTransform: "lowercase" }}>
              {popover.word}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <button
                onClick={() => setPopover(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#92400e",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </span>
          </div>
          {popover.state === "loading" && (
            <div style={{ color: "#78350f", fontSize: 13 }}>Looking it up…</div>
          )}
          {popover.state === "error" && (
            <div style={{ color: "#78350f", fontSize: 13 }}>
              Couldn't find a definition. Try asking your teacher!
            </div>
          )}
          {popover.state === "ready" && (
            <>
              <div style={{ marginBottom: popover.example ? 6 : 0 }}>{popover.definition}</div>
              {popover.example && (
                <div style={{ fontStyle: "italic", color: "#78350f", fontSize: 13 }}>
                  e.g. {popover.example}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
