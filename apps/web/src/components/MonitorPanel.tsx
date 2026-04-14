import React, { useEffect, useState } from "react";
import { getSocket } from "../lib/ws.ts";
import { api } from "../lib/api.ts";

export default function MonitorPanel() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadStudents(c[0].id); } }).catch(console.error);
  }, []);

  const loadStudents = async (cid: string) => { try { const s = await api.getStudents(cid); setStudents(s); } catch { setStudents([]); } };

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { studentId: string; screenshot: string }) => {
      setScreenshots((prev) => ({ ...prev, [data.studentId]: data.screenshot }));
    };
    socket.on("student:screen", handler);
    return () => { socket.off("student:screen", handler); };
  }, []);

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Monitor</h1>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); loadStudents(e.target.value); }}
          className="w-48 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {students.map((s) => (
          <div key={s.id} className="card-hover">
            <div className="h-40 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-3 overflow-hidden">
              {screenshots[s.id] ? (
                <img src={screenshots[s.id]} alt={`${s.name}'s screen`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/20 text-sm">No screen data</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-white">{s.name}</span>
            </div>
          </div>
        ))}
        {students.length === 0 && <div className="col-span-3 text-center text-white/30 py-8">No students in this class</div>}
      </div>
    </div>
  );
}
