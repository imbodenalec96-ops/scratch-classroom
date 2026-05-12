// Folder Labels — printable label sheets for the whole roster.
// Each label has the kid's name, grade, and a scannable STAR barcode
// (their student id, prefix STU-) that pulls up their folder modal
// on scan.
//
// Three Avery sheet formats supported:
//   • Avery 5160  · 30 / page (standard 1×2.625" address labels)
//   • Avery 5163  · 10 / page (2×4" shipping labels — great for
//                              binder dividers or thicker folders)
//   • Bookmark     · 4 / page  (1.5×8" vertical strip — laminate +
//                              poke a hole + ribbon = name bookmark)
//
// Multiple visual styles per format. Profile pictures (avatar_url)
// are pulled from listStudentAccounts — falls back to a colored
// initial bubble if a kid doesn't have one.

import { useEffect, useMemo, useState } from "react";
import { StarStore, type StarStudent } from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { api } from "../../lib/api.ts";

type LabelStyle =
  | "name-photo-barcode"   // standard: photo + name + tiny barcode
  | "name-only"            // big name (no photo, no barcode)
  | "barcode-big"          // huge scannable barcode + name underneath
  | "color-by-grade";      // gradient border colored by grade

type Format = "5160" | "5163" | "bookmark";

interface FormatSpec {
  id: Format;
  label: string;
  perPage: number;
  cols: number;
  rows: number;
  cellWidth: string;       // CSS, e.g. "2.625in"
  cellHeight: string;      // CSS
  pagePadding: string;     // CSS top/bottom + left/right
  hGap: string;            // CSS gap between columns
}

const FORMATS: FormatSpec[] = [
  // Avery 5160: 8.5×11", 0.5" top/bottom margins, 0.19" left/right,
  // 30 labels in a 3×10 grid. 0.125" gap between columns.
  { id: "5160",     label: "Address (Avery 5160) · 30 / sheet", perPage: 30, cols: 3, rows: 10,
    cellWidth: "2.625in", cellHeight: "1.0in",  pagePadding: "0.5in 0.19in", hGap: "0.125in" },
  // Avery 5163: 8.5×11", 0.5" margins all around, 10 labels in a
  // 2×5 grid, 2"×4" each, 0.125" gap between columns.
  { id: "5163",     label: "Shipping (Avery 5163) · 10 / sheet · binders", perPage: 10, cols: 2, rows: 5,
    cellWidth: "4in",    cellHeight: "2in",     pagePadding: "0.5in",        hGap: "0.125in" },
  // Bookmarks: vertical strips, 4 per page (2 cols × 2 rows of
  // 1.5×8 strips). Laminate + ribbon hole = bookmark.
  { id: "bookmark", label: "Bookmark · 4 / sheet · laminate + ribbon", perPage: 4, cols: 2, rows: 2,
    cellWidth: "3.75in", cellHeight: "5in",    pagePadding: "0.5in",        hGap: "0.25in" },
];

// Stable accent gradient per grade for the color-coded style + the
// fallback initial bubble.
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

