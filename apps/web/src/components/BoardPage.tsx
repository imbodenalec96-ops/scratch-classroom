import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleBlock {
  id: string;
  class_id: string;
  block_number: number;
  start_time: string;
  end_time: string;
  label: string;
  subject: string | null;
  is_break: number;
  break_type: string | null;
  active_days: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const NAVY = "#0d1b2e";
const CREAM = "#f5e6c8";
const CREAM60 = "rgba(245,230,200,0.6)";
const CREAM25 = "rgba(245,230,200,0.25)";
const MARIGOLD = "#d97706";
const MARIGOLD_BG = "rgba(217,119,6,0.18)";
const SURFACE = "rgba(255,255,255,0.04)";
const BORDER = "rgba(245,230,200,0.1)";

const EMOJI: Record<string, string> = {
  daily_news: "📺",
  sel: "💜",
  math: "🧮",
  reading: "📚",
  writing: "✏️",
  spelling: "🔤",
  review: "🔁",
  extra_review: "🔁",
  cashout: "💰",
  recess: "⚽",
  lunch: "🥪",
  calm_down: "🧘",
  video_learning: "🎥",
  ted_talk: "🎤",
  coding_art_gym: "🎨",
  dismissal: "👋",
};

const BREAK_EMOJI: Record<string, string> = {
  recess: "⚽",
  lunch: "🥪",
  calm_down: "🧘",
  regular: "☕",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getEmoji(b: ScheduleBlock): string {
  if (b.subject && EMOJI[b.subject]) return EMOJI[b.subject];
  if (b.is_break && b.break_type) return BREAK_EMOJI[b.break_type] ?? "☕";
  return "📘";
}

function filterToday(blocks: ScheduleBlock[], now: Date): ScheduleBlock[] {
  const today = DAY_NAMES[now.getDay()];
  return blocks.filter((b) => {
    if (!b.active_days) return true;
    const days = b.active_days.split(",").map((s) => s.trim()).filter(Boolean);
    return days.length === 0 || days.includes(today);
  });
}

function findCurrent(blocks: ScheduleBlock[], now: Date): ScheduleBlock | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of blocks) {
    const s = toMinutes(b.start_time);
    const e = toMinutes(b.end_time);
    if (s === e) { if (mins === s) return b; continue; }
    if (mins >= s && mins < e) return b;
  }
  return null;
}

function findNext(blocks: ScheduleBlock[], now: Date): ScheduleBlock | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  return blocks.find((b) => toMinutes(b.start_time) > mins) ?? null;
}

