// Kudos Certificate — one-tap printable certificate for a kid.
// Pick the student + reason → print on cardstock. Auto-fills a kudos
// barcode the kid can scan at home/share to get a "kudos points" boost.

import { useEffect, useState } from "react";
import { StarStore, type StarStudent } from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { api } from "../../lib/api.ts";

const REASON_PRESETS = [
  "crushed it on Math today",
  "showed amazing kindness to a friend",
  "stayed focused all morning",
  "helped clean up without being asked",
  "tried again after a tough moment",
  "read a whole chapter all by themselves",
  "shared their answer in front of the class",
  "used kind words during a hard moment",
  "finished every worksheet today",
  "showed grit on a tricky problem",
];

export default function KudosCertificate() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState(REASON_PRESETS[0]);
  const [teacherName, setTeacherName] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 7 * 3600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  });

  const sel = students.find((s) => s.id === studentId);

  // Pull avatars (the kid's profile picture, NOT a snapshot of their
  // worksheet) — same source the wallet/board uses. avatar_emoji
  // and avatar_url come from the auth/students endpoint.
  const [avatars, setAvatars] = useState<Record<string, { url: string | null; emoji: string | null }>>({});
  useEffect(() => {
    (async () => {
      try {
        const accounts = await api.listStudentAccounts();
        const map: Record<string, { url: string | null; emoji: string | null }> = {};
        for (const a of accounts || []) map[a.id] = { url: a.avatarUrl, emoji: null };
        setAvatars(map);
      } catch {}
    })();
  }, []);
  const avatar = sel ? (avatars[sel.id] || { url: null, emoji: null }) : { url: null, emoji: null };

  const print = () => {
    if (!sel) return;
    openKudosWindow({
      student: sel, reason: reason.trim() || REASON_PRESETS[0],
      teacherName: teacherName.trim(), date,
      avatarUrl: avatar.url || undefined,
      avatarEmoji: avatar.emoji || undefined,
    });
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Student">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
            <option value="">— Pick a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.grade ? ` (${s.grade})` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </Field>
        <Field label="Teacher (optional)">
          <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Mrs. Imboden" style={inp()} />
        </Field>
      </div>

      <Field label="Why are they getting kudos?">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          list="kudos-reasons"
          placeholder="…crushed it on Math today"
          style={inp()}
        />
        <datalist id="kudos-reasons">
          {REASON_PRESETS.map((r) => <option key={r} value={r} />)}
        </datalist>
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={print} disabled={!sel} style={primary(!sel)}>
          🏆 Print Kudos Certificate
        </button>
      </div>

      {sel && (
        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
          💡 Print on cardstock for the fridge. Includes a barcode the kid can scan back in for a kudos points boost.
        </div>
      )}
    </div>
  );
}

