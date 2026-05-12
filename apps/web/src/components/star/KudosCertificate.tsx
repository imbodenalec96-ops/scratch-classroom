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
  if (!w) {
    alert("Pop-up blocked. Allow pop-ups for this site so the kudos certificate can open in a new window, then tap Print Kudos again.");
    return;
  }
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

  // Avatar variant — for the "premium" look the photo / initial sits
  // INSIDE a gold seal medallion rather than free-floating, with a
  // tiny star burst tucked at the top-right of the seal.
  const avatarMedallion = avatarUrl
    ? `<img class="medal-photo" src="${avatarUrl}" alt="${escapeHtml(student.firstName)}" />`
    : avatarEmoji
      ? `<div class="medal-photo emoji">${escapeHtml(avatarEmoji)}</div>`
      : `<div class="medal-photo initial">${escapeHtml(initial)}</div>`;
  void avatarBlock; // keep variable (older callers) — not used in new template

  w.document.write(`<!doctype html><html><head><title>Kudos — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</title>
    <style>
      /* Preserve every gold gradient, color, and shadow when sent to
         the printer / Print to PDF. Without these flags Chrome and
         Safari strip the gold borders and the ribbon banner during
         print so the certificate comes out plain white. */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
      }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      @media print {
        @page { size: letter landscape; margin: 0.3in; }
        .no-print { display: none !important; }
        body { background: white !important; margin: 0 !important; }
        .cert {
          box-shadow: none !important;
          margin: 0 auto !important;
          width: 10.4in !important;
          height: 7.9in !important;
          aspect-ratio: auto !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }

      :root {
        --gold-1: #b45309;
        --gold-2: #d97706;
        --gold-3: #f59e0b;
        --gold-4: #fbbf24;
        --gold-light: #fde68a;
        --cream: #fffdf5;
        --parchment: #faf3df;
        --ink: #3d2710;
        --deep: #5a3814;
      }

      body { font-family: "Georgia", "Times New Roman", serif; margin: 0; padding: 0; color: var(--ink); background: #e6dfc7; }
      .toolbar { padding: 12px 24px; background: linear-gradient(90deg, #fef3c7, #fed7aa); border-bottom: 1px solid #fbbf24; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; font-family: -apple-system, sans-serif; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--gold-1); background: var(--gold-1); color: white; font-weight: 700; cursor: pointer; }

      /* ─── The certificate sheet ─────────────────────────────── */
      .cert {
        margin: 22px auto; max-width: 10.2in; aspect-ratio: 11 / 8.5;
        background:
          radial-gradient(ellipse at center, var(--cream) 0%, var(--parchment) 100%);
        box-shadow: 0 30px 80px -16px rgba(120, 53, 15, 0.45);
        position: relative;
        overflow: hidden;
      }

      /* Faint paper noise — soft randomized dots so the parchment
         doesn't look perfectly flat under bright light. */
      .cert::before {
        content: "";
        position: absolute; inset: 0;
        background-image:
          radial-gradient(circle at 20% 30%, rgba(180,83,9,0.04) 0, transparent 1.5px),
          radial-gradient(circle at 70% 60%, rgba(180,83,9,0.04) 0, transparent 1.2px),
          radial-gradient(circle at 40% 80%, rgba(180,83,9,0.03) 0, transparent 1.0px),
          radial-gradient(circle at 85% 20%, rgba(180,83,9,0.04) 0, transparent 1.4px);
        background-size: 80px 80px;
        pointer-events: none;
      }

      /* ─── Triple-layer ornamental border ────────────────────── */
      .border-outer {
        position: absolute; inset: 12px;
        border: 2.5px solid var(--gold-1);
        pointer-events: none;
      }
      .border-mid {
        position: absolute; inset: 22px;
        border: 1px solid var(--gold-3);
        pointer-events: none;
      }
      .border-inner {
        /* Solid-color thick gold band. The previous masked-gradient
           border rendered as a transparent line in Chrome's PDF
           engine — solid border is print-safe. */
        position: absolute; inset: 28px;
        border: 6px solid var(--gold-2);
        box-shadow: inset 0 0 0 1px var(--gold-light), inset 0 0 0 2px var(--gold-1);
        pointer-events: none;
      }
      /* Dotted rule between the gold band and the content */
      .border-dots {
        position: absolute; inset: 44px;
        border: 1px dotted var(--gold-2);
        opacity: 0.55;
        pointer-events: none;
      }

      /* Corner ornaments — fleur-de-lis-ish gold flourishes */
      .corner {
        position: absolute; width: 64px; height: 64px;
        font-family: "Georgia", serif;
        color: var(--gold-2);
        font-size: 32px; line-height: 64px; text-align: center;
        opacity: 0.85;
        text-shadow: 0 1px 0 var(--gold-light);
        pointer-events: none;
      }
      .corner.tl { top: 26px; left: 30px; }
      .corner.tr { top: 26px; right: 30px; }
      .corner.bl { bottom: 26px; left: 30px; }
      .corner.br { bottom: 26px; right: 30px; }

      /* ─── Letterhead ────────────────────────────────────────── */
      .inner { position: relative; padding: 56px 80px 40px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
      .lh-school {
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 11px; font-weight: 800; letter-spacing: 0.34em; text-transform: uppercase;
        color: var(--gold-1);
        margin-bottom: 4px;
      }
      .lh-rule {
        margin: 6px auto 12px; height: 2px; width: 200px;
        background: linear-gradient(90deg, transparent 0%, var(--gold-2) 50%, transparent 100%);
      }

      /* Banner ribbon — actual ribbon shape with cut tails */
      .banner-wrap { display: flex; justify-content: center; margin: 6px 0 18px; }
      .banner {
        position: relative; padding: 14px 56px;
        background: linear-gradient(180deg, var(--gold-2) 0%, var(--gold-1) 50%, #8a3f0a 100%);
        color: #fffbeb;
        font-family: -apple-system, sans-serif;
        font-size: 13px; font-weight: 900; letter-spacing: 0.42em; text-transform: uppercase;
        box-shadow: 0 6px 16px -4px rgba(120, 53, 15, 0.55);
      }
      .banner::before, .banner::after {
        content: "";
        position: absolute; top: 0; bottom: 0; width: 22px;
        background: inherit;
      }
      .banner::before { left: -16px; clip-path: polygon(100% 0, 100% 100%, 0 50%); }
      .banner::after  { right: -16px; clip-path: polygon(0 0, 100% 50%, 0 100%); }

      h1.title {
        text-align: center; margin: 8px 0 4px; font-style: italic;
        font-size: 56px; line-height: 1; letter-spacing: 0.01em;
        /* Solid color — gradient-text via background-clip is unreliable
           in print engines (renders as transparent on Chrome PDF). */
        color: var(--gold-1);
        text-shadow: 0 1px 0 var(--gold-light), 0 2px 1px rgba(120,53,15,0.18);
      }
      .subtitle {
        text-align: center;
        font-family: -apple-system, sans-serif;
        font-size: 12px; font-weight: 700; color: var(--deep);
        letter-spacing: 0.30em; text-transform: uppercase;
        margin: 4px 0 14px;
      }
      .subtitle::before, .subtitle::after { content: "✦"; color: var(--gold-2); margin: 0 12px; opacity: 0.7; }

      /* Scrollwork divider — SVG curl pattern */
      .scrollwork {
        display: flex; justify-content: center; align-items: center; gap: 10px;
        margin: 6px 0 14px; color: var(--gold-2); opacity: 0.85;
      }
      .scrollwork .line { flex: 1; max-width: 180px; height: 2px; background: linear-gradient(90deg, transparent, currentColor, transparent); }
      .scrollwork .glyph { font-size: 22px; line-height: 1; }

      /* ─── Hero: medallion + name + reason ──────────────────── */
      .hero { display: flex; align-items: center; gap: 36px; margin-top: 4px; flex: 1; }

      /* Big circular gold seal medallion holding the avatar */
      .medallion {
        position: relative;
        width: 200px; height: 200px;
        flex-shrink: 0;
      }
      .medallion .ring-outer {
        /* Layered radial gradient instead of conic — print-safe and
           still gives the brushed-gold effect. */
        position: absolute; inset: 0; border-radius: 50%;
        background:
          radial-gradient(circle at 35% 30%, var(--gold-light) 0%, var(--gold-3) 35%, var(--gold-2) 70%, var(--gold-1) 100%);
        box-shadow:
          0 0 0 3px var(--gold-1),
          0 14px 36px -10px rgba(120, 53, 15, 0.55),
          inset 0 -8px 14px rgba(120, 53, 15, 0.25);
      }
      .medallion .ring-inner {
        position: absolute; inset: 14px; border-radius: 50%;
        background: var(--cream);
        box-shadow: inset 0 0 0 2px var(--gold-2),
                    inset 0 0 0 4px var(--cream),
                    inset 0 0 0 5px var(--gold-3);
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .medal-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
      .medal-photo.emoji { font-size: 110px; line-height: 1; display: flex; align-items: center; justify-content: center; }
      .medal-photo.initial {
        font-family: "Brush Script MT", "Lucida Handwriting", cursive;
        font-size: 110px; line-height: 1; color: var(--gold-1); font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 30% 30%, #fff8e1, var(--cream));
      }
      /* Star burst tucked at the seal's upper right */
      .medallion .star {
        position: absolute; top: -6px; right: -10px;
        width: 56px; height: 56px;
        background: radial-gradient(circle, var(--gold-light) 0%, var(--gold-3) 60%, var(--gold-1) 100%);
        clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
        box-shadow: 0 4px 10px -2px rgba(120,53,15,0.55);
      }

      .info { flex: 1; min-width: 0; }
      .presented {
        font-family: "Georgia", serif; font-style: italic; font-size: 18px;
        color: var(--deep); margin-bottom: 4px; opacity: 0.85;
      }
      .name {
        font-family: "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive;
        font-size: 88px; color: var(--gold-1); line-height: 1; margin: 0 0 8px;
        letter-spacing: 0.01em;
        text-shadow: 0 2px 0 rgba(255,255,255,0.6);
      }
      .name-rule { height: 1px; background: linear-gradient(90deg, var(--gold-2), transparent); margin: 0 0 14px; }
      .reason-lbl {
        font-family: -apple-system, sans-serif;
        font-size: 11px; font-weight: 800; color: var(--gold-1);
        letter-spacing: 0.30em; text-transform: uppercase;
        margin-bottom: 6px;
      }
      .reason {
        font-family: "Georgia", serif;
        font-size: 22px; color: var(--ink); line-height: 1.45;
        font-style: italic;
        padding: 8px 0;
      }
      .reason::before { content: "“"; font-size: 38px; color: var(--gold-2); margin-right: 4px; vertical-align: -10px; line-height: 0; }
      .reason::after  { content: "”"; font-size: 38px; color: var(--gold-2); margin-left: 4px;  vertical-align: -10px; line-height: 0; }

      /* ─── Footer: signature + date + seal/barcode ──────────── */
      .footer {
        margin-top: 22px;
        display: grid; grid-template-columns: 1fr auto 1fr;
        align-items: end; gap: 36px;
        padding-top: 16px;
      }
      .foot-cell { text-align: center; }
      .foot-cell.left  { text-align: left; }
      .foot-cell.right { text-align: right; }

      .sig-name {
        font-family: "Brush Script MT", "Lucida Handwriting", cursive;
        font-size: 26px; color: var(--gold-1); line-height: 1;
        min-height: 30px;
      }
      .sig-line { border-bottom: 1.5px solid var(--deep); height: 4px; margin-top: 4px; }
      .foot-lbl {
        font-family: -apple-system, sans-serif;
        font-size: 9px; font-weight: 800; letter-spacing: 0.24em; text-transform: uppercase;
        color: var(--gold-1); margin-top: 6px;
      }
      .date-val {
        font-family: "Georgia", serif; font-style: italic;
        font-size: 18px; color: var(--ink);
        padding-bottom: 4px; border-bottom: 1.5px solid var(--deep);
      }

      /* Embossed seal that holds the kudos barcode (centered footer) */
      .seal {
        position: relative;
        padding: 8px 14px 6px;
        background:
          radial-gradient(circle at 30% 30%, #fff8e1, var(--parchment));
        border: 2px solid var(--gold-2);
        border-radius: 12px;
        box-shadow: inset 0 0 0 2px var(--cream), inset 0 0 0 3px var(--gold-3);
      }
      .seal .seal-lbl {
        font-family: -apple-system, sans-serif;
        font-size: 8px; font-weight: 800; letter-spacing: 0.28em; text-transform: uppercase;
        color: var(--gold-1); text-align: center; margin-bottom: 2px;
      }
      .seal svg { display: block; margin: 0 auto; }

    </style></head><body>
    <div class="toolbar no-print">
      <div>🏆 Kudos certificate · prints on letter landscape</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>

    <div class="cert">
      <div class="border-outer"></div>
      <div class="border-mid"></div>
      <div class="border-inner"></div>
      <div class="border-dots"></div>

      <div class="corner tl">❦</div>
      <div class="corner tr">❦</div>
      <div class="corner bl">❦</div>
      <div class="corner br">❦</div>

      <div class="inner">
        <div class="lh-school">STAR Room · Special Education</div>
        <div class="lh-rule"></div>

        <div class="banner-wrap">
          <div class="banner">★ Certificate of Excellence ★</div>
        </div>

        <h1 class="title">Star Student Award</h1>
        <div class="subtitle">In Recognition of Outstanding Effort</div>

        <div class="scrollwork">
          <div class="line"></div>
          <div class="glyph">❦</div>
          <div class="line"></div>
        </div>

        <div class="hero">
          <div class="medallion">
            <div class="ring-outer"></div>
            <div class="ring-inner">${avatarMedallion}</div>
            <div class="star"></div>
          </div>
          <div class="info">
            <div class="presented">This award is proudly presented to</div>
            <div class="name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
            <div class="name-rule"></div>
            <div class="reason-lbl">In recognition of</div>
            <div class="reason">${escapeHtml(reason)}</div>
          </div>
        </div>

        <div class="footer">
          <div class="foot-cell left">
            <div class="sig-name">${escapeHtml(teacherName || "")}</div>
            <div class="sig-line"></div>
            <div class="foot-lbl">Teacher Signature</div>
          </div>
          <div class="foot-cell">
            <div class="seal">
              <div class="seal-lbl">Kudos Code</div>
              ${barcodeSvg}
            </div>
          </div>
          <div class="foot-cell right">
            <div class="date-val">${escapeHtml(dateLabel)}</div>
            <div class="foot-lbl">Date Awarded</div>
          </div>
        </div>
      </div>
    </div>
    <script>
      // Wait until every image (the avatar especially) has actually
      // finished loading before opening the print dialog. The old
      // setTimeout-300 fired while the avatar was still loading on
      // slow networks so the printed page came out without it.
      (function () {
        function go() { try { window.focus(); window.print(); } catch (e) {} }
        function ready() {
          var imgs = Array.prototype.slice.call(document.images);
          if (imgs.length === 0) { setTimeout(go, 250); return; }
          var pending = imgs.filter(function (i) { return !i.complete; });
          if (pending.length === 0) { setTimeout(go, 250); return; }
          var left = pending.length;
          pending.forEach(function (img) {
            img.addEventListener("load",  function () { if (--left <= 0) setTimeout(go, 200); });
            img.addEventListener("error", function () { if (--left <= 0) setTimeout(go, 200); });
          });
          // Hard fallback in case a load event never fires (CDN slow):
          setTimeout(go, 4000);
        }
        if (document.readyState === "complete") ready();
        else window.addEventListener("load", ready);
      })();
    </script>
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
