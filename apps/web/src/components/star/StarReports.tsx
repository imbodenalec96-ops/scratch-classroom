// STAR reports — filterable tables of refusal logs, assignment submissions,
// and the barcode database. CSV export for each.

import { useMemo, useState } from "react";
import {
  StarStore,
  type StarRefusalLog, type StarTrackerEntry, type BcEntry,
} from "../../lib/star/storage.ts";

type Tab = "refusals" | "assignments" | "barcodes";

export default function StarReports() {
  const [tab, setTab] = useState<Tab>("refusals");
  const [q, setQ] = useState("");

  const log = useMemo(() => StarStore.getLog(), []);
  const tracker = useMemo(() => StarStore.getAsnTrack(), []);
  const bcDB = useMemo(() => StarStore.getBcDB(), []);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14, padding: 16, color: "#f5f1e8",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>📊 Reports & Logs</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search…" style={{
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(0,0,0,0.30)", color: "white",
          border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 13, outline: "none", minWidth: 220,
        }} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([
          { id: "refusals" as Tab, label: `Refusals (${log.length})` },
          { id: "assignments" as Tab, label: `Assignments (${Object.keys(tracker).length})` },
          { id: "barcodes" as Tab, label: `Barcodes (${Object.keys(bcDB).length})` },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 12px", borderRadius: 8,
              background: tab === t.id ? "linear-gradient(135deg,#6366f1,#b23a48)" : "rgba(255,255,255,0.05)",
              color: "white",
              border: tab === t.id ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(255,255,255,0.12)",
              fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "refusals"   && <RefusalsTable rows={log} q={q} />}
      {tab === "assignments" && <AssignmentsTable tracker={tracker} q={q} />}
      {tab === "barcodes"   && <BarcodesTable bcDB={bcDB} q={q} />}
    </div>
  );
}

function RefusalsTable({ rows, q }: { rows: StarRefusalLog[]; q: string }) {
  const filtered = rows.filter((r) => matches(q, [r.barcode, r.student, r.type, r.subject, r.task, r.notes]));
  return (
    <Table
      headers={["#", "Date", "Student", "Type", "Subject", "Task", "Behaviors", "Parent", "Admin", "Barcode"]}
      rows={filtered.map((r) => [r.num, `${r.date} ${r.time}`, r.student, r.type, r.subject || "", r.task || "", r.behaviors, r.parent, r.admin, r.barcode])}
      onExport={() => exportCsv("refusals.csv",
        ["#","Date","Time","Student","Student ID","Type","Subject","Task","Behaviors","Interventions","Actions","Parent","Admin","Notes","Barcode"],
        filtered.map((r) => [r.num, r.date, r.time, r.student, r.studentId, r.type, r.subject || "", r.task || "", r.behaviors, r.interventions, r.actions, r.parent, r.admin, r.notes, r.barcode])
      )}
    />
  );
}
function AssignmentsTable({ tracker, q }: { tracker: Record<string, StarTrackerEntry>; q: string }) {
  const flat: Array<[string, StarTrackerEntry]> = Object.entries(tracker);
  const filtered = flat.filter(([id, e]) => matches(q, [id, e.name, e.subject, e.gradeLevel, e.studentName, e.goal]));
  const rows = filtered.flatMap(([id, e]) => {
    if (!e.submissions || e.submissions.length === 0) {
      return [[id, e.name, e.subject, e.gradeLevel || "", e.studentName || "", "—", "—", "—", e.status]];
    }
    return e.submissions.map((s) => [id, e.name, e.subject, e.gradeLevel || "", s.studentName, `${s.score}/${s.maxScore}`, `${s.pct}%`, s.letterGrade, s.status]);
  });
  return (
    <Table
      headers={["Barcode", "Name", "Subject", "Grade", "Student", "Score", "%", "Letter", "Status"]}
      rows={rows}
      onExport={() => exportCsv("assignments.csv",
        ["Barcode","Name","Subject","Grade","Student","Score","Max","%","Letter","Status","Date","Time Spent","Feedback","Notes"],
        filtered.flatMap(([id, e]) => (e.submissions?.length ? e.submissions.map((s) => [id, e.name, e.subject, e.gradeLevel || "", s.studentName, s.score, s.maxScore, s.pct, s.letterGrade, s.status, s.completedDate, s.timeSpent || "", s.feedback || "", s.notes || ""]) : [[id, e.name, e.subject, e.gradeLevel || "", "", "", "", "", "", e.status, "", "", "", ""]]))
      )}
    />
  );
}
function BarcodesTable({ bcDB, q }: { bcDB: Record<string, BcEntry>; q: string }) {
  const rows = Object.entries(bcDB).filter(([id, e]) => matches(q, [id, e.name, (e as any).subject, (e as any).studentName]));
  return (
    <Table
      headers={["Barcode", "Type", "Name", "Created"]}
      rows={rows.map(([id, e]) => [id, e.type, e.name, e.createdDate ? new Date(e.createdDate).toLocaleDateString() : "—"])}
      onExport={() => exportCsv("barcodes.csv",
        ["Barcode","Type","Name","Created"],
        rows.map(([id, e]) => [id, e.type, e.name, e.createdDate])
      )}
    />
  );
}

function Table({ headers, rows, onExport }: { headers: string[]; rows: any[][]; onExport: () => void }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.6 }}>{rows.length} row{rows.length === 1 ? "" : "s"}</div>
        <button onClick={onExport} style={{
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(255,255,255,0.05)", color: "white",
          border: "1px solid rgba(255,255,255,0.15)",
          fontWeight: 700, cursor: "pointer", fontSize: 12,
        }}>📥 Export CSV</button>
      </div>
      <div style={{ overflow: "auto", maxHeight: 480, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ background: "rgba(0,0,0,0.40)", position: "sticky", top: 0 }}>
            <tr>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} style={{ padding: 16, textAlign: "center", opacity: 0.6 }}>No rows.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {r.map((c, j) => (
                  <td key={j} style={{ padding: "8px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{String(c ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function matches(q: string, fields: (string | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => (f || "").toString().toLowerCase().includes(needle));
}

function exportCsv(name: string, headers: string[], rows: any[][]) {
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
