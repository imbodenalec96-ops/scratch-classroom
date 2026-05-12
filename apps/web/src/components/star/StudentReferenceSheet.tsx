// Student Reference Sheet — one printable letter sheet for the
// teacher's clipboard / desk. Each kid gets a row with their photo,
// name, grade, and a scannable STU-{id} barcode big enough to read
// reliably from across a desk.
//
// Layouts:
//   • Compact     — 1 row per kid, fits 12+ kids
//   • Spacious    — 2 rows per kid, photo + barcode huge
//   • Tally grid  — compact + adds a hand-tracking grid (8 columns)
//                   so you can mark behaviors throughout the day
//                   without a tablet.

import { useEffect, useMemo, useState } from "react";
import { StarStore, type StarStudent } from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

type Layout = "compact" | "spacious" | "tally";

// Same per-grade palette the folder labels use, kept in sync so
// printables look like a coherent set.
function gradeAccent(grade: string | undefined): { from: string; to: string; ink: string } {
  const g = (grade || "").toUpperCase();
  if (g === "K" || g === "KG")  return { from: "#fbbf24", to: "#f59e0b", ink: "#78350f" };
  if (g.startsWith("1"))         return { from: "#fb7185", to: "#e11d48", ink: "#881337" };
  if (g.startsWith("2"))         return { from: "#fb923c", to: "#ea580c", ink: "#7c2d12" };
  if (g.startsWith("3"))         return { from: "#34d399", to: "#10b981", ink: "#065f46" };
  if (g.startsWith("4"))         return { from: "#60a5fa", to: "#2563eb", ink: "#1e3a8a" };
  if (g.startsWith("5"))         return { from: "#a78bfa", to: "#7c3aed", ink: "#4c1d95" };
  return { from: "#a78bfa", to: "#7c3aed", ink: "#4c1d95" };
}

// Sensible default tally headers for the grid layout. Editable in
// the form so the teacher can put their own categories.
const DEFAULT_TALLY_HEADERS = ["On task", "Kind", "Self-adv", "Redir", "Out", "Disrupt", "Notes", "Notes"];

