// Groups Manager — visual roster + group cards for the STAR Room.
//
// Matches the projector board's violet/pink/indigo identity. Each
// group card has a slow border shimmer + a soft pulsing glow so the
// page feels alive on the projector (the user asked for "flashing
// things"). Member tiles also breathe gently. Roster panel below
// lists every kid + which groups they're in.
//
// Storage: lives in localStorage under "star_groups" with a tiny
// type (see storage.ts). No server sync yet — groups are per-device
// for now, mirroring the rest of the STAR data before the recent
// Supabase migration. Easy to add later.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, type StarStudent, type StudentGroup, DEFAULT_GROUPS,
} from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

const ROSTER_ACCENT = "#a855f7";

// Animation set lifted from the projector board so visual rhythm is
// consistent. shimmer = slow rainbow sweep on the border; pulseGlow
// = soft outer halo; floatIn = entrance; sheen = diagonal light
// streak across cards every 7s.
const ANIM = `
  @keyframes grpShimmer {
    0%   { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  @keyframes grpPulse {
    0%,100% { box-shadow: 0 0 0 1px var(--gc), 0 14px 36px -10px var(--gc); }
    50%     { box-shadow: 0 0 0 2px var(--gc), 0 22px 48px -12px var(--gc); }
  }
  @keyframes grpFloat {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes grpSheen {
    0%   { transform: translateX(-180%) skewX(-22deg); opacity: 0; }
    8%   { opacity: 0.55; }
    18%  { transform: translateX(220%) skewX(-22deg); opacity: 0; }
    100% { transform: translateX(220%) skewX(-22deg); opacity: 0; }
  }
  @keyframes grpStarTwinkle {
    0%,100% { opacity: 0.6; transform: scale(1); }
    50%     { opacity: 1;   transform: scale(1.18); }
  }
  @keyframes grpAurora {
    0%   { transform: translate3d(-6%, 0, 0) scale(1.05); }
    50%  { transform: translate3d( 6%, 2%, 0) scale(1.10); }
    100% { transform: translate3d(-6%, 0, 0) scale(1.05); }
  }
  @keyframes grpRing {
    0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.45); }
    50%     { box-shadow: 0 0 0 6px rgba(168,85,247,0.00); }
  }
`;