function openKudosWindow(args: {
  student: StarStudent; reason: string; teacherName: string;
  date: string; avatarUrl?: string; avatarEmoji?: string;
}) {
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) return;
  const { student, reason, teacherName, date, avatarUrl, avatarEmoji } = args;
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  // Barcode encodes a kudos action — when scanned later it could be
  // wired to award kudos points. Format: KUDOS-<studentId>-<date>.
  // Smaller now (height 36, scale 1.0) so it doesn't dominate.
  const kudosBarcode = `KUDOS-${student.id}-${date.replace(/-/g, "")}`;
  const barcodeSvg = bc128svg(kudosBarcode, 0, 36, false, 1.0);

  // Avatar (profile picture) — NOT a snapshot of their work. Falls
  // back to first initial in a colored circle, then to a star.
  const initial = (student.firstName || "?")[0].toUpperCase();
  const avatarBlock = avatarUrl
    ? `<img class="avatar" src="${avatarUrl}" alt="${escapeHtml(student.firstName)}" />`
    : avatarEmoji
      ? `<div class="avatar emoji">${escapeHtml(avatarEmoji)}</div>`
      : `<div class="avatar initial">${escapeHtml(initial)}</div>`;

  w.document.write(`<!doctype html><html><head><title>Kudos — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</title>
    <style>
      @media print { @page { size: letter landscape; margin: 0.4in; } .no-print { display: none; } }
      body { font-family: "Georgia", "Times New Roman", serif; margin: 0; padding: 0; background: #fef9c3; }
      .toolbar { padding: 12px 24px; background: linear-gradient(90deg, #fef3c7, #fed7aa); border-bottom: 1px solid #fbbf24; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; font-family: -apple-system, sans-serif; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #b45309; background: #b45309; color: white; font-weight: 700; cursor: pointer; }

      .cert {
        margin: 18px auto; max-width: 9.5in; padding: 0;
        background: #fffdf5;
        border-radius: 24px;
        box-shadow: 0 24px 64px -12px rgba(120, 53, 15, 0.30);
        overflow: hidden;
        position: relative;
      }
      /* Decorative gold gradient frame */
      .frame {
        position: absolute; inset: 14px; border-radius: 14px;
        border: 3px solid transparent;
        background: linear-gradient(135deg, #f59e0b, #fbbf24, #fef3c7, #fbbf24, #f59e0b) border-box;
        -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
                mask-composite: exclude;
        pointer-events: none;
      }
      .inner { position: relative; padding: 44px 56px 36px; }

      /* Subtle starburst rays behind the hero */
      .rays {
        position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
        width: 700px; height: 320px;
        background:
          radial-gradient(ellipse 600px 200px at 50% 0%, rgba(251,191,36,0.25), transparent 70%);
        pointer-events: none;
      }

      .header { text-align: center; margin-bottom: 18px; position: relative; }
      .ribbon {
        display: inline-block; padding: 8px 28px; border-radius: 999px;
        background: linear-gradient(135deg, #b45309 0%, #d97706 50%, #b45309 100%);
        color: #fffbeb; font-size: 11px; font-weight: 900; letter-spacing: 0.34em; text-transform: uppercase;
        font-family: -apple-system, sans-serif;
        box-shadow: 0 6px 18px -4px rgba(180, 83, 9, 0.55);
      }
      h1 {
        font-size: 64px; margin: 14px 0 0; line-height: 1; letter-spacing: -0.02em; font-style: italic;
        background: linear-gradient(135deg, #92400e 0%, #b45309 50%, #d97706 100%);
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      }

      /* Hero: avatar + name + reason */
      .hero { display: flex; align-items: center; gap: 32px; margin: 28px 0 22px; }
      .avatar {
        width: 160px; height: 160px; border-radius: 50%;
        object-fit: cover;
        border: 6px solid transparent;
        background:
          linear-gradient(#fffdf5, #fffdf5) padding-box,
          linear-gradient(135deg, #f59e0b, #fbbf24, #d97706) border-box;
        box-shadow: 0 14px 32px -8px rgba(120, 53, 15, 0.45);
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .avatar.emoji { font-size: 96px; line-height: 1; }
      .avatar.initial {
        font-family: "Brush Script MT", cursive;
        font-size: 92px; color: #b45309; font-weight: 800; line-height: 1;
        background:
          linear-gradient(135deg, #fef3c7, #fed7aa) padding-box,
          linear-gradient(135deg, #f59e0b, #fbbf24, #d97706) border-box;
      }

      .info { flex: 1; min-width: 0; }
      .name {
        font-family: "Brush Script MT", "Lucida Handwriting", cursive;
        font-size: 76px; color: #b45309; line-height: 1; margin: 0 0 14px;
        letter-spacing: 0.01em;
      }
      .reason-lbl {
        font-size: 11px; font-weight: 800; color: #92400e;
        letter-spacing: 0.22em; text-transform: uppercase;
        margin-bottom: 6px; font-family: -apple-system, sans-serif;
      }
      .reason {
        font-size: 24px; color: #1f1235; line-height: 1.38; font-style: italic;
        padding: 12px 0; border-top: 2px dotted #d97706; border-bottom: 2px dotted #d97706;
      }

      /* Footer: signature · date · small barcode */
      .footer {
        margin-top: 26px;
        display: grid; grid-template-columns: 1fr auto auto;
        align-items: end; gap: 30px;
        padding-top: 18px;
      }
      .sig-line { border-bottom: 1.5px solid #78350f; height: 32px; margin-bottom: 4px; }
      .sig-name { font-size: 11px; font-weight: 700; color: #78350f; font-family: -apple-system, sans-serif; }
      .sig-lbl, .date-lbl, .bar-lbl {
        font-size: 9px; font-weight: 800; letter-spacing: 0.20em; text-transform: uppercase;
        color: #92400e; font-family: -apple-system, sans-serif; margin-bottom: 4px;
      }
      .date-val {
        font-size: 13px; color: #1f1235; font-family: -apple-system, sans-serif; font-weight: 600;
      }
      .barcode-box {
        text-align: center;
        padding: 6px 10px; border-radius: 8px;
        background: rgba(254, 243, 199, 0.45);
      }

      /* Small star accents in corners — way more refined than 4 huge corners */
      .corner-deco {
        position: absolute; font-size: 16px; color: #d97706; opacity: 0.55;
        font-family: -apple-system, sans-serif;
      }
      .corner-deco.tl { top: 24px; left: 30px; }
      .corner-deco.tr { top: 24px; right: 30px; }
      .corner-deco.bl { bottom: 24px; left: 30px; }
      .corner-deco.br { bottom: 24px; right: 30px; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>🏆 Kudos certificate ready · prints on letter landscape</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>

    <div class="cert">
      <div class="frame"></div>
      <div class="rays"></div>

      <div class="corner-deco tl">✦</div>
      <div class="corner-deco tr">✦</div>
      <div class="corner-deco bl">✦</div>
      <div class="corner-deco br">✦</div>

      <div class="inner">
        <div class="header">
          <div class="ribbon">⭐ Certificate of Awesomeness ⭐</div>
          <h1>This goes to…</h1>
        </div>

        <div class="hero">
          ${avatarBlock}
          <div class="info">
            <div class="name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
            <div class="reason-lbl">For…</div>
            <div class="reason">${escapeHtml(reason)}</div>
          </div>
        </div>

        <div class="footer">
          <div>
            <div class="sig-lbl">Teacher signature</div>
            <div class="sig-line"></div>
            <div class="sig-name">${escapeHtml(teacherName || "")}</div>
          </div>
          <div>
            <div class="date-lbl">Awarded on</div>
            <div class="date-val">${escapeHtml(dateLabel)}</div>
          </div>
          <div class="barcode-box">
            <div class="bar-lbl">Kudos code</div>
            ${barcodeSvg}
          </div>
        </div>
      </div>
    </div>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))</script>
  </body></html>`);
  w.document.close();
  successBeep();
}

/* ── small UI helpers ────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 18px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #f59e0b 0%, #b45309 60%, #78350f 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(180, 83, 9, 0.55)",
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
