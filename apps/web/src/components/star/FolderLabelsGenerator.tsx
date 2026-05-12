// Folder Labels — one-tap printable Avery 5160 (30 labels per sheet)
// for the whole roster. Each label has the kid's name, grade, and a
// scannable STAR barcode (their student id) that pulls up their
// gradebook on scan.

import { useState } from "react";
import { StarStore, type StarStudent } from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

type LabelStyle = "name-photo-barcode" | "name-only" | "barcode-big";

export default function FolderLabelsGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [copies, setCopies] = useState<number>(2);
  const [style, setStyle] = useState<LabelStyle>("name-photo-barcode");

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const print = () => {
    if (picked.size === 0) return;
    const photos = StarStore.getPhotos();
    const photoByKid: Record<string, string> = {};
    for (const s of students) {
      if (!picked.has(s.id)) continue;
      const first = (s.firstName || "").trim().toLowerCase();
      let bestTs = 0;
      for (const list of Object.values(photos)) {
        for (const p of list) {
          const matches = (p.studentId && p.studentId === s.id) ||
            (!p.studentId && p.studentName && (p.studentName || "").trim().toLowerCase().split(/\s+/)[0] === first);
          if (matches && p.ts > bestTs) {
            bestTs = p.ts;
            photoByKid[s.id] = p.dataUrl;
          }
        }
      }
    }
    openLabelsWindow(students.filter((s) => picked.has(s.id)), copies, style, photoByKid);
    loggedBeep();
  };

  const totalLabels = picked.size * copies;
  const sheets = Math.ceil(totalLabels / 30);

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Style">
          <select value={style} onChange={(e) => setStyle(e.target.value as LabelStyle)} style={inp()}>
            <option value="name-photo-barcode">📸 Name + photo + barcode</option>
            <option value="name-only">📝 Big name only</option>
            <option value="barcode-big">📊 Big barcode + name</option>
          </select>
        </Field>
        <Field label="Copies per kid">
          <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} style={inp()}>
            {[1, 2, 3, 4, 6, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Label sheet">
          <div style={{ padding: "9px 12px", borderRadius: 10, background: "rgba(0,0,0,0.30)", border: "1px solid rgba(255,255,255,0.10)", fontSize: 13, color: "#c4b5fd", fontWeight: 700 }}>
            Avery 5160 · 30 / sheet
          </div>
        </Field>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
            Students ({picked.size}/{students.length}) · {totalLabels} labels · {sheets} sheet{sheets === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPicked(new Set(students.map((s) => s.id)))} style={ghost()}>All</button>
            <button onClick={() => setPicked(new Set())} style={ghost()}>None</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
          {students.map((s) => {
            const sel = picked.has(s.id);
            return (
              <label key={s.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 8,
                background: sel ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${sel ? "rgba(168,85,247,0.40)" : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer", fontSize: 12,
              }}>
                <input type="checkbox" checked={sel} onChange={() => togglePick(s.id)} style={{ accentColor: "#a855f7" }} />
                <span style={{ fontWeight: 700 }}>{s.firstName} {s.lastName}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={print} disabled={picked.size === 0} style={primary(picked.size === 0)}>
          🖨 Print {totalLabels} labels ({sheets} sheet{sheets === 1 ? "" : "s"})
        </button>
      </div>
    </div>
  );
}

function openLabelsWindow(students: StarStudent[], copies: number, style: LabelStyle, photoByKid: Record<string, string>) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  // Build the flat list of labels: each kid repeated `copies` times.
  const labels: StarStudent[] = [];
  for (const s of students) for (let i = 0; i < copies; i++) labels.push(s);

  const renderLabel = (s: StarStudent) => {
    // Encode the student id so a future scan-to-folder feature can wire
    // up to it. Format: STU-<studentId>.
    const code = `STU-${s.id}`;
    const name = `${s.firstName} ${s.lastName}`.trim();
    const photoUrl = photoByKid[s.id];
    if (style === "name-only") {
      return `<div class="label">
        <div class="big-name">${escapeHtml(s.firstName)}</div>
        <div class="last">${escapeHtml(s.lastName)}</div>
        ${s.grade ? `<div class="grade-pill">${escapeHtml(s.grade)}</div>` : ""}
      </div>`;
    }
    if (style === "barcode-big") {
      return `<div class="label">
        <div class="kid-name">${escapeHtml(name)}${s.grade ? ` · ${escapeHtml(s.grade)}` : ""}</div>
        <div class="bigbar">${bc128svg(code, 0, 50, true, 1.4)}</div>
      </div>`;
    }
    // default: name + photo + barcode
    return `<div class="label">
      <div class="row">
        ${photoUrl
          ? `<img class="thumb" src="${photoUrl}" alt="${escapeHtml(s.firstName)}" />`
          : `<div class="thumb no-photo">${escapeHtml((s.firstName || "?")[0].toUpperCase())}</div>`}
        <div class="info">
          <div class="kid-name">${escapeHtml(name)}</div>
          ${s.grade ? `<div class="grade-pill">${escapeHtml(s.grade)}</div>` : ""}
          <div class="bar">${bc128svg(code, 0, 28, false, 1.0)}</div>
        </div>
      </div>
    </div>`;
  };

  w.document.write(`<!doctype html><html><head><title>Folder Labels — Avery 5160 — ${students.length} kids</title>
    <style>
      /* Avery 5160: 30 labels per sheet, 3 columns × 10 rows.
         Sheet: 8.5" × 11", margins 0.5" top/bottom, 0.19" left/right.
         Label: 2.625" wide × 1.0" tall, 0.125" gap between columns. */
      @media print {
        @page { size: letter; margin: 0; }
        .toolbar { display: none; }
        body { margin: 0; }
      }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1235; padding: 0; margin: 0; background: #f3f4f6; }
      .toolbar { padding: 12px 24px; background: #fef3c7; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #b45309; background: #b45309; color: white; font-weight: 700; cursor: pointer; }
      .sheet { width: 8.5in; height: 11in; padding: 0.5in 0.19in; box-sizing: border-box; background: white; margin: 12px auto; box-shadow: 0 4px 18px rgba(0,0,0,0.10); page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
      .grid { display: grid; grid-template-columns: 2.625in 0.125in 2.625in 0.125in 2.625in; grid-auto-rows: 1.0in; }
      .label { padding: 6px 8px; box-sizing: border-box; overflow: hidden; }
      .gap { grid-column: span 1; } /* spacers — empty, just keep grid alignment */
      .row { display: flex; gap: 8px; align-items: center; height: 100%; }
      .thumb { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; background: #ede9fe; border: 1.5px solid #a855f7; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #6d28d9; }
      .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
      .kid-name { font-size: 14px; font-weight: 800; color: #1f1235; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .grade-pill { font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #6d28d9; background: #ede9fe; padding: 1px 6px; border-radius: 999px; align-self: flex-start; margin-top: 2px; }
      .bar { margin-top: 2px; }
      .big-name { font-size: 26px; font-weight: 900; color: #1f1235; line-height: 1; margin-top: 4px; }
      .last { font-size: 14px; font-weight: 700; color: #6b21a8; margin-top: 2px; }
      .bigbar { margin-top: 4px; }
    </style>
  </head><body>
    <div class="toolbar">
      <div>📌 ${labels.length} labels · ${Math.ceil(labels.length / 30)} Avery 5160 sheet${Math.ceil(labels.length / 30) === 1 ? "" : "s"} · load label sheets in your printer</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    ${chunkSheets(labels, renderLabel)}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
  </body></html>`);
  w.document.close();
  successBeep();
}

// Build the per-sheet HTML. Avery 5160 has 30 labels per sheet,
// laid out as 3 columns × 10 rows with two thin gap columns between.
function chunkSheets(labels: StarStudent[], render: (s: StarStudent) => string): string {
  const sheets: string[] = [];
  for (let i = 0; i < labels.length; i += 30) {
    const chunk = labels.slice(i, i + 30);
    // Render rows of 3, with gap columns between.
    const cells: string[] = [];
    for (let r = 0; r < 10; r++) {
      const a = chunk[r * 3];
      const b = chunk[r * 3 + 1];
      const c = chunk[r * 3 + 2];
      cells.push(a ? render(a) : `<div class="label"></div>`);
      cells.push(`<div class="gap"></div>`);
      cells.push(b ? render(b) : `<div class="label"></div>`);
      cells.push(`<div class="gap"></div>`);
      cells.push(c ? render(c) : `<div class="label"></div>`);
    }
    sheets.push(`<div class="sheet"><div class="grid">${cells.join("")}</div></div>`);
  }
  return sheets.join("");
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
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
