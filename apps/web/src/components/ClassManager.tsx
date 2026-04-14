import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import ChatPanel from "./ChatPanel.tsx";

export default function ClassManager() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cls, setCls] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [behavior, setBehavior] = useState<any[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [tab, setTab] = useState<"students" | "attendance" | "behavior" | "chat">("students");

  useEffect(() => {
    if (!id) return;
    api.getClass(id).then(setCls).catch(console.error);
    if (user?.role !== "student") {
      api.getStudents(id).then(setStudents).catch(() => {});
      api.getAttendance(id).then(setAttendance).catch(() => {});
      api.getBehavior(id).then(setBehavior).catch(() => {});
    }
  }, [id, user]);

  const handleBulkImport = async () => {
    if (!id || !bulkInput.trim()) return;
    const lines = bulkInput.trim().split("\n");
    const studs = lines.map((line) => {
      const [name, email] = line.split(",").map((s) => s.trim());
      return { name: name || email, email, password: "password123" };
    }).filter((s) => s.email);
    const result = await api.importStudents(id, studs);
    alert(`Imported ${result.imported} students`);
    setBulkInput("");
    api.getStudents(id).then(setStudents);
  };

  const handleMarkAttendance = async () => {
    if (!id) return;
    const records = students.map((s) => ({ userId: s.id, present: true }));
    await api.saveAttendance(id, records);
    alert("Attendance saved");
  };

  const handleAddBehavior = async (studentId: string, type: string, note: string) => {
    if (!id) return;
    const log = await api.addBehavior(id, studentId, type, note);
    setBehavior((prev) => [log, ...prev]);
  };

  if (!cls) return <div className="p-6 text-white/30">Loading class...</div>;

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">{cls.name}</h1>
        <p className="text-white/40 text-sm mt-1">Class Code: <span className="text-violet-400 font-mono">{cls.code}</span></p>
      </div>

      <div className="flex gap-2">
        {(["students", "attendance", "behavior", "chat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:text-white/70 border border-white/[0.06]"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "students" && (
        <div className="space-y-4">
          {user?.role !== "student" && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-2">Bulk Import Students</h3>
              <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)}
                placeholder={"Name, email (one per line)\nJohn Smith, john@school.edu"}
                className="w-full h-24 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none mb-2" />
              <button onClick={handleBulkImport} className="btn-primary text-sm">Import</button>
            </div>
          )}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-3">Students ({students.length})</h3>
            <div className="space-y-2">
              {students.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2 border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm text-white">{s.name}</div>
                      <div className="text-xs text-white/30">{s.email}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "attendance" && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Today's Attendance</h3>
            <button onClick={handleMarkAttendance} className="btn-primary text-xs">Mark All Present</button>
          </div>
          <div className="space-y-1">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 text-sm border border-white/[0.04]">
                <span className="text-white">{s.name}</span>
                <span className="text-emerald-400">✓ Present</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "behavior" && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">Behavior Logs</h3>
          <div className="space-y-2 mb-4">
            {students.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="text-sm text-white w-32 truncate">{s.name}</span>
                <button onClick={() => handleAddBehavior(s.id, "positive", "Good work!")}
                  className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">+Positive</button>
                <button onClick={() => handleAddBehavior(s.id, "warning", "Off task")}
                  className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors">+Warning</button>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {behavior.map((b) => (
              <div key={b.id} className={`text-xs px-3 py-1.5 rounded-lg ${b.type === "positive" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                {b.note} — {new Date(b.created_at).toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "chat" && id && <ChatPanel classId={id} />}
    </div>
  );
}
