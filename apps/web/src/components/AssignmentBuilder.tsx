import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";

export default function AssignmentBuilder() {
  const { theme } = useTheme();
  const dk = theme === "dark";
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
  const addRubricItem = () => setForm({ ...form, rubric: [...form.rubric, { label: "", maxPoints: 10 }] });

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-t1">Assignments</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancel" : "+ New Assignment"}
        </button>
      </div>

      <select
        value={form.classId}
        onChange={(e) => { setForm({ ...form, classId: e.target.value }); loadAssignments(e.target.value); }}
        className="input w-64"
      >
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {showForm && (
        <div className="card space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Assignment title" className="input w-full" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description / instructions" className="input w-full h-24 resize-none" />
          <div>
            <label className="text-xs text-t3 block mb-1">Due Date</label>
            <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="input" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-t3">Rubric</label>
              <button onClick={addRubricItem} className="text-xs text-violet-400 hover:text-violet-500 cursor-pointer">+ Add Item</button>
            </div>
            {form.rubric.map((item, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input value={item.label}
                  onChange={(e) => { const r = [...form.rubric]; r[i] = { ...r[i], label: e.target.value }; setForm({ ...form, rubric: r }); }}
                  placeholder="Criteria" className="input flex-1 py-1.5 text-sm" />
                <input type="number" value={item.maxPoints}
                  onChange={(e) => { const r = [...form.rubric]; r[i] = { ...r[i], maxPoints: Number(e.target.value) }; setForm({ ...form, rubric: r }); }}
                  className="input w-20 py-1.5 text-sm" />
                <span className="text-xs text-t3 self-center">pts</span>
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
                <h3 className="font-semibold text-t1">{a.title}</h3>
                <p className="text-sm text-t2 mt-1">{a.description}</p>
              </div>
              <div className="text-right">
                {a.due_date && <div className="text-xs text-t3">Due: {new Date(a.due_date).toLocaleDateString()}</div>}
                <div className="text-xs text-t3">{(a.rubric || []).reduce((s: number, r: any) => s + r.maxPoints, 0)} total points</div>
              </div>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <div className="text-center text-t3 py-8">No assignments yet</div>
        )}
      </div>
    </div>
  );
}