export default function GroupsManager() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [groups, setGroups] = useState<StudentGroup[]>(() => StarStore.getGroups());
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickingForGroup, setPickingForGroup] = useState<string | null>(null);

  // Hydrate avatars from /auth/students so the group cards show real
  // photos. Falls back to a colored initial if the call fails or the
  // kid doesn't have an avatar uploaded.
  useEffect(() => {
    (async () => {
      try {
        const accts = await api.listStudentAccounts();
        const map: Record<string, string | null> = {};
        for (const a of accts || []) map[a.id] = a.avatarUrl;
        setAvatars(map);
      } catch {}
    })();
  }, []);

  // Pull groups from Supabase on mount + every 30s so a rename or
  // membership change on one device shows up on every other device
  // without anyone reloading. Group writes were already server-bound
  // via _syncPush in storage.ts; reads were the missing piece.
  useEffect(() => {
    const refresh = async () => {
      try {
        const { pullGroups } = await import("../../lib/star/supabaseSync.ts");
        await pullGroups();
        setGroups(StarStore.getGroups());
      } catch {}
    };
    refresh();
    const iv = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(iv);
  }, []);

  // Build "studentId → groupId[]" map for the roster panel badges.
  const memberships = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const g of groups) for (const sid of g.studentIds) {
      (m[sid] ||= []).push(g.id);
    }
    return m;
  }, [groups]);

  const unassigned = useMemo(
    () => students.filter((s) => !(memberships[s.id] && memberships[s.id].length)),
    [students, memberships],
  );

  const save = (next: StudentGroup[]) => {
    setGroups(next);
    StarStore.setGroups(next);
  };

  const toggle = (groupId: string, studentId: string) => {
    StarStore.toggleStudentInGroup(groupId, studentId);
    setGroups(StarStore.getGroups());
    loggedBeep();
  };

  const addGroup = () => {
    const palette = ["#f59e0b", "#ec4899", "#a855f7", "#6366f1", "#22c55e", "#38bdf8", "#f43f5e"];
    const used = new Set(groups.map((g) => g.color));
    const color = palette.find((c) => !used.has(c)) || palette[groups.length % palette.length];
    const g: StudentGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "New group",
      emoji: "✨",
      color,
      studentIds: [],
      subject: "",
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };
    save([...groups, g]);
    successBeep();
    setEditingId(g.id);
  };

  const updateGroup = (id: string, patch: Partial<StudentGroup>) => {
    save(groups.map((g) => (g.id === id ? { ...g, ...patch, updatedDate: new Date().toISOString() } : g)));
  };

  const removeGroup = (id: string) => {
    if (!window.confirm("Delete this group? Members will become unassigned.")) return;
    save(groups.filter((g) => g.id !== id));
  };

  const resetToDefaults = () => {
    if (!window.confirm("Reset to the starter Stars / Comets / Rockets / Galaxies groups? Your current setup will be replaced.")) return;
    save(DEFAULT_GROUPS.map((g) => ({ ...g, createdDate: new Date().toISOString(), updatedDate: new Date().toISOString() })));
  };

  const studentChip = (s: StarStudent, opts?: { onTap?: () => void; small?: boolean }) => {
    const avatarUrl = avatars[s.id] || null;
    const initial = (s.firstName || "?")[0].toUpperCase();
    const size = opts?.small ? 30 : 44;
    return (
      <div
        key={s.id}
        onClick={opts?.onTap}
        title={`${s.firstName} ${s.lastName}${s.grade ? ` (${s.grade})` : ""}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: opts?.small ? "4px 10px 4px 4px" : "5px 14px 5px 5px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.10)",
          cursor: opts?.onTap ? "pointer" : "default",
          transition: "transform 140ms, border-color 140ms",
        }}
        onMouseEnter={(e) => {
          if (!opts?.onTap) return;
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(168,85,247,0.55)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.10)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: size, height: size, borderRadius: "50%",
            background: `linear-gradient(135deg, ${ROSTER_ACCENT}, #ec4899)`,
            color: "white", fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: opts?.small ? 12 : 18, flexShrink: 0,
          }}>{initial}</div>
        )}
        <span style={{
          color: "#fce7f3", fontWeight: 800,
          fontSize: opts?.small ? 12 : 14,
          maxWidth: opts?.small ? 110 : 150,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{s.firstName}</span>
      </div>
    );
  };

  return (
    <div style={{ color: "#f5f1e8", position: "relative", overflow: "hidden" }}>
      <style>{ANIM}</style>

      {/* Aurora background — soft moving glow lives behind the cards
          so the page has motion even when nothing's been tapped. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: -120, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(900px 480px at 20% 20%, rgba(168,85,247,0.20), transparent 60%)," +
            "radial-gradient(700px 460px at 80% 70%, rgba(236,72,153,0.18), transparent 60%)," +
            "radial-gradient(600px 380px at 50% 100%, rgba(99,102,241,0.18), transparent 60%)",
          animation: "grpAurora 18s ease-in-out infinite",
          filter: "blur(6px)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.30em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 4 }}>
              <span style={{ display: "inline-block", animation: "grpStarTwinkle 2.4s ease-in-out infinite" }}>✦</span>
              &nbsp;STAR Room
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.01em", color: "#fce7f3", lineHeight: 1.1 }}>
              Group Roster
            </div>
            <div style={{ fontSize: 13, color: "rgba(245,241,232,0.65)", marginTop: 4 }}>
              {groups.length} group{groups.length === 1 ? "" : "s"} · {students.length} students · tap a card to add or remove kids
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addGroup} style={primary()}>＋ New group</button>
            <button onClick={resetToDefaults} style={ghost()}>↺ Reset</button>
            <button onClick={() => openGroupsPrint(groups, students, avatars)} style={ghost()}>🖨 Print poster</button>
          </div>
        </div>

        {/* GROUP CARDS — auto-fit grid so 2 or 6 cards both look right */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 16,
          marginBottom: 22,
        }}>
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              students={students}
              avatars={avatars}
              editing={editingId === g.id}
              picking={pickingForGroup === g.id}
              onEdit={() => setEditingId(editingId === g.id ? null : g.id)}
              onPick={() => setPickingForGroup(pickingForGroup === g.id ? null : g.id)}
              onChange={(patch) => updateGroup(g.id, patch)}
              onRemove={() => removeGroup(g.id)}
              onToggle={(sid) => toggle(g.id, sid)}
            />
          ))}
        </div>

        {/* ROSTER — every kid with their group badges */}
        <div style={{
          padding: 16, borderRadius: 16,
          background: "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))",
          border: "1px solid rgba(168,85,247,0.30)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Sheen sweep on the roster panel every 10s */}
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
              animation: "grpSheen 10s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#f9a8d4" }}>
              📋 Class roster
            </div>
            <div style={{ fontSize: 11, color: "rgba(245,241,232,0.55)" }}>
              {students.length - unassigned.length} of {students.length} placed · {unassigned.length} unassigned
            </div>
          </div>

          {unassigned.length > 0 && (
            <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed rgba(255,255,255,0.10)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", color: "#fde68a", marginBottom: 8 }}>
                Not in any group yet
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {unassigned.map((s) => studentChip(s, { small: true }))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8, position: "relative" }}>
            {students.map((s) => {
              const inGroups = (memberships[s.id] || []).map((id) => groups.find((g) => g.id === id)).filter(Boolean) as StudentGroup[];
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 10,
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  {studentChip(s, { small: true })}
                  <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                    {inGroups.length === 0 ? (
                      <span style={{ fontSize: 10, color: "rgba(245,241,232,0.45)", fontStyle: "italic" }}>—</span>
                    ) : (
                      inGroups.map((g) => (
                        <span key={g.id} title={g.name} style={{
                          padding: "2px 8px", borderRadius: 999,
                          background: `${g.color}1f`,
                          border: `1px solid ${g.color}aa`,
                          color: g.color, fontSize: 11, fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}>{g.emoji} {g.name}</span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Group card ─────────────────────────────────────────────────── */

function GroupCard({ group, students, avatars, editing, picking, onEdit, onPick, onChange, onRemove, onToggle }: {
  group: StudentGroup;
  students: StarStudent[];
  avatars: Record<string, string | null>;
  editing: boolean;
  picking: boolean;
  onEdit: () => void;
  onPick: () => void;
  onChange: (patch: Partial<StudentGroup>) => void;
  onRemove: () => void;
  onToggle: (studentId: string) => void;
}) {
  const c = group.color;
  const members = group.studentIds
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is StarStudent => !!s);

  return (
    <div style={{
      position: "relative",
      borderRadius: 18,
      padding: 16,
      background:
        `linear-gradient(135deg, ${c}22 0%, rgba(0,0,0,0.55) 60%), rgba(0,0,0,0.65)`,
      // The animated colored aura — CSS var --gc lets the keyframe
      // re-use the group's color without inlining it per keyframe.
      ["--gc" as any]: `${c}55`,
      border: `1px solid ${c}77`,
      animation: "grpPulse 4s ease-in-out infinite, grpFloat 360ms ease-out",
      overflow: "hidden",
    }}>
      {/* Animated rainbow border sheen — sweeps slowly across the
          top edge so the card feels alive without distracting. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, padding: 1, borderRadius: 18,
          background: `linear-gradient(90deg, ${c} 0%, transparent 25%, transparent 75%, ${c} 100%)`,
          backgroundSize: "200% 100%",
          animation: "grpShimmer 8s linear infinite",
          opacity: 0.45,
          pointerEvents: "none",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor", maskComposite: "exclude",
        }}
      />
      {/* Sheen across the whole card every 7s */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "55%",
          background: "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
          animation: "grpSheen 7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* HEADER */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 54, height: 54, borderRadius: 14,
          background: `linear-gradient(135deg, ${c}, ${c}55)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, lineHeight: 1, flexShrink: 0,
          boxShadow: `0 8px 22px -6px ${c}88, inset 0 0 0 1px rgba(255,255,255,0.12)`,
        }}>{group.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={group.name}
              onChange={(e) => onChange({ name: e.target.value })}
              style={{
                background: "rgba(0,0,0,0.45)", color: "#fce7f3", border: `1px solid ${c}`, borderRadius: 6,
                padding: "4px 8px", fontSize: 22, fontWeight: 900, width: "100%", outline: "none",
              }}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fce7f3", letterSpacing: "-0.01em", lineHeight: 1.1, textShadow: `0 0 14px ${c}66` }}>
              {group.name}
            </div>
          )}
          {editing ? (
            <input
              value={group.subject || ""}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Reading group / Math centers / ..."
              style={{
                background: "rgba(0,0,0,0.30)", color: "rgba(245,241,232,0.85)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6,
                padding: "3px 8px", fontSize: 11, fontWeight: 700, width: "100%", outline: "none", marginTop: 4,
              }}
            />
          ) : group.subject ? (
            <div style={{ fontSize: 11, fontWeight: 700, color: c, letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              {group.subject}
            </div>
          ) : null}
        </div>
        <div style={{
          minWidth: 40, height: 40, padding: "0 10px",
          borderRadius: 999,
          background: `${c}22`, border: `1px solid ${c}aa`,
          color: c, fontWeight: 900, fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          animation: "grpRing 2.2s ease-in-out infinite",
        }}>{members.length}</div>
      </div>

      {/* CARD CONTROLS */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onPick} style={cardChip(picking, c)}>
          {picking ? "✕ Done adding" : "＋ Add kids"}
        </button>
        <button onClick={onEdit} style={cardChip(editing, c)}>
          {editing ? "✓ Save" : "✎ Rename"}
        </button>
        {editing && (
          <>
            <input
              value={group.emoji}
              onChange={(e) => onChange({ emoji: e.target.value.slice(0, 2) })}
              title="Group emoji"
              style={{
                width: 44, textAlign: "center",
                background: "rgba(0,0,0,0.45)", color: "#fce7f3",
                border: `1px solid ${c}aa`, borderRadius: 6, fontSize: 18,
                padding: "4px 0", outline: "none",
              }}
            />
            <input
              type="color"
              value={group.color}
              onChange={(e) => onChange({ color: e.target.value })}
              title="Group color"
              style={{
                width: 44, height: 32, padding: 0,
                background: "transparent", border: `1px solid ${c}aa`, borderRadius: 6, cursor: "pointer",
              }}
            />
            <button onClick={onRemove} style={{ ...cardChip(false, "#f87171"), marginLeft: "auto" }}>🗑 Delete</button>
          </>
        )}
      </div>

      {/* MEMBERS */}
      {members.length === 0 ? (
        <div style={{
          padding: "20px 12px", textAlign: "center", borderRadius: 12,
          background: "rgba(0,0,0,0.35)", border: `1px dashed ${c}55`,
          color: "rgba(245,241,232,0.55)", fontSize: 12, fontStyle: "italic",
        }}>
          No kids yet — tap <b style={{ color: c }}>＋ Add kids</b> to drop some in.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, position: "relative" }}>
          {members.map((s) => {
            const avatarUrl = avatars[s.id] || null;
            const initial = (s.firstName || "?")[0].toUpperCase();
            return (
              <div
                key={s.id}
                onClick={() => onToggle(s.id)}
                title={`${s.firstName} ${s.lastName} — tap to remove from group`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px 4px 4px",
                  borderRadius: 999,
                  background: `${c}1a`, border: `1px solid ${c}aa`,
                  cursor: "pointer",
                  transition: "transform 140ms",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${c}, ${c}55)`,
                    color: "white", fontWeight: 900, fontSize: 11,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{initial}</div>
                )}
                <span style={{ color: "#fce7f3", fontWeight: 800, fontSize: 12 }}>{s.firstName}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* PICK DRAWER — opens when "Add kids" is on */}
      {picking && (
        <div style={{
          marginTop: 14, padding: 10, borderRadius: 12,
          background: "rgba(0,0,0,0.50)",
          border: `1px solid ${c}66`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: c, marginBottom: 8 }}>
            Tap a kid to add or remove
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {students.map((s) => {
              const inGroup = group.studentIds.includes(s.id);
              const avatarUrl = avatars[s.id] || null;
              const initial = (s.firstName || "?")[0].toUpperCase();
              return (
                <div
                  key={s.id}
                  onClick={() => onToggle(s.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "3px 10px 3px 3px", borderRadius: 999,
                    background: inGroup ? `${c}26` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${inGroup ? c : "rgba(255,255,255,0.10)"}`,
                    cursor: "pointer",
                    opacity: inGroup ? 1 : 0.7,
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: `linear-gradient(135deg, ${c}, ${c}55)`,
                      color: "white", fontWeight: 900, fontSize: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{initial}</div>
                  )}
                  <span style={{ color: inGroup ? "#fce7f3" : "rgba(245,241,232,0.75)", fontWeight: 700, fontSize: 11 }}>
                    {s.firstName}
                  </span>
                  {inGroup && <span style={{ color: c, fontWeight: 900, fontSize: 12 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Print poster ───────────────────────────────────────────────── */

// Renders all groups as a single landscape poster the teacher can
// print + tape to the wall. Same gradient styling as the on-screen
// cards (with print-color-adjust so the borders survive printing).
function openGroupsPrint(groups: StudentGroup[], students: StarStudent[], avatars: Record<string, string | null>) {
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) { alert("Pop-up blocked — allow pop-ups for this site, then tap Print again."); return; }
  const cardHtml = (g: StudentGroup) => {
    const members = g.studentIds.map((id) => students.find((s) => s.id === id)).filter(Boolean) as StarStudent[];
    return `<div class="card" style="--c:${g.color}">
      <div class="hd">
        <div class="emo">${escapeHtml(g.emoji)}</div>
        <div class="title-block">
          <div class="ttl">${escapeHtml(g.name)}</div>
          ${g.subject ? `<div class="sub">${escapeHtml(g.subject)}</div>` : ""}
        </div>
        <div class="count">${members.length}</div>
      </div>
      <div class="members">${members.length === 0
        ? `<div class="empty">No kids assigned</div>`
        : members.map((s) => {
            const url = avatars[s.id] || "";
            const ini = (s.firstName || "?")[0].toUpperCase();
            const avatar = url
              ? `<img src="${escapeHtml(url)}" alt="" />`
              : `<div class="ini">${escapeHtml(ini)}</div>`;
            return `<div class="m">${avatar}<span>${escapeHtml(s.firstName)}</span></div>`;
          }).join("")}
      </div>
    </div>`;
  };
  w.document.write(`<!doctype html><html><head><title>STAR Room Groups</title>
    <style>
      *,*::before,*::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @media print { @page { size: letter landscape; margin: 0.4in; } .no-print { display: none; } body { background: white; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0; background: #f5f3ff; color: #1f1235; }
      .toolbar { padding: 14px 24px; background: #6d28d9; color: white; display: flex; justify-content: space-between; align-items: center; }
      .toolbar button { padding: 10px 20px; border-radius: 8px; border: none; background: white; color: #6d28d9; font-weight: 800; cursor: pointer; }
      .sheet { padding: 24px; max-width: 10.4in; margin: 0 auto; }
      .hdr { text-align: center; margin-bottom: 18px; }
      .hdr .kicker { font-size: 11px; font-weight: 800; letter-spacing: 0.34em; text-transform: uppercase; color: #6d28d9; }
      .hdr h1 { margin: 4px 0 0; font-size: 30px; letter-spacing: -0.02em; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
      .card { border: 2px solid var(--c); border-radius: 14px; padding: 14px; background: white; page-break-inside: avoid; position: relative; box-shadow: 0 6px 14px -8px rgba(0,0,0,0.20); }
      .hd { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
      .emo { width: 50px; height: 50px; border-radius: 12px; background: var(--c); color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; }
      .title-block { flex: 1; min-width: 0; }
      .ttl { font-size: 22px; font-weight: 900; color: #1f1235; }
      .sub { font-size: 10px; font-weight: 800; color: var(--c); letter-spacing: 0.12em; text-transform: uppercase; }
      .count { padding: 6px 14px; border-radius: 999px; background: var(--c); color: white; font-weight: 900; font-size: 16px; }
      .members { display: flex; flex-wrap: wrap; gap: 6px; }
      .m { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 999px; background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08); font-size: 12px; font-weight: 700; }
      .m img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
      .m .ini { width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: white; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 11px; }
      .empty { font-style: italic; color: #6b7280; font-size: 11px; padding: 6px 4px; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>👥 STAR Room Groups · prints landscape</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    <div class="sheet">
      <div class="hdr">
        <div class="kicker">★ STAR Room · Special Education ★</div>
        <h1>Group Roster</h1>
      </div>
      <div class="grid">${groups.map(cardHtml).join("")}</div>
    </div>
    <script>setTimeout(function(){try{window.focus();window.print();}catch(e){}},800)</script>
  </body></html>`);
  w.document.close();
}

/* ── styling helpers ────────────────────────────────────────────── */

function primary(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900, cursor: "pointer", fontSize: 13,
    boxShadow: "0 8px 18px -6px rgba(168,85,247,0.55)",
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(168,85,247,0.10)",
    color: "#fce7f3", border: "1px solid rgba(168,85,247,0.40)",
    fontWeight: 800, cursor: "pointer", fontSize: 12,
  };
}
function cardChip(active: boolean, c: string): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 999,
    background: active ? c : `${c}1a`,
    color: active ? "white" : c,
    border: `1px solid ${c}aa`,
    fontWeight: 800, cursor: "pointer", fontSize: 11,
    letterSpacing: "0.04em",
  };
}
function escapeHtml(s: string) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
