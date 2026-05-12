// Kudos Certificate — one-tap printable certificate for a kid.
// Pick the student + reason → print on cardstock. Auto-fills a kudos
// barcode the kid can scan at home/share to get a "kudos points" boost.

import { useMemo, useState } from "react";
import { StarStore, type StarStudent } from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

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

  // Find the kid's most-recent photo (any barcode) so the cert can show
  // a thumbnail. Optional — falls back to a big star emoji.
  const photo = useMemo(() => {
    if (!sel) return null;
    const photos = StarStore.getPhotos();
    const first = (sel.firstName || "").trim().toLowerCase();
    let best: { ts: number; dataUrl: string } | null = null;
    for (const list of Object.values(photos)) {
      for (const p of list) {
        const matches = (p.studentId && p.studentId === sel.id) ||
          (!p.studentId && p.studentName && (p.studentName || "").trim().toLowerCase().split(/\s+/)[0] === first);
        if (matches && (!best || p.ts > best.ts)) best = { ts: p.ts, dataUrl: p.dataUrl };
      }
    }
    return best;
  }, [sel]);

  const print = () => {
    if (!sel) return;
    openKudosWindow({
      student: sel, reason: reason.trim() || REASON_PRESETS[0],
      teacherName: teacherName.trim(), date, photoDataUrl: photo?.dataUrl,
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
  date: string; photoDataUrl?: string;
}) {
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) return;
  const { student, reason, teacherName, date, photoDataUrl } = args;
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  // Barcode encodes a kudos action — when scanned later it could be
  // wired to award kudos points. Format: KUDOS-<studentId>-<date>.
  const kudosBarcode = `KUDOS-${student.id}-${date.replace(/-/g, "")}`;
  const barcodeSvg = bc128svg(kudosBarcode, 0, 60, true, 1.6);

  const photoBlock = photoDataUrl
    ? `<div class="photo"><img src="${photoDataUrl}" alt="${escapeHtml(student.firstName)}" /></div>`
    : `<div class="photo no-photo">⭐</div>`;

  w.document.write(`<!doctype html><html><head><title>Kudos — ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</title>
    <style>
      @media print { @page { size: letter landscape; margin: 0.4in; } .no-print { display: none; } }
      body { font-family: "Georgia", "Times New Roman", serif; margin: 0; padding: 0; background: #fdf6e3; }
      .toolbar { padding: 12px 24px; background: #fef3c7; border-bottom: 1px solid #fbbf24; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; font-family: -apple-system, sans-serif; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #b45309; background: #b45309; color: white; font-weight: 700; cursor: pointer; }
      .cert {
        margin: 18px auto; max-width: 9.5in; padding: 36px 50px;
        background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
        border: 6px double #b45309;
        border-radius: 18px;
        box-shadow: 0 16px 48px rgba(120, 53, 15, 0.20);
        position: relative;
      }
      .corner { position: absolute; font-size: 36px; opacity: 0.45; }
      .corner.tl { top: 14px; left: 18px; }
      .corner.tr { top: 14px; right: 18px; }
      .corner.bl { bottom: 14px; left: 18px; }
      .corner.br { bottom: 14px; right: 18px; }
      .header { text-align: center; margin-bottom: 16px; }
      .ribbon { display: inline-block; padding: 6px 18px; border-radius: 999px; background: #b45309; color: #fffbeb; font-size: 12px; font-weight: 800; letter-spacing: 0.32em; text-transform: uppercase; font-family: -apple-system, sans-serif; }
      h1 { font-size: 56px; margin: 14px 0 4px; color: #78350f; letter-spacing: -0.02em; font-style: italic; }
      .row { display: grid; grid-template-columns: 220px 1fr; gap: 28px; align-items: center; margin: 24px 0; }
      .photo { width: 200px; height: 200px; border-radius: 12px; overflow: hidden; border: 4px solid #b45309; background: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 22px rgba(120, 53, 15, 0.25); }
      .photo img { width: 100%; height: 100%; object-fit: cover; }
      .no-photo { font-size: 110px; color: #fbbf24; }
      .name { font-family: "Brush Script MT", cursive; font-size: 64px; color: #b45309; line-height: 1; margin-bottom: 8px; }
      .reason-lbl { font-size: 13px; font-weight: 700; color: #78350f; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px; font-family: -apple-system, sans-serif; }
      .reason { font-size: 26px; color: #1f1235; line-height: 1.35; font-style: italic; }
      .footer { margin-top: 20px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 24px; }
      .signature { text-align: center; }
      .signline { border-bottom: 2px solid #78350f; height: 40px; margin-bottom: 4px; }
      .signname { font-size: 12px; font-weight: 700; color: #78350f; font-family: -apple-system, sans-serif; }
      .barcode-box { text-align: center; }
      .barcode-box .lbl { font-size: 9px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #78350f; margin-bottom: 4px; font-family: -apple-system, sans-serif; }
      .date-box { text-align: center; }
      .date-box .lbl { font-size: 9px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #78350f; margin-bottom: 4px; font-family: -apple-system, sans-serif; }
      .date-box .val { font-size: 14px; color: #1f1235; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>🏆 Kudos certificate ready · prints on letter landscape</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    <div class="cert">
      <div class="corner tl">⭐</div>
      <div class="corner tr">⭐</div>
      <div class="corner bl">⭐</div>
      <div class="corner br">⭐</div>

      <div class="header">
        <div class="ribbon">Certificate of Awesomeness</div>
        <h1>This goes to…</h1>
      </div>

      <div class="row">
        ${photoBlock}
        <div>
          <div class="name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div>
          <div class="reason-lbl">For…</div>
          <div class="reason">${escapeHtml(reason)}</div>
        </div>
      </div>

      <div class="footer">
        <div class="signature">
          <div class="signline"></div>
          <div class="signname">${escapeHtml(teacherName || "Teacher")}</div>
        </div>
        <div class="date-box">
          <div class="lbl">Awarded on</div>
          <div class="val">${escapeHtml(dateLabel)}</div>
        </div>
        <div class="barcode-box">
          <div class="lbl">Scan for kudos points</div>
          ${barcodeSvg}
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
