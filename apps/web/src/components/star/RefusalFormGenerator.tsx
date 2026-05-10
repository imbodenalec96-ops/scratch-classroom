// Refusal form generator. Mints a fresh barcode (WR- or SP-),
// registers it in bcDB so the scanner pulls up the right RefusalModal,
// and prints a paper form ready for staff to fill in by hand.

import { useState } from "react";
import {
  StarStore, saveAll, nextBarcode,
  type StarStudent, type BcEntry,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

type FormType = "Work Refusal" | "Specials Refusal";

export default function RefusalFormGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [type, setType] = useState<FormType>("Work Refusal");
  const [studentId, setStudentId] = useState("");
  const [created, setCreated] = useState<{ id: string; type: FormType; studentName: string } | null>(null);

  const create = () => {
    if (!studentId) return;
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const studentName = `${s.firstName} ${s.lastName}`;
    const bcDB = StarStore.getBcDB();
    const prefix = type === "Specials Refusal" ? "SP" : "WR";
    const id = nextBarcode(prefix, bcDB);
    const entry: BcEntry = {
      id,
      type: type === "Specials Refusal" ? "specials-refusal-form" : "work-refusal-form",
      name: `${type} for ${studentName}`,
      studentName,
      createdDate: new Date().toISOString(),
    };
    bcDB[id] = entry;
    saveAll({ bcDB });
    successBeep();
    setCreated({ id, type, studentName });
  };

  const print = () => {
    if (!created) return;
    openPrintWindow(created);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Form type">
          <select value={type} onChange={(e) => setType(e.target.value as FormType)} style={inp()}>
            <option>Work Refusal</option>
            <option>Specials Refusal</option>
          </select>
        </Field>
        <Field label="Student">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
            <option value="">— Pick a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={create} disabled={!studentId} style={primaryBtn()}>
          🖨 Mint barcode
        </button>
      </div>

      {created && (
        <div style={{
          marginTop: 14, padding: 14, borderRadius: 12,
          background: "rgba(180,58,72,0.10)",
          border: "1px solid rgba(251,191,36,0.40)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                {created.type}
              </div>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 18, color: "#fde68a" }}>{created.id}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>For {created.studentName}</div>
            </div>
            <button onClick={print} style={ghostBtn()}>🖨 Print form</button>
          </div>
          <div style={{ marginTop: 12 }}
            dangerouslySetInnerHTML={{ __html: bc128svg(created.id, 0, 70, true, 2.0) }}
          />
        </div>
      )}
    </div>
  );
}

function openPrintWindow(c: { id: string; type: FormType; studentName: string }) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const barcodeSvg = bc128svg(c.id, 0, 90, true, 2.0);
  const today = new Date().toLocaleDateString();

  const checkbox = (label: string) =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0">
       <span style="display:inline-block;width:14px;height:14px;border:1.5px solid #444;border-radius:3px"></span>${escapeHtml(label)}
     </label>`;

  const behaviors = ["Refused verbally","Put head down","Pushed materials","Tore/crumpled","Ignored prompts","Walked away","Threw items","Other"];
  const interventions = ["Verbal 1×","Verbal 3×","Break offered","Task modified","Choice offered","Visual support","Token board","First-Then","Redirection"];
  const actions = ["Parent contacted","Admin notified","Privileges removed","Work sent home","Free time removed","Tech time removed"];

  const html = `<!doctype html><html><head><title>${escapeHtml(c.type)} — ${escapeHtml(c.id)}</title>
  <style>
    @media print { @page { size: letter; margin: 0.5in; } }
    body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 16px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .box { border:1px solid #ccc; border-radius:6px; padding:8px 10px; margin-bottom:10px; }
    .label { font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#555;margin-bottom:3px;font-weight:700 }
    .line { border-bottom:1px solid #444; height:22px; }
  </style></head>
  <body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <h1>🚨 ${escapeHtml(c.type)} Incident Form</h1>
        <div style="font-size:12px;color:#555">Date: ${today}</div>
      </div>
      <div style="text-align:right">${barcodeSvg}</div>
    </div>

    <div class="box">
      <div class="grid2">
        <div><div class="label">Student</div><div style="font-size:14px;font-weight:700">${escapeHtml(c.studentName)}</div></div>
        <div><div class="label">Time</div><div class="line"></div></div>
      </div>
    </div>

    <div class="box">
      <div class="grid2">
        <div><div class="label">Subject</div><div class="line"></div></div>
        <div><div class="label">Assignment / Task</div><div class="line"></div></div>
      </div>
    </div>

    <div class="box">
      <div class="label">Behaviors observed</div>
      <div class="grid3">${behaviors.map(checkbox).join("")}</div>
    </div>

    <div class="box">
      <div class="label">Interventions tried</div>
      <div class="grid3">${interventions.map(checkbox).join("")}</div>
    </div>

    <div class="box">
      <div class="label">Actions taken</div>
      <div class="grid3">${actions.map(checkbox).join("")}</div>
    </div>

    <div class="box">
      <div class="grid2">
        <div><div class="label">Parent contacted?</div><div class="line"></div></div>
        <div><div class="label">Admin notified?</div><div class="line"></div></div>
      </div>
    </div>

    <div class="box">
      <div class="label">Notes</div>
      <div style="border-bottom:1px solid #444;height:24px;margin-bottom:6px"></div>
      <div style="border-bottom:1px solid #444;height:24px;margin-bottom:6px"></div>
      <div style="border-bottom:1px solid #444;height:24px"></div>
    </div>

    <div class="box" style="margin-top:18px;background:#fffbe8;border-color:#fbbf24">
      <div class="label" style="color:#7c2d12">Student signature (required)</div>
      <div class="line" style="border-bottom-width:2px;height:30px"></div>
      <div style="font-size:10px;color:#666;margin-top:4px">By signing, the student acknowledges this incident was discussed with them.</div>
    </div>

    <div class="grid2" style="margin-top:14px">
      <div><div class="label">Staff signature</div><div class="line"></div></div>
      <div><div class="label">Admin signature</div><div class="line"></div></div>
    </div>

    <div style="margin-top:16px;font-size:10px;color:#888">
      Scan the barcode above with the STAR system to log this incident digitally.
    </div>

    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, outline: "none",
  };
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14,
  };
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 13,
  };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