export default function FolderLabelsGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [copies, setCopies] = useState<number>(2);
  const [style, setStyle] = useState<LabelStyle>("name-photo-barcode");
  const [format, setFormat] = useState<Format>("5160");
  // Tagline appended under the name on every label (great for binder
  // dividers — "STAR · Math Folder", "Reading Group", etc.).
  const [tagline, setTagline] = useState<string>("");

  // Avatars from the auth/students endpoint (the same profile picture
  // the wallet + kudos cert use — NOT a snapshot of their work).
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

  const fmt = useMemo(() => FORMATS.find((f) => f.id === format)!, [format]);
  const totalLabels = picked.size * copies;
  const sheets = Math.max(1, Math.ceil(totalLabels / fmt.perPage));

  const print = () => {
    if (picked.size === 0) return;
    openLabelsWindow(
      students.filter((s) => picked.has(s.id)),
      copies, style, format, avatars, tagline.trim(),
    );
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Sheet format">
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} style={inp()}>
            {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Style">
          <select value={style} onChange={(e) => setStyle(e.target.value as LabelStyle)} style={inp()}>
            <option value="name-photo-barcode">📸 Name + photo + barcode</option>
            <option value="color-by-grade">🌈 Color by grade</option>
            <option value="name-only">📝 Big name only</option>
            <option value="barcode-big">📊 Big barcode + name</option>
          </select>
        </Field>
        <Field label="Copies per kid">
          <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} style={inp()}>
            {[1, 2, 3, 4, 6, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Tagline (optional)">
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. STAR · Math Folder"
            maxLength={42}
            style={inp()}
          />
        </Field>
      </div>

      {/* Live preview of one label */}
      <div style={{
        marginBottom: 14, padding: 14, borderRadius: 12,
        background: "rgba(0,0,0,0.30)",
        border: "1px solid rgba(168,85,247,0.20)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 8 }}>
          Preview · {fmt.label.split(" · ")[0]}
        </div>
        <div style={{
          padding: 14, background: "white", borderRadius: 10,
          maxWidth: format === "bookmark" ? 240 : format === "5163" ? 360 : 280,
          margin: "0 auto",
        }}>
          <div dangerouslySetInnerHTML={{
            __html: renderLabel(
              students[0] || { id: "demo", firstName: "Anna", lastName: "Sample", grade: "1st" } as any,
              style, format, avatars[students[0]?.id || ""] || null, tagline.trim(),
            ),
          }} />
        </div>
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
        <button onClick={print} disabled={picked.size === 0} style={primary(picked.size === 0)}>
          🖨 Print {totalLabels} labels ({sheets} sheet{sheets === 1 ? "" : "s"})
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>
        💡 The barcode encodes <code style={{ fontFamily: "Menlo, monospace", color: "#f9a8d4" }}>STU-{`{studentId}`}</code> — scan it on the iPad to pull up the kid's folder (pending assignments, recent grades, quick log behaviors, give points). Use the bookmark format laminated as a name-strip kids carry around.
      </div>
    </div>
  );
}

/* ── Single-label renderer (used by both preview + print) ───────── */

function renderLabel(s: StarStudent, style: LabelStyle, format: Format, avatarUrl: string | null, tagline: string): string {
  const accent = gradeAccent(s.grade);
  const code = `STU-${s.id}`;
  const name = `${s.firstName || ""} ${s.lastName || ""}`.trim() || "—";
  const initial = (s.firstName || "?")[0].toUpperCase();
  const grade = s.grade || "";
  const tag = tagline ? `<div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${accent.ink};opacity:0.65;margin-top:2px;font-family:-apple-system,sans-serif">${escapeHtml(tagline)}</div>` : "";

  const photoBlock = (size: number) => avatarUrl
    ? `<img src="${avatarUrl}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2.5px solid ${accent.from};flex-shrink:0;background:white" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${accent.from},${accent.to});color:white;font-size:${Math.round(size * 0.5)}px;font-weight:900;flex-shrink:0;font-family:-apple-system,sans-serif">${escapeHtml(initial)}</div>`;

  const gradePill = grade
    ? `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${accent.from};color:white;font-size:9px;font-weight:900;letter-spacing:0.10em;font-family:-apple-system,sans-serif">${escapeHtml(grade.toUpperCase())}</span>`
    : "";

  // Bookmark gets its own bespoke layout regardless of style.
  if (format === "bookmark") {
    return `<div style="height:100%;width:100%;padding:18px 12px;display:flex;flex-direction:column;align-items:center;text-align:center;background:linear-gradient(180deg,${accent.from}11,${accent.to}22);border-radius:6px;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
      <div style="margin-bottom:14px">${photoBlock(96)}</div>
      <div style="font-size:32px;font-weight:900;letter-spacing:-0.02em;line-height:1.05;color:${accent.ink}">${escapeHtml(s.firstName || "")}</div>
      <div style="font-size:18px;font-weight:700;color:${accent.ink};opacity:0.65">${escapeHtml(s.lastName || "")}</div>
      <div style="margin-top:8px">${gradePill}</div>
      ${tag}
      <div style="flex:1"></div>
      <div style="margin-bottom:10px">${bc128svg(code, 0, 50, false, 1.4)}</div>
      <div style="font-size:8px;font-weight:700;letter-spacing:0.18em;color:${accent.ink};opacity:0.55">SCAN FOR ${escapeHtml(s.firstName || "").toUpperCase()}'S FOLDER</div>
    </div>`;
  }

  // 5163 (4×2") — bigger format, room for everything.
  if (format === "5163") {
    if (style === "name-only") {
      return `<div style="height:100%;width:100%;padding:14px 18px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,${accent.from}1a,${accent.to}33);border-left:8px solid ${accent.from};border-radius:6px;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
        <div style="font-size:42px;font-weight:900;letter-spacing:-0.025em;line-height:1">${escapeHtml(s.firstName || "")}</div>
        <div style="font-size:24px;font-weight:700;opacity:0.7;margin-top:2px">${escapeHtml(s.lastName || "")}</div>
        <div style="margin-top:8px">${gradePill}</div>
        ${tag}
      </div>`;
    }
    if (style === "barcode-big") {
      return `<div style="height:100%;width:100%;padding:12px 14px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;border:2px solid ${accent.from};border-radius:6px;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
        <div style="font-size:20px;font-weight:900;letter-spacing:-0.02em;margin-bottom:4px">${escapeHtml(name)}</div>
        ${gradePill}${tag ? `<div style="height:4px"></div>${tag}` : ""}
        <div style="margin-top:10px">${bc128svg(code, 0, 70, true, 2.0)}</div>
      </div>`;
    }
    // default + color-by-grade share the row layout for 5163
    return `<div style="height:100%;width:100%;padding:12px 16px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,${accent.from}10,${accent.to}25);border-left:8px solid ${accent.from};border-radius:6px;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
      ${photoBlock(72)}
      <div style="flex:1;min-width:0">
        <div style="font-size:24px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
        <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${gradePill}${tag}</div>
        <div style="margin-top:8px">${bc128svg(code, 0, 36, false, 1.0)}</div>
      </div>
    </div>`;
  }

  // 5160 — standard. Each style is distinct.
  if (style === "name-only") {
    return `<div style="height:100%;width:100%;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,${accent.from}1a,${accent.to}33);border-left:6px solid ${accent.from};border-radius:4px;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
      <div style="font-size:24px;font-weight:900;letter-spacing:-0.02em;line-height:1">${escapeHtml(s.firstName || "")}</div>
      <div style="font-size:13px;font-weight:700;opacity:0.65;line-height:1.05;margin-top:2px">${escapeHtml(s.lastName || "")}</div>
      <div style="margin-top:4px">${gradePill}</div>
    </div>`;
  }
  if (style === "barcode-big") {
    return `<div style="height:100%;width:100%;padding:4px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;border-left:4px solid ${accent.from};box-sizing:border-box">
      <div style="font-size:13px;font-weight:900;color:${accent.ink};font-family:-apple-system,sans-serif">${escapeHtml(name)}${grade ? ` <span style="opacity:0.6;font-size:10px">· ${escapeHtml(grade)}</span>` : ""}</div>
      <div style="margin-top:3px">${bc128svg(code, 0, 50, false, 1.2)}</div>
    </div>`;
  }
  if (style === "color-by-grade") {
    return `<div style="height:100%;width:100%;padding:8px 10px;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,${accent.from},${accent.to});border-radius:6px;color:white;font-family:-apple-system,sans-serif;box-sizing:border-box">
      ${photoBlock(48)}
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:900;letter-spacing:-0.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
        ${tag || (grade ? `<div style="font-size:10px;font-weight:800;opacity:0.85;letter-spacing:0.10em;margin-top:1px">${escapeHtml(grade.toUpperCase())}</div>` : "")}
        <div style="margin-top:3px;background:rgba(255,255,255,0.95);border-radius:3px;padding:2px;display:inline-block">${bc128svg(code, 0, 22, false, 0.9)}</div>
      </div>
    </div>`;
  }
  // default: name-photo-barcode
  return `<div style="height:100%;width:100%;padding:6px 8px;display:flex;align-items:center;gap:8px;background:white;font-family:-apple-system,sans-serif;color:${accent.ink};box-sizing:border-box">
    ${photoBlock(56)}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;height:100%">
      <div>
        <div style="font-size:14px;font-weight:900;letter-spacing:-0.01em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
        <div style="margin-top:1px;display:flex;gap:4px;align-items:center;flex-wrap:wrap">${gradePill}</div>
      </div>
      <div>${bc128svg(code, 0, 28, false, 1.0)}</div>
    </div>
  </div>`;
}

/* ── Print window ───────────────────────────────────────────────── */

function openLabelsWindow(students: StarStudent[], copies: number, style: LabelStyle, format: Format, avatars: Record<string, string | null>, tagline: string) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const fmt = FORMATS.find((f) => f.id === format)!;

  // Build the flat list of labels: each kid repeated `copies` times.
  const labels: StarStudent[] = [];
  for (const s of students) for (let i = 0; i < copies; i++) labels.push(s);

  // Compose sheets — N per page, padded with blanks so cut lines stay
  // aligned. For multi-column layouts we don't need physical gap
  // columns (CSS gap handles spacing).
  const sheets: string[] = [];
  for (let i = 0; i < labels.length; i += fmt.perPage) {
    const chunk = labels.slice(i, i + fmt.perPage);
    const cells: string[] = [];
    for (let j = 0; j < fmt.perPage; j++) {
      const s = chunk[j];
      cells.push(`<div class="cell">${s ? renderLabel(s, style, format, avatars[s.id] || null, tagline) : ""}</div>`);
    }
    sheets.push(`<section class="sheet">
      <div class="grid" style="grid-template-columns: repeat(${fmt.cols}, ${fmt.cellWidth}); grid-template-rows: repeat(${fmt.rows}, ${fmt.cellHeight}); column-gap: ${fmt.hGap};">
        ${cells.join("")}
      </div>
    </section>`);
  }

  w.document.write(`<!doctype html><html><head><title>Folder Labels — ${labels.length} labels (${fmt.id})</title>
    <style>
      @media print {
        @page { size: letter; margin: 0; }
        .toolbar { display: none; }
        body { margin: 0; }
      }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1235; padding: 0; margin: 0; background: #f3f4f6; }
      .toolbar { padding: 12px 24px; background: linear-gradient(90deg, #fef3c7, #fed7aa); display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #b45309; background: #b45309; color: white; font-weight: 700; cursor: pointer; }
      .sheet { width: 8.5in; height: 11in; padding: ${fmt.pagePadding}; box-sizing: border-box; background: white; margin: 12px auto; box-shadow: 0 4px 18px rgba(0,0,0,0.10); page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
      .grid { display: grid; }
      .cell { box-sizing: border-box; overflow: hidden; }
    </style>
  </head><body>
    <div class="toolbar">
      <div>📌 ${labels.length} label${labels.length === 1 ? "" : "s"} · ${Math.ceil(labels.length / fmt.perPage)} ${fmt.id} sheet${Math.ceil(labels.length / fmt.perPage) === 1 ? "" : "s"} · load ${fmt.id === "bookmark" ? "cardstock" : `${fmt.id} sheets`} in your printer</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    ${sheets.join("")}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
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
