import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

export default function AssignmentBuilder() {
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [form, setForm] = useState({
    classId: "", title: "", description: "", dueDate: "",
    rubric: [{ label: "Correctness", maxPoints: 50 }, { label: "Creativity", maxPoints: 50 }],
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.getClasses().then((c) => {
      setClasses(c);
      if (c.length > 0) { setForm((f) => ({ ...f, classId: c[0].id })); loadAssignments(c[0].id); }
    }).catch(console.error);
  }, []);

  const loadAssignments = async (classId: string) => { const a = await api.getAssignments(classId); setAssignments(a); };

  const handleCreate = async () => {
    if (!form.title || !form.classId) return;
    await api.createAssignment(form);
    setShowForm(false);
    loadAssignments(form.classId);
  };

  const addRubricItem = () => { setForm({ ...form, rubric: [...form.rubric, { label: "", maxPoints: 10 }] }); };

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Assignments</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">{showForm ? "Cancel" : "+ New Assignment"}</button>
      </div>

      <select value={form.classId}
        onChange={(e) => { setForm({ ...form, classId: e.target.value }); loadAssignments(e.target.value); }}
        className="w-64 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {showForm && (
        <div className="card space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Assignment title"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description / instructions"
            className="w-full h-24 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
          <div>
            <label className="text-xs text-white/40 block mb-1">Due Date</label>
            <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white focus:border-violet-500/50 focus:outline-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/40">Rubric</label>
              <button onClick={addRubricItem} className="text-xs text-violet-400 hover:text-violet-300">+ Add Item</button>
            </div>
            {form.rubric.map((item, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input value={item.label} onChange={(e) => { const r = [...form.rubric]; r[i] = { ...r[i], label: e.target.value }; setForm({ ...form, rubric: r }); }}
                  placeholder="Criteria" className="flex-1 text-sm py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 text-white placeholder-white/20 focus:outline-none" />
                <input type="number" value={item.maxPoints} onChange={(e) => { const r = [...form.rubric]; r[i] = { ...r[i], maxPoints: Number(e.target.value) }; setForm({ ...form, rubric: r }); }}
                  className="w-20 text-sm py-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 text-white focus:outline-none" />
                <span className="text-xs text-white/30 self-center">pts</span>
              </div>
            ))}
          </div>
          <button onClick={handleCreate} className="btn-primary">Create Assignment</button>
        </div>
      )}

      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">{a.title}</h3>
                <p className="text-sm text-white/40 mt-1">{a.description}</p>
              </div>
              <div className="text-right">
                {a.due_date && <div className="text-xs text-white/30">Due: {new Date(a.due_date).toLocaleDateString()}</div>}
                <div className="text-xs text-white/30">{(a.rubric || []).reduce((s: number, r: any) => s + r.maxPoints, 0)} total points</div>
              </div>
            </div>
          </div>
        ))}
        {assignments.length === 0 && <div className="text-center text-white/30 py-8">No assignments yet</div>}
      </div>
    </div>
  );
}
