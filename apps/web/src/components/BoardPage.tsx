import React, { useState, useEffect } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { ScheduleBlock, findCurrentBlock } from "../lib/useCurrentBlock.ts";

const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

const ICON: Record<string, string> = {
  daily_news:     "📺",
  sel:            "💜",
  math:           "🧮",
  reading:        "📚",
  writing:        "✏️",
  spelling:       "🔤",
  review:         "🔁",
  extra_review:   "🔁",
  cashout:        "💰",
  recess:         "⚽",
  lunch:          "🥪",
  calm_down:      "🧘",
  video_learning: "🎥",
  ted_talk:       "🎤",
  coding_art_gym: "🎨",
  dismissal:      "👋",
};

function blockIcon(b: ScheduleBlock): string {
  if (b.subject && ICON[b.subject]) return ICON[b.subject];
  if (b.is_break) return "☕";
  return "📘";
}

// ── Palette ──────────────────────────────────────────────────────────────────
const NAVY     = "#0d1b2a";
const CREAM    = "#f8ecd2";
const MARIGOLD = "#d97706";
const CREAM60  = "rgba(248,236,210,0.60)";
const CREAM35  = "rgba(248,236,210,0.35)";
const GOLD_BG  = "rgba(217,119,6,0.18)";
const GOLD_BDR = `1.5px solid ${MARIGOLD}`;
const NONE_BDR = "1.5px solid transparent";

const DAY = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] as const;