export default function StudentReferenceSheet() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [layout, setLayout] = useState<Layout>("compact");
  const [date, setDate] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 3600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  });
  const [titleNote, setTitleNote] = useState<string>("");
  const [tallyHeaders, setTallyHeaders] = useState<string[]>(DEFAULT_TALLY_HEADERS);

  // Profile pictures — same source as the wallet + kudos cert.
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  useEffect(() => {
    (async () => {
      try {
        const accounts = await api.listStudentAccounts();
        const map: Record<string, string | null> = {};
        for (const a of accounts || []) map[a.id] = a.avatarUrl;
        setAvatars(map);
      } catch {}
    })();
  }, []);

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pickedStudents = useMemo(() => students.filter((s) => picked.has(s.id)), [students, picked]);

  const print = () => {
    if (pickedStudents.length === 0) return;
    openSheetWindow(pickedStudents, layout, date, titleNote.trim(), tallyHeaders, avatars);
    loggedBeep();
    successBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Layout">
          <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)} style={inp()}>
            <option value="compact">📋 Compact · 1 row each (12+ kids/page)</option>
            <option value="spacious">📄 Spacious · big photo + huge barcode</option>
            <option value="tally">✅ Tally grid · compact + hand-track columns</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </Field>
        <Field label="Header note (optional)">
          <input
            value={titleNote}
            onChange={(e) => setTitleNote(e.target.value)}
            placeholder="e.g. Mrs. Imboden · STAR Room"
            style={inp()}
          />
        </Field>
      </div>

      {layout === "tally" && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 12,
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.30)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
            Tally column headers (8 columns) · short labels print best
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {tallyHeaders.map((h, i) => (
              <input
                key={i}
                value={h}
                onChange={(e) => setTallyHeaders((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={DEFAULT_TALLY_HEADERS[i]}
                maxLength={12}
                style={{ ...inp(), fontSize: 12 }}
              />
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
            💡 Each cell prints as a blank tally box for hand-tracking with a pen during the day. Transfer to /star → 📈 Behavior at the end.
          </div>
        </div>
      )}

      {/* Roster picker */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
            Students ({picked.size}/{students.length}) · ~{Math.max(1, Math.ceil(picked.size / (layout === "spacious" ? 6 : 14)))} sheet{Math.ceil(picked.size / (layout === "spacious" ? 6 : 14)) === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPicked(new Set(students.map((s) => s.id)))} style={ghost()}>All</button>
            <button onClick={() => setPicked(new Set())} style={ghost()}>None</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
          {students.map((s) => {
            const sel = picked.has(s.id);
            const accent = gradeAccent(s.grade);
            return (
              <label key={s.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 8,
                background: sel ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${sel ? "rgba(168,85,247,0.40)" : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer", fontSize: 12,
              }}>
                <input type="checkbox" checked={sel} onChange={() => togglePick(s.id)} style={{ accentColor: "#a855f7" }} />
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontSize: 11, fontWeight: 800,
                }}>{(s.firstName || "?")[0].toUpperCase()}</div>
                <span style={{ fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.firstName} {s.lastName}
                </span>
                {s.grade && <span style={{ fontSize: 9, fontWeight: 800, color: accent.from, letterSpacing: "0.06em" }}>{s.grade.toUpperCase()}</span>}
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={print} disabled={pickedStudents.length === 0} style={primary(pickedStudents.length === 0)}>
          🖨 Print reference sheet
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>
        💡 Clip this to a clipboard or tape to your desk. Scan any kid's barcode to open their folder modal (pending assignments, recent grades, quick behaviors, points). The tally grid is for hand-tracking when you're away from the iPad.
      </div>
    </div>
  );
}

/* ── Print template ─────────────────────────────────────────────── */

function openSheetWindow(students: StarStudent[], layout: Layout, date: string, titleNote: string, tallyHeaders: string[], avatars: Record<string, string | null>) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const renderRow = (s: StarStudent) => {
    const accent = gradeAccent(s.grade);
    const code = `STU-${s.id}`;
    const initial = (s.firstName || "?")[0].toUpperCase();
    const avatarUrl = avatars[s.id];
    const photo = avatarUrl
      ? `<img src="${avatarUrl}" alt="" class="ph" />`
      : `<div class="ph initial" style="background:linear-gradient(135deg,${accent.from},${accent.to})">${escapeHtml(initial)}</div>`;
    const gradePill = s.grade
      ? `<span class="grade" style="background:${accent.from}">${escapeHtml(s.grade.toUpperCase())}</span>`
      : "";

    if (layout === "spacious") {
      return `<div class="row spacious" style="border-left:8px solid ${accent.from}">
        <div class="head">
          ${photo}
          <div class="info">
            <div class="name">${escapeHtml(s.firstName || "")} ${escapeHtml(s.lastName || "")}</div>
            <div class="sub">${gradePill}<span class="code">${escapeHtml(code)}</span></div>
          </div>
        </div>
        <div class="bar">${bc128svg(code, 0, 90, true, 2.6)}</div>
      </div>`;
    }

    if (layout === "tally") {
      const cells = tallyHeaders.map(() => `<td class="tally"></td>`).join("");
      return `<tr style="border-left:6px solid ${accent.from}">
        <td class="ph-cell">${photo}</td>
        <td class="name-cell">
          <div class="name">${escapeHtml(s.firstName || "")} ${escapeHtml(s.lastName || "")}</div>
          <div class="sub">${gradePill}</div>
        </td>
        <td class="bar-cell">${bc128svg(code, 0, 50, false, 1.3)}</td>
        ${cells}
      </tr>`;
    }

    // compact
    return `<tr style="border-left:6px solid ${accent.from}">
      <td class="ph-cell">${photo}</td>
      <td class="name-cell">
        <div class="name">${escapeHtml(s.firstName || "")} ${escapeHtml(s.lastName || "")}</div>
        <div class="sub">${gradePill}<span class="code">${escapeHtml(code)}</span></div>
      </td>
      <td class="bar-cell">${bc128svg(code, 0, 60, true, 1.6)}</td>
    </tr>`;
  };

  // Page assembly
  let body = "";
  if (layout === "spacious") {
    body = `<div class="grid">${students.map(renderRow).join("")}</div>`;
  } else {
    const headerCells = layout === "tally"
      ? tallyHeaders.map((h) => `<th class="tally-head">${escapeHtml(h)}</th>`).join("")
      : "";
    body = `<table>
      <thead>
        <tr>
          <th></th>
          <th class="name-head">Student</th>
          <th class="bar-head">Scan code</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${students.map(renderRow).join("")}</tbody>
    </table>`;
  }

  w.document.write(`<!doctype html><html><head><title>Student Reference — ${escapeHtml(dateLabel)}</title>
    <style>
      @media print { @page { size: letter${layout === "tally" ? " landscape" : ""}; margin: 0.4in; } .no-print { display: none; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1235; padding: 0; margin: 0; background: white; }
      .toolbar { padding: 12px 24px; background: linear-gradient(90deg, #faf5ff, #fdf2f8); border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
      header { padding: 14px 18px 8px; border-bottom: 2px solid #ede9fe; }
      h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; color: #4c1d95; }
      .meta { font-size: 12px; color: #555; margin-top: 4px; }
      main { padding: 12px 18px; }

      /* compact + tally use a table */
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; padding: 4px 8px; background: #faf5ff; border-bottom: 2px solid #d8b4fe; font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #6d28d9; }
      tr { page-break-inside: avoid; }
      td { padding: 8px; border-bottom: 1.5px solid #f3f4f6; vertical-align: middle; }
      .ph { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #d8b4fe; background: white; }
      .ph.initial { display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: white; }
      .ph-cell { width: 56px; }
      .name-cell { width: 32%; }
      .name { font-size: 16px; font-weight: 900; color: #1f1235; line-height: 1.1; }
      .sub { margin-top: 3px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .grade { display: inline-block; padding: 1px 7px; border-radius: 999px; color: white; font-size: 9px; font-weight: 900; letter-spacing: 0.08em; }
      .code { font-family: Menlo, monospace; font-size: 10px; color: #6d28d9; opacity: 0.85; }
      .bar-head { width: 200px; }
      .bar-cell { white-space: nowrap; padding-right: 6px; }
      .tally { width: 1.05in; height: 0.85in; border: 1px solid #d8b4fe; background: #faf5ff; }
      .tally-head { width: 1.05in; text-align: center; }

      /* spacious uses the grid */
      .grid { display: flex; flex-direction: column; gap: 10px; }
      .row.spacious {
        display: grid; grid-template-columns: 1fr auto;
        gap: 18px; align-items: center;
        padding: 14px 18px; background: #faf5ff; border-radius: 10px;
        page-break-inside: avoid;
      }
      .row.spacious .head { display: flex; align-items: center; gap: 16px; }
      .row.spacious .ph { width: 80px; height: 80px; border-width: 3px; }
      .row.spacious .ph.initial { font-size: 32px; }
      .row.spacious .name { font-size: 26px; }
      .row.spacious .sub .code { font-size: 12px; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>📋 ${students.length} students · ${escapeHtml(dateLabel)}${titleNote ? " · " + escapeHtml(titleNote) : ""}</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    <header>
      <h1>📋 Student Reference Sheet</h1>
      <div class="meta">${escapeHtml(dateLabel)}${titleNote ? " · " + escapeHtml(titleNote) : ""} · scan any barcode to open the kid's folder.</div>
    </header>
    <main>${body}</main>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
  </body></html>`);
  w.document.close();
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
