import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ScheduleBlock, findCurrentBlock } from "../lib/useCurrentBlock.ts";

const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

const SUBJECT_ICON: Record<string, string> = {
  daily_news: "📰",
  sel: "💛",
  math: "🔢",
  writing: "✏️",
  spelling: "🔤",
  reading: "📖",
  review: "🔁",
  cashout: "💰",
  video_learning: "📺",
  ted_talk: "🎙️",
  coding_art_gym: "🎨",
  dismissal: "👋",
  recess: "🏃",
  calm_down: "🧘",
  lunch: "🍱",
  extra_review: "🔁",
};

function blockIcon(b: ScheduleBlock): string {
  return (b.subject && SUBJECT_ICON[b.subject]) || (b.is_break ? "⏸️" : "📘");
}

const NAVY = "#0d1b2a";
const CREAM = "#f8ecd2";
const MARIGOLD = "#d97706";
const MARIGOLD_DIM = "rgba(217,119,6,0.18)";
const CREAM_DIM = "rgba(248,236,210,0.38)";
const CREAM_MID = "rgba(248,236,210,0.65)";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function nowSeconds(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function formatCountdown(totalSecs: number): string {
  if (totalSecs <= 0) return "0:00";
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function isTodayBlock(b: ScheduleBlock, now: Date): boolean {
  if (!b.active_days) return true;
  const today = DAY_NAMES[now.getDay()];
  const days = b.active_days.split(",").map((s) => s.trim()).filter(Boolean);
  return days.length === 0 || days.includes(today);
}

export default function BoardPage() {
  const [searchParams] = useSearchParams();
  const classId = searchParams.get("classId");
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!classId) return;
    fetch(`${BASE}/board/schedule/${classId}`)
      .then((r) => r.json())
      .then((rows) => setBlocks(Array.isArray(rows) ? rows : []))
      .catch(() => setBlocks([]));
  }, [classId]);

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayBlocks = blocks.filter((b) => isTodayBlock(b, now));
  const currentBlock = findCurrentBlock(blocks, now);

  const nextBlock =
    todayBlocks.find((b) => toMinutes(b.start_time) > nowMins) ?? null;

  const nextCountdownSecs = nextBlock
    ? Math.max(0, toMinutes(nextBlock.start_time) * 60 - nowSeconds(now))
    : null;

  const nextCodingBlock =
    todayBlocks.find(
      (b) => b.subject === "coding_art_gym" && toMinutes(b.start_time) > nowMins
    ) ?? null;

  const codingCountdownSecs = nextCodingBlock
    ? Math.max(0, toMinutes(nextCodingBlock.start_time) * 60 - nowSeconds(now))
    : null;

  const isCodingNow = currentBlock?.subject === "coding_art_gym";

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const icon = currentBlock ? blockIcon(currentBlock) : "📅";
  const isBreak = currentBlock ? !!currentBlock.is_break : false;

  if (!classId) {
    return (
      <div
        style={{
          background: NAVY,
          color: CREAM,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
          gap: 20,
        }}
      >
        <div style={{ fontSize: 72 }}>📺</div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>Board Kiosk</div>
        <div style={{ color: CREAM_MID, fontSize: 16 }}>
          Add{" "}
          <code
            style={{
              background: "rgba(248,236,210,0.1)",
              padding: "3px 10px",
              borderRadius: 6,
              fontFamily: "monospace",
            }}
          >
            ?classId=YOUR_CLASS_ID
          </code>{" "}
          to the URL
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: NAVY,
        color: CREAM,
        height: "100vh",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 40px",
          borderBottom: "1px solid rgba(248,236,210,0.07)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: MARIGOLD,
          }}
        >
          Thign
        </div>
        <div style={{ color: CREAM_MID, fontSize: 15, fontWeight: 500 }}>
          {dateStr}
        </div>
        <div
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: CREAM,
          }}
        >
          {timeStr}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Hero — current block */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 60px",
            gap: 16,
          }}
        >
          {currentBlock ? (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: isBreak ? MARIGOLD : CREAM_MID,
                  background: isBreak
                    ? MARIGOLD_DIM
                    : "rgba(248,236,210,0.06)",
                  padding: "4px 18px",
                  borderRadius: 100,
                }}
              >
                NOW · Block {currentBlock.block_number}
              </div>

              <div style={{ fontSize: 104, lineHeight: 1, userSelect: "none" }}>
                {icon}
              </div>

              <div
                style={{
                  fontSize: "clamp(48px, 7vw, 80px)",
                  fontWeight: 900,
                  lineHeight: 1.05,
                  textAlign: "center",
                  letterSpacing: "-0.02em",
                  color: CREAM,
                }}
              >
                {currentBlock.label}
              </div>

              <div
                style={{
                  fontSize: 20,
                  color: CREAM_MID,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTime(currentBlock.start_time)} –{" "}
                {formatTime(currentBlock.end_time)}
              </div>

              {nextBlock && nextCountdownSecs !== null && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 18,
                    color: CREAM_MID,
                  }}
                >
                  <span style={{ fontSize: 22 }}>⏱</span>
                  <span>
                    <span
                      style={{
                        fontWeight: 800,
                        color: CREAM,
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 22,
                      }}
                    >
                      {formatCountdown(nextCountdownSecs)}
                    </span>{" "}
                    until{" "}
                    <span style={{ color: MARIGOLD, fontWeight: 700 }}>
                      {blockIcon(nextBlock)} {nextBlock.label}
                    </span>
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 88, userSelect: "none" }}>🏫</div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: CREAM_DIM,
                  textAlign: "center",
                }}
              >
                No active block
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            width: 1,
            background: "rgba(248,236,210,0.07)",
            flexShrink: 0,
          }}
        />

        {/* Schedule list */}
        <div
          style={{
            width: 320,
            display: "flex",
            flexDirection: "column",
            padding: "20px 24px",
            gap: 4,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: CREAM_DIM,
              marginBottom: 10,
              paddingLeft: 4,
            }}
          >
            Today's Schedule
          </div>

          {todayBlocks.length === 0 && (
            <div style={{ color: CREAM_DIM, fontSize: 14, padding: "8px 4px" }}>
              No blocks for today.
            </div>
          )}

          {todayBlocks.map((b) => {
            const start = toMinutes(b.start_time);
            const end = toMinutes(b.end_time);
            const isPast =
              end <= nowMins && !(start === end && nowMins === start);
            const isCurrent = b.id === currentBlock?.id;

            return (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  background: isCurrent ? MARIGOLD_DIM : "rgba(248,236,210,0.03)",
                  border: isCurrent
                    ? `1.5px solid ${MARIGOLD}`
                    : "1.5px solid transparent",
                  opacity: isPast ? 0.38 : 1,
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    width: 22,
                    textAlign: "center",
                    flexShrink: 0,
                    color: isPast ? CREAM_DIM : CREAM,
                  }}
                >
                  {isPast ? "✓" : blockIcon(b)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? CREAM : CREAM_MID,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: CREAM_DIM,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: 1,
                    }}
                  >
                    {formatTime(b.start_time)}
                    {b.start_time !== b.end_time
                      ? ` – ${formatTime(b.end_time)}`
                      : ""}
                  </div>
                </div>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: MARIGOLD,
                      flexShrink: 0,
                    }}
                  >
                    NOW
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer: free-time countdown ── */}
      <footer
        style={{
          borderTop: "1px solid rgba(248,236,210,0.07)",
          padding: "13px 40px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          background: isCodingNow ? MARIGOLD_DIM : "transparent",
        }}
      >
        <span style={{ fontSize: 22, userSelect: "none" }}>🎨</span>
        {isCodingNow ? (
          <span style={{ fontSize: 17, fontWeight: 800, color: MARIGOLD }}>
            Free Time is NOW — Coding · Art · Gym
          </span>
        ) : nextCodingBlock && codingCountdownSecs !== null ? (
          <span style={{ fontSize: 15, color: CREAM_MID }}>
            Free time unlocks in{" "}
            <span
              style={{
                fontWeight: 800,
                color: MARIGOLD,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCountdown(codingCountdownSecs)}
            </span>{" "}
            · Coding · Art · Gym at {formatTime(nextCodingBlock.start_time)}
          </span>
        ) : (
          <span style={{ fontSize: 15, color: CREAM_DIM }}>
            No more free time today
          </span>
        )}
      </footer>
    </div>
  );
}