function toMins(hhmm: string) {
  const [h,m] = hhmm.split(":").map(Number);
  return (h||0)*60+(m||0);
}
function nowSecs(d: Date) {
  return d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds();
}
function fmt12(hhmm: string) {
  const [h,m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h%12||12}:${String(m).padStart(2,"0")} ${ap}`;
}
function fmtCountdown(secs: number) {
  if (secs <= 0) return "0:00";
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function isToday(b: ScheduleBlock, now: Date) {
  if (!b.active_days) return true;
  const today = DAY[now.getDay()];
  const days = b.active_days.split(",").map(s=>s.trim()).filter(Boolean);
  return days.length === 0 || days.includes(today);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BoardPage() {
  const { classId: paramId } = useParams<{ classId?: string }>();
  const [searchParams] = useSearchParams();

  // Priority: route param → ?classId= → ?class=
  const nameOrId = paramId || searchParams.get("classId") || searchParams.get("class") || null;

  const [className, setClassName] = useState<string>("");
  const [blocks, setBlocks]       = useState<ScheduleBlock[]>([]);
  const [error, setError]         = useState<string>("");
  const [now, setNow]             = useState(new Date());

  // 1-second tick
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch class + schedule once
  useEffect(() => {
    if (!nameOrId) { setError(""); setBlocks([]); setClassName(""); return; }
    setError("");
    fetch(`${BASE}/board/class/${encodeURIComponent(nameOrId)}`)
      .then(r => r.ok ? r.json() : r.json().then((e:any) => Promise.reject(e.error || "Not found")))
      .then((d: { id: string; name: string; schedule: ScheduleBlock[] }) => {
        setClassName(d.name || "");
        setBlocks(Array.isArray(d.schedule) ? d.schedule : []);
      })
      .catch((e: any) => setError(String(e)));
  }, [nameOrId]);

  const nowMins   = now.getHours()*60 + now.getMinutes();
  const today     = blocks.filter(b => isToday(b, now));
  const current   = findCurrentBlock(blocks, now);

  const next = today.find(b => toMins(b.start_time) > nowMins) ?? null;
  const nextSecs = next
    ? Math.max(0, toMins(next.start_time)*60 - nowSecs(now))
    : null;

  const nextCoding = today.find(
    b => b.subject === "coding_art_gym" && toMins(b.start_time) > nowMins
  ) ?? null;
  const codingSecs = nextCoding
    ? Math.max(0, toMins(nextCoding.start_time)*60 - nowSecs(now))
    : null;

  const isCodingNow = current?.subject === "coding_art_gym";
  const icon = current ? blockIcon(current) : "🏫";

  const clockStr = now.toLocaleTimeString("en-US",
    { hour:"numeric", minute:"2-digit", second:"2-digit", hour12:true });
  const dateStr  = now.toLocaleDateString("en-US",
    { weekday:"long", month:"long", day:"numeric" });

  // ── No class configured ────────────────────────────────────────────────────
  if (!nameOrId) {
    return (
      <Wrap>
        <div style={{ textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
          <div style={{ fontSize:72 }}>📺</div>
          <div style={{ fontFamily:"Fraunces, serif", fontSize:40, fontWeight:800, color:CREAM }}>
            Board Kiosk
          </div>
          <div style={{ color:CREAM60, fontSize:16 }}>
            Go to <code style={{ background:"rgba(248,236,210,0.1)", padding:"3px 10px", borderRadius:6 }}>
              /board?class=star
            </code> or <code style={{ background:"rgba(248,236,210,0.1)", padding:"3px 10px", borderRadius:6 }}>
              /board/&lt;classId&gt;
            </code>
          </div>
        </div>
      </Wrap>
    );
  }

  if (error) {
    return (
      <Wrap>
        <div style={{ textAlign:"center", color:CREAM60, fontSize:20 }}>
          Class "{nameOrId}" not found
        </div>
      </Wrap>
    );
  }

  return (
    <div style={{
      background: NAVY,
      color: CREAM,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "Inter, sans-serif",
    }}>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 40px",
        borderBottom:"1px solid rgba(248,236,210,0.07)",
        flexShrink:0,
      }}>
        <div style={{
          fontFamily:"Fraunces, serif",
          fontWeight:800,
          fontSize:22,
          color:MARIGOLD,
          letterSpacing:"0.02em",
        }}>
          {className || "—"}
        </div>
        <div style={{ color:CREAM60, fontSize:15, fontWeight:500 }}>{dateStr}</div>
        <div style={{
          fontVariantNumeric:"tabular-nums",
          fontSize:21,
          fontWeight:700,
          color:CREAM,
        }}>
          {clockStr}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", minHeight:0 }}>

        {/* Hero — current block */}
        <div style={{
          flex:1,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:"32px 60px",
          gap:12,
        }}>
          {current ? (
            <>
              {/* Block badge */}
              <div style={{
                fontSize:11, fontWeight:800,
                letterSpacing:"0.18em", textTransform:"uppercase",
                color: current.is_break ? MARIGOLD : CREAM60,
                background: current.is_break ? GOLD_BG : "rgba(248,236,210,0.07)",
                padding:"4px 18px", borderRadius:100,
              }}>
                NOW · Block {current.block_number}
              </div>

              {/* Emoji */}
              <div style={{ fontSize:96, lineHeight:1, userSelect:"none", marginTop:4 }}>
                {icon}
              </div>

              {/* Label — Fraunces ~120px */}
              <div style={{
                fontFamily:"Fraunces, serif",
                fontSize:"clamp(56px, 8.5vw, 120px)",
                fontWeight:800,
                lineHeight:1.0,
                textAlign:"center",
                letterSpacing:"-0.02em",
                color:CREAM,
              }}>
                {current.label}
              </div>

              {/* Time range */}
              <div style={{ fontSize:17, color:CREAM60, fontWeight:500, fontVariantNumeric:"tabular-nums" }}>
                {fmt12(current.start_time)} – {fmt12(current.end_time)}
              </div>

              {/* Countdown to next */}
              {next && nextSecs !== null && (
                <div style={{
                  marginTop:8,
                  fontSize:26, fontWeight:700,
                  fontVariantNumeric:"tabular-nums",
                  color:CREAM,
                  display:"flex", alignItems:"center", gap:10,
                }}>
                  <span style={{ fontSize:24 }}>⏱</span>
                  <span>
                    <span style={{ color:MARIGOLD }}>{fmtCountdown(nextSecs)}</span>
                    {" "}
                    <span style={{ fontWeight:500, color:CREAM60, fontSize:20 }}>
                      until next block
                    </span>
                  </span>
                </div>
              )}

              {/* Next up chip */}
              {next && (
                <div style={{
                  display:"inline-flex", alignItems:"center", gap:8,
                  background:"rgba(248,236,210,0.08)",
                  border:"1px solid rgba(248,236,210,0.14)",
                  borderRadius:100,
                  padding:"6px 18px",
                  fontSize:15, color:CREAM60,
                }}>
                  <span style={{ color:CREAM35, fontSize:12, fontWeight:700,
                    letterSpacing:"0.12em", textTransform:"uppercase" }}>
                    Next up
                  </span>
                  <span style={{ fontWeight:600, color:CREAM }}>
                    {blockIcon(next)} {next.label}
                  </span>
                </div>
              )}

              {/* Free-time countdown */}
              <div style={{ marginTop:6, fontSize:15, color:CREAM60, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:18 }}>🎨</span>
                {isCodingNow ? (
                  <span style={{ fontWeight:800, color:MARIGOLD, fontSize:17 }}>
                    Free Time is NOW — Coding · Art · Gym
                  </span>
                ) : nextCoding && codingSecs !== null ? (
                  <span>
                    Free time unlocks in:{" "}
                    <span style={{ fontWeight:700, color:MARIGOLD, fontVariantNumeric:"tabular-nums" }}>
                      {fmtCountdown(codingSecs)}
                    </span>
                  </span>
                ) : (
                  <span style={{ color:CREAM35 }}>No more free time today</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:80, userSelect:"none" }}>🏫</div>
              <div style={{
                fontFamily:"Fraunces, serif",
                fontSize:52, fontWeight:800,
                color:CREAM60, textAlign:"center",
              }}>
                No active block
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ width:1, background:"rgba(248,236,210,0.07)", flexShrink:0 }} />

        {/* Right sidebar — full schedule */}
        <div style={{
          width:300,
          display:"flex", flexDirection:"column",
          padding:"20px 18px",
          gap:3,
          overflowY:"auto",
          flexShrink:0,
        }}>
          <div style={{
            fontSize:10, fontWeight:800,
            letterSpacing:"0.16em", textTransform:"uppercase",
            color:CREAM35, marginBottom:8, paddingLeft:4,
          }}>
            Today
          </div>

          {today.length === 0 && (
            <div style={{ color:CREAM35, fontSize:13, padding:"8px 4px" }}>
              No blocks found.
            </div>
          )}

          {today.map(b => {
            const start = toMins(b.start_time);
            const end   = toMins(b.end_time);
            const isPast    = end <= nowMins && !(start===end && nowMins===start);
            const isCurrent = b.id === current?.id;

            return (
              <div key={b.id} style={{
                display:"flex", alignItems:"center", gap:9,
                padding:"8px 10px",
                borderRadius:8,
                background: isCurrent ? GOLD_BG : "rgba(248,236,210,0.03)",
                border: isCurrent ? GOLD_BDR : NONE_BDR,
                opacity: isPast ? 0.35 : 1,
              }}>
                <span style={{
                  fontSize:16, width:20, textAlign:"center", flexShrink:0,
                  color: isPast ? CREAM35 : CREAM,
                }}>
                  {isPast ? "✓" : blockIcon(b)}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{
                    fontSize:12,
                    fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? CREAM : isPast ? CREAM35 : CREAM60,
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                  }}>
                    {b.label}
                  </div>
                  <div style={{
                    fontSize:10, color:CREAM35,
                    fontVariantNumeric:"tabular-nums", marginTop:1,
                  }}>
                    {fmt12(b.start_time)}
                    {b.start_time !== b.end_time ? ` – ${fmt12(b.end_time)}` : ""}
                  </div>
                </div>
                {isCurrent && (
                  <span style={{
                    fontSize:8, fontWeight:900,
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    color:MARIGOLD, flexShrink:0,
                  }}>
                    NOW
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background:"#0d1b2a", color:"#f8ecd2",
      minHeight:"100vh",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"Inter, sans-serif",
    }}>
      {children}
    </div>
  );
}
