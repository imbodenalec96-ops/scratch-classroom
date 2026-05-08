// Raw data inspector for STAR localStorage. Lets the teacher see
// exactly what's stored — assignments, submissions, refusals, passes,
// the barcode database, and per-student submission counts. Useful for
// debugging "where's my data" complaints.

import { useEffect, useMemo, useState } from "react";
import { StarStore } from "../../lib/star/storage.ts";

type SectionId = "students" | "assignments" | "tracker" | "bcdb" | "log" | "passes" | "passLog";

const SECTIONS: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: "students",    label: "Students (star_s)",                icon: "👥" },
  { id: "tracker",     label: "Assignment Tracker (star_asntrack)", icon: "📚" },
  { id: "bcdb",        label: "Barcode Database (star_bcdb)",     icon: "📷" },
  { id: "assignments", label: "Assignment List (star_a)",         icon: "📝" },
  { id: "log",         label: "Refusal Log (star_l)",             icon: "🚨" },
  { id: "passes",      label: "Active Passes (star_active_passes)",icon: "🚻" },
  { id: "passLog",     label: "Pass Log (star_pass_log)",         icon: "⏱" },
];

export default function StarDataView() {
  const [selected, setSelected] = useState<SectionId>("tracker");
  const [tick, setTick] = useState(0);
  // Refresh every couple seconds so freshly-saved data appears live.
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 2000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    void tick;
    return {
      students:    StarStore.getStudents(),
      tracker:     StarStore.getAsnTrack(),
      bcdb:        StarStore.getBcDB(),
      assignments: StarStore.getAsns(),
      log:         StarStore.getLog(),
      passes:      StarStore.getActivePasses(),
      passLog:     StarStore.getPassLog(),
    };
  }, [tick]);

  const counts = {
    students:    data.students.length,
    tracker:     Object.keys(data.tracker).length,
    bcdb:        Object.keys(data.bcdb).length,
    assignments: data.assignments.length,
    log:         data.log.length,
    passes:      data.passes.length,
    passLog:     data.passLog.length,
  };

  const submissionsTotal = Object.values(data.tracker).reduce((a, t) => a + (t.submissions?.length || 0), 0);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `star-data-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const clearKey = (id: SectionId) => {
    const label = SECTIONS.find((s) => s.id === id)?.label || id;
    const ok = window.confirm(`Wipe ${label}? This cannot be undone.`);
    if (!ok) return;
    if (id === "students")    StarStore.setStudents([]);
    if (id === "tracker")     StarStore.setAsnTrack({});
    if (id === "bcdb")        StarStore.setBcDB({});
    if (id === "assignments") StarStore.setAsns([]);
    if (id === "log")         StarStore.setLog([]);
    if (id === "passes")      StarStore.setActivePasses([]);
    if (id === "passLog")     StarStore.setPassLog([]);
    setTick((n) => n + 1);
  };

  const clearAll = () => {
    const ok = window.confirm("Wipe ALL STAR data — students, assignments, submissions, refusals, passes? This cannot be undone.");
    if (!ok) return;
    StarStore.setStudents([]);
    StarStore.setAsnTrack({});
    StarStore.setBcDB({});
    StarStore.setAsns([]);
    StarStore.setLog([]);
    StarStore.setActivePasses([]);
    StarStore.setPassLog([]);
    setTick((n) => n + 1);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, color: "#f5f1e8" }}>
      {/* Sidebar — section picker with counts */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 12, alignSelf: "start",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 10, padding: "0 4px" }}>
          📊 Storage Inspector
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {SECTIONS.map((s) => {
            const active = selected === s.id;
            return (
              <button key={s.id} onClick={() => setSelected(s.id)} style={{
                padding: "9px 10px", borderRadius: 8,
                background: active ? "linear-gradient(135deg, rgba(99,102,241,0.30), rgba(178,58,72,0.20))" : "transparent",
                border: active ? "1px solid rgba(251,191,36,0.40)" : "1px solid transparent",
                color: "white", textAlign: "left", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{s.icon}</span>
                  <span>{s.label.split(" (")[0]}</span>
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: counts[s.id] > 0 ? "#fde68a" : "rgba(255,255,255,0.25)",
                  fontFamily: "Menlo, monospace",
                }}>{counts[s.id]}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12, padding: "10px 8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>
            Submissions across all assignments: <b style={{ color: "#fde68a" }}>{submissionsTotal}</b>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={exportJSON} style={ghost()}>📥 Export all as JSON</button>
            <button onClick={clearAll} style={danger()}>🔥 Wipe everything</button>
          </div>
        </div>
      </div>

      {/* Main — selected table */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, minHeight: 420,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
              {SECTIONS.find((s) => s.id === selected)?.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{counts[selected]} row{counts[selected] === 1 ? "" : "s"}</div>
          </div>
          <button onClick={() => clearKey(selected)} style={danger()}>🗑 Wipe this section</button>
        </div>

        <SectionTable id={selected} data={data} />
      </div>
    </div>
  );
}

/* ── per-section views ───────────────────────────────────────────── */

function SectionTable({ id, data }: { id: SectionId; data: any }) {
  if (id === "students") {
    const rows = data.students;
    if (!rows.length) return <Empty />;
    return (
      <Table headers={["ID", "First", "Last", "Grade", "Email"]} rows={rows.map((s: any) => [s.id, s.firstName, s.lastName, s.grade || "—", s.email || "—"])} />
    );
  }
  if (id === "tracker") {
    const rows = Object.entries(data.tracker);
    if (!rows.length) return <Empty />;
    return (
      <Table
        headers={["Barcode", "Name", "Subject", "Grade", "Student", "Subs", "Created"]}
        rows={rows.map(([id, t]: any) => [
          id, t.name, t.subject, t.gradeLevel || "—",
          t.studentName || (t.studentId ? "(by id)" : "—"),
          (t.submissions || []).length,
          t.createdDate ? new Date(t.createdDate).toLocaleDateString() : "—",
        ])}
      />
    );
  }
  if (id === "bcdb") {
    const rows = Object.entries(data.bcdb);
    if (!rows.length) return <Empty />;
    return (
      <Table
        headers={["Barcode", "Type", "Name", "Subject / Pass", "Created"]}
        rows={rows.map(([id, e]: any) => [
          id, e.type, e.name, (e.subject || e.passKind || "—"),
          e.createdDate ? new Date(e.createdDate).toLocaleDateString() : "—",
        ])}
      />
    );
  }
  if (id === "assignments") {
    const rows = data.assignments;
    if (!rows.length) return <Empty />;
    return (
      <Table headers={["ID", "Name", "Subject", "Grade", "Type"]} rows={rows.map((a: any) => [a.id, a.name, a.subject, a.grade || "—", a.type])} />
    );
  }
  if (id === "log") {
    const rows = data.log;
    if (!rows.length) return <Empty />;
    return (
      <Table
        headers={["#", "Date", "Student", "Type", "Subject", "Task"]}
        rows={rows.map((r: any) => [r.num, `${r.date} ${r.time}`, r.student, r.type, r.subject || "—", r.task || "—"])}
      />
    );
  }
  if (id === "passes") {
    const rows = data.passes;
    if (!rows.length) return <Empty />;
    return (
      <Table headers={["Student", "Pass Type", "Started"]} rows={rows.map((p: any) => [p.studentName, p.passKind, new Date(p.startedAt).toLocaleTimeString()])} />
    );
  }
  if (id === "passLog") {
    const rows = data.passLog;
    if (!rows.length) return <Empty />;
    return (
      <Table
        headers={["Student", "Pass", "Started", "Ended", "Elapsed"]}
        rows={rows.map((p: any) => [
          p.studentName, p.passKind,
          new Date(p.startedAt).toLocaleTimeString(),
          new Date(p.endedAt).toLocaleTimeString(),
          `${Math.floor(p.elapsedSec / 60)}:${String(p.elapsedSec % 60).padStart(2, "0")}`,
        ])}
      />
    );
  }
  return null;
}

function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 540, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ background: "rgba(0,0,0,0.40)", position: "sticky", top: 0 }}>
          <tr>{headers.map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "8px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280, fontFamily: j === 0 ? "Menlo, monospace" : undefined, color: j === 0 ? "#fde68a" : undefined }}>
                  {String(c ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 20, opacity: 0.5, textAlign: "center", fontSize: 13 }}>Empty.</div>;
}

function ghost(): React.CSSProperties {
  return {
    padding: "8px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
    width: "100%", textAlign: "left",
  };
}
function danger(): React.CSSProperties {
  return {
    padding: "8px 10px", borderRadius: 8,
    background: "rgba(239,68,68,0.10)", color: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.40)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
    width: "100%", textAlign: "left",
  };
}
