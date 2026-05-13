// Board-side Groups panel. Adds a 👥 toggle button to the ClassroomBoard
// header that opens a full-screen slide-over showing each group's
// roster as big projector-friendly cards with the same flashing
// animation set as /star → Groups (shimmer border, breathing pulse,
// sheen sweep, aurora background, twinkle). Read-only on the board
// — the teacher edits over on /star → Groups.

import { useEffect, useState } from "react";
import { StarStore, type StarStudent, type StudentGroup } from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { tokens as T } from "../../lib/star/theme.ts";

// External handle so the ClassroomBoard header renders the toggle.
let _setOpen: ((v: boolean) => void) | null = null;
let _getOpen: (() => boolean) | null = null;
export function toggleGroupsPanel() { if (_setOpen && _getOpen) _setOpen(!_getOpen()); }
export function isGroupsPanelOpen() { return !!_getOpen?.(); }

const ANIM = `
  @keyframes bgrpShimmer {
    0%   { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  @keyframes bgrpPulse {
    0%,100% { box-shadow: 0 0 0 1px var(--gc), 0 14px 36px -10px var(--gc); }
    50%     { box-shadow: 0 0 0 2px var(--gc), 0 24px 56px -10px var(--gc); }
  }
  @keyframes bgrpFloat {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes bgrpSheen {
    0%   { transform: translateX(-180%) skewX(-22deg); opacity: 0; }
    8%   { opacity: 0.55; }
    18%  { transform: translateX(220%) skewX(-22deg); opacity: 0; }
    100% { transform: translateX(220%) skewX(-22deg); opacity: 0; }
  }
  @keyframes bgrpTwinkle {
    0%,100% { opacity: 0.6; transform: scale(1); }
    50%     { opacity: 1;   transform: scale(1.18); }
  }
  @keyframes bgrpAurora {
    0%   { transform: translate3d(-6%, 0, 0) scale(1.05); }
    50%  { transform: translate3d( 6%, 2%, 0) scale(1.10); }
    100% { transform: translate3d(-6%, 0, 0) scale(1.05); }
  }
  @keyframes bgrpRing {
    0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.45); }
    50%     { box-shadow: 0 0 0 6px rgba(168,85,247,0.00); }
  }
  @keyframes bgrpOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes bgrpSheetIn   { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;

export default function BoardGroupsPanel() {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<StudentGroup[]>(() => StarStore.getGroups());
  const [students, setStudents] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  _setOpen = setOpen;
  _getOpen = () => open;

  // Hydrate avatars once when the panel opens — keeps the bundle
  // small for the projector when nobody's looking at groups.
  useEffect(() => {
    if (!open) return;
    setGroups(StarStore.getGroups());
    setStudents(StarStore.getStudents());
    (async () => {
      try {
        const accts = await api.listStudentAccounts();
        const map: Record<string, string | null> = {};
        for (const a of accts || []) map[a.id] = a.avatarUrl;
        setAvatars(map);
      } catch {}
    })();
  }, [open]);

  // Re-read groups every 30s so Supabase changes propagate to the
  // projector without anyone closing the panel.
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => setGroups(StarStore.getGroups()), 30_000);
    return () => clearInterval(iv);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="STAR Room Groups"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        position: "fixed", inset: 0, zIndex: 240,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)",
        animation: "bgrpOverlayIn 240ms ease-out",
      }}
    >
      <style>{ANIM}</style>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        animation: "bgrpSheetIn 420ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        {/* Aurora background */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: -120, pointerEvents: "none", zIndex: 0,
            background:
              "radial-gradient(900px 480px at 20% 20%, rgba(168,85,247,0.25), transparent 60%)," +
              "radial-gradient(700px 460px at 80% 70%, rgba(236,72,153,0.22), transparent 60%)," +
              "radial-gradient(700px 380px at 50% 100%, rgba(99,102,241,0.22), transparent 60%)",
            animation: "bgrpAurora 18s ease-in-out infinite",
            filter: "blur(8px)",
          }}
        />

        {/* HEADER */}
        <header style={{
          position: "relative", zIndex: 1,
          padding: "26px 36px 16px",
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          borderBottom: "1px solid rgba(168,85,247,0.25)",
          fontFamily: T.font.family,
          color: "#fce7f3",
          gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.34em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 4 }}>
              <span style={{ display: "inline-block", animation: "bgrpTwinkle 2.4s ease-in-out infinite" }}>✦</span>
              &nbsp;STAR Room
            </div>
            <h2 style={{ margin: 0, fontSize: 44, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              Group Roster
            </h2>
            <div style={{ marginTop: 6, fontSize: 14, color: "rgba(245,241,232,0.7)" }}>
              {groups.length} group{groups.length === 1 ? "" : "s"} · {students.length} students · live from /star → Groups
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "12px 18px", borderRadius: 12,
              background: "rgba(168,85,247,0.16)",
              border: "1px solid rgba(168,85,247,0.45)",
              color: "#fce7f3", fontWeight: 900, fontSize: 14,
              cursor: "pointer", letterSpacing: "0.06em",
            }}
          >✕ Close</button>
        </header>

        {/* GROUP GRID */}
        <main style={{
          position: "relative", zIndex: 1,
          flex: 1, overflow: "auto",
          padding: "24px 36px 36px",
        }}>
          {groups.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(245,241,232,0.55)", marginTop: 80, fontSize: 18 }}>
              No groups defined yet. Open <b style={{ color: "#f9a8d4" }}>/star → Groups</b> on the teacher device to create some.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: gridTemplateForCount(groups.length),
              gap: 22,
              maxWidth: 1600, margin: "0 auto",
            }}>
              {groups.map((g) => (
                <GroupBoardCard key={g.id} group={g} students={students} avatars={avatars} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Pick a grid template that looks balanced for the number of groups.
function gridTemplateForCount(n: number): string {
  if (n <= 2) return "repeat(2, minmax(0, 1fr))";
  if (n === 3) return "repeat(3, minmax(0, 1fr))";
  if (n === 4) return "repeat(2, minmax(0, 1fr))";
  if (n <= 6) return "repeat(3, minmax(0, 1fr))";
  return "repeat(auto-fit, minmax(360px, 1fr))";
}

function GroupBoardCard({ group, students, avatars }: {
  group: StudentGroup;
  students: StarStudent[];
  avatars: Record<string, string | null>;
}) {
  const c = group.color;
  const members = group.studentIds
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is StarStudent => !!s);

  return (
    <div style={{
      position: "relative",
      borderRadius: 24,
      padding: 22,
      background:
        `linear-gradient(135deg, ${c}26 0%, rgba(0,0,0,0.60) 60%), rgba(0,0,0,0.70)`,
      ["--gc" as any]: `${c}66`,
      border: `1.5px solid ${c}88`,
      animation: "bgrpPulse 4s ease-in-out infinite, bgrpFloat 420ms ease-out",
      overflow: "hidden",
      minHeight: 280,
      fontFamily: T.font.family,
      color: "#fce7f3",
    }}>
      {/* Animated rainbow border sheen */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, padding: 1.5, borderRadius: 24,
          background: `linear-gradient(90deg, ${c} 0%, transparent 25%, transparent 75%, ${c} 100%)`,
          backgroundSize: "200% 100%",
          animation: "bgrpShimmer 8s linear infinite",
          opacity: 0.5,
          pointerEvents: "none",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor", maskComposite: "exclude",
        }}
      />
      {/* Diagonal sheen */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "55%",
          background: "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.10) 50%, transparent 70%)",
          animation: "bgrpSheen 7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* HEADER */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: `linear-gradient(135deg, ${c}, ${c}55)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 42, lineHeight: 1, flexShrink: 0,
          boxShadow: `0 12px 28px -8px ${c}aa, inset 0 0 0 1px rgba(255,255,255,0.16)`,
        }}>{group.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 32, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.05,
            textShadow: `0 0 22px ${c}77`,
          }}>{group.name}</div>
          {group.subject && (
            <div style={{
              fontSize: 12, fontWeight: 800, color: c,
              letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3,
            }}>{group.subject}</div>
          )}
        </div>
        <div style={{
          minWidth: 52, height: 52, padding: "0 16px",
          borderRadius: 999,
          background: `${c}22`, border: `1.5px solid ${c}cc`,
          color: c, fontWeight: 900, fontSize: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          animation: "bgrpRing 2.2s ease-in-out infinite",
        }}>{members.length}</div>
      </div>

      {/* MEMBERS */}
      {members.length === 0 ? (
        <div style={{
          padding: "24px 14px", textAlign: "center", borderRadius: 14,
          background: "rgba(0,0,0,0.40)", border: `1px dashed ${c}55`,
          color: "rgba(245,241,232,0.55)", fontSize: 14, fontStyle: "italic",
        }}>
          No kids assigned yet.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: members.length <= 4
            ? `repeat(${members.length}, minmax(0, 1fr))`
            : "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 10, position: "relative",
        }}>
          {members.map((s) => {
            const avatarUrl = avatars[s.id] || null;
            const initial = (s.firstName || "?")[0].toUpperCase();
            return (
              <div key={s.id} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "12px 8px", borderRadius: 14,
                background: `${c}1a`, border: `1px solid ${c}66`,
              }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{
                    width: 72, height: 72, borderRadius: "50%", objectFit: "cover",
                    boxShadow: `0 6px 16px -4px ${c}88`,
                  }} />
                ) : (
                  <div style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${c}, ${c}55)`,
                    color: "white", fontWeight: 900, fontSize: 30,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 6px 16px -4px ${c}88`,
                  }}>{initial}</div>
                )}
                <div style={{
                  fontSize: 14, fontWeight: 800, color: "#fce7f3",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: "100%", textAlign: "center",
                }}>{s.firstName}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