function secondsUntil(hhmm: string, now: Date): number {
  const target = toMinutes(hhmm) * 60;
  const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return Math.max(0, target - current);
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtFreetime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BoardPage() {
  const { classId: paramClassId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const classId = paramClassId || searchParams.get("class") || "";

  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [className, setClassName] = useState<string>("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!classId) return;
    fetch(`${BASE}/public/classes/${classId}/schedule`)
      .then((r) => r.json())
      .then((rows) => setSchedule(Array.isArray(rows) ? rows : []))
      .catch(() => setSchedule([]));
    fetch(`${BASE}/public/classes/${classId}`)
      .then((r) => r.json())
      .then((c) => setClassName(c?.name ?? ""))
      .catch(() => {});
  }, [classId]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const todayBlocks = useMemo(() => filterToday(schedule, now), [schedule, now]);
  const current = useMemo(() => findCurrent(todayBlocks, now), [todayBlocks, now]);
  const next = useMemo(() => findNext(todayBlocks, now), [todayBlocks, now]);

  const secsUntilNext = useMemo(() => {
    if (current) return secondsUntil(current.end_time, now);
    if (next) return secondsUntil(next.start_time, now);
    return null;
  }, [current, next, now]);

  const secsUntilFreetime = useMemo(() => {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const ft = todayBlocks.find(
      (b) => b.subject === "coding_art_gym" && toMinutes(b.start_time) > nowMins
    );
    if (!ft) return null;
    return secondsUntil(ft.start_time, now);
  }, [todayBlocks, now]);

  const isInFreetime = useMemo(
    () => current?.subject === "coding_art_gym",
    [current]
  );

  const nowMins = now.getHours() * 60 + now.getMinutes();

  function blockState(b: ScheduleBlock): "past" | "current" | "future" {
    const s = toMinutes(b.start_time);
    const e = toMinutes(b.end_time);
    if (b.id === current?.id) return "current";
    if (e <= nowMins && e !== s) return "past";
    if (s === e && s < nowMins) return "past";
    return "future";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: NAVY,
        color: CREAM,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        display: "grid",
        gridTemplateRows: "6vh 1fr 6.5vh",
        gridTemplateColumns: "1fr 27vw",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 3vw",
          borderBottom: `1px solid ${BORDER}`,
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <span style={{ fontSize: "1.8vh", fontWeight: 700, letterSpacing: "0.05em", opacity: 0.7 }}>
          {className || "Classroom Board"}
        </span>
        <span style={{ fontSize: "1.8vh", opacity: 0.6 }}>{fmtDate(now)}</span>
        <span
          style={{
            fontSize: "2.2vh",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: MARIGOLD,
          }}
        >
          {fmtTime(now)}
        </span>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3vh 5vw",
          gap: "2vh",
        }}
      >
        {current ? (
          <>
            {/* Big emoji */}
            <div style={{ fontSize: "18vh", lineHeight: 1, userSelect: "none" }}>
              {getEmoji(current)}
            </div>

            {/* Block label */}
            <div
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: "clamp(3rem, 9vw, 11vh)",
                fontWeight: 700,
                lineHeight: 1.05,
                textAlign: "center",
                color: CREAM,
              }}
            >
              {current.label}
            </div>

            {/* Countdown */}
            {secsUntilNext !== null && (
              <div
                style={{
                  fontSize: "clamp(1.4rem, 3.5vw, 4.5vh)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  color: CREAM60,
                }}
              >
                {fmtCountdown(secsUntilNext)} until next block
              </div>
            )}

            {/* Next-up chip */}
            {next && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6em",
                  padding: "0.5em 1.2em",
                  borderRadius: "999px",
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  fontSize: "clamp(0.9rem, 2vw, 2.5vh)",
                  color: CREAM60,
                }}
              >
                <span style={{ opacity: 0.5, fontSize: "0.85em" }}>NEXT</span>
                <span>{getEmoji(next)}</span>
                <span style={{ fontWeight: 600, color: CREAM }}>{next.label}</span>
                <span style={{ opacity: 0.5, fontSize: "0.85em" }}>{next.start_time}</span>
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2vh",
            }}
          >
            <div style={{ fontSize: "14vh", lineHeight: 1 }}>🏫</div>
            <div
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: "clamp(2rem, 7vw, 9vh)",
                fontWeight: 700,
                color: CREAM60,
              }}
            >
              {todayBlocks.length === 0 ? "No schedule today" : "Between blocks"}
            </div>
            {next && (
              <div style={{ color: CREAM60, fontSize: "clamp(1rem, 2.5vw, 3vh)" }}>
                Next: {getEmoji(next)} {next.label} at {next.start_time}
                {secsUntilNext !== null && (
                  <span> · {fmtCountdown(secsUntilNext)}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Schedule sidebar ─────────────────────────────────────────────────── */}
      <div
        style={{
          borderLeft: `1px solid ${BORDER}`,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            padding: "1.8vh 1.5vw 1.2vh",
            fontSize: "1.3vh",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: CREAM25,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          Today's Schedule
        </div>
        {todayBlocks.map((b) => {
          const state = blockState(b);
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1vw",
                padding: "1.3vh 1.5vw",
                borderBottom: `1px solid ${BORDER}`,
                background: state === "current" ? MARIGOLD_BG : "transparent",
                borderLeft: state === "current" ? `3px solid ${MARIGOLD}` : "3px solid transparent",
                opacity: state === "past" ? 0.38 : 1,
                transition: "background 0.4s",
              }}
            >
              <span style={{ fontSize: "2.2vh", minWidth: "2.2vh" }}>
                {state === "past" ? "✓" : getEmoji(b)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "clamp(0.75rem, 1.4vw, 1.8vh)",
                    fontWeight: state === "current" ? 700 : 500,
                    color: state === "current" ? MARIGOLD : state === "past" ? CREAM25 : CREAM,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {b.label}
                </div>
                <div style={{ fontSize: "clamp(0.6rem, 1vw, 1.3vh)", color: CREAM25 }}>
                  {b.start_time}–{b.end_time}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1em",
          padding: "0 3vw",
          background: "rgba(0,0,0,0.3)",
          borderTop: `1px solid ${BORDER}`,
          fontSize: "clamp(0.85rem, 1.8vw, 2.2vh)",
        }}
      >
        <span style={{ fontSize: "1.4em" }}>🎨</span>
        {isInFreetime ? (
          <span style={{ fontWeight: 700, color: MARIGOLD }}>
            Free time is active now!
          </span>
        ) : secsUntilFreetime !== null ? (
          <>
            <span style={{ color: CREAM60 }}>Free time unlocks in:</span>
            <span
              style={{
                fontWeight: 700,
                color: MARIGOLD,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtFreetime(secsUntilFreetime)}
            </span>
          </>
        ) : (
          <span style={{ color: CREAM25 }}>No free time scheduled today</span>
        )}
      </div>
    </div>
  );
}
