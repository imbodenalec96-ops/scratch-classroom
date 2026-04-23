import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.ts";

// Printable, paper-friendly assignment view.
// Route: /print/assignment/:id
// Usage: teacher clicks "Print" on an assignment row → new tab opens here →
// browser's Cmd/Ctrl+P renders a clean handout with answer lines.
export default function PrintAssignment() {
  const { id } = useParams();
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getAssignment(id).then(setA).catch((e) => setErr(e?.message || "Load failed"));
  }, [id]);

  // Auto-trigger print dialog once content is laid out
  useEffect(() => {
    if (!a) return;
    const t = setTimeout(() => { try { window.print(); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [a]);

  if (err) return <div style={{ padding: 32, fontFamily: "system-ui" }}>Error: {err}</div>;
  if (!a) return <div style={{ padding: 32, fontFamily: "system-ui" }}>Loading…</div>;

  const content = typeof a.content === "string" ? safeJSON(a.content) : a.content;
  const sections: any[] = content?.sections || [];
  const hasSections = sections.length > 0;

  return (
    <div className="print-root">
      <style>{printStyles}</style>

      <header className="print-header">
        <h1>{a.title || "Assignment"}</h1>
        <div className="meta">
          <span>Name: ________________________________</span>
          <span>Date: ______________</span>
        </div>
        {a.description && <p className="desc">{stripTag(a.description)}</p>}
        {(a.target_subject || a.target_grade_min != null) && (
          <p className="tags">
            {a.target_subject && <span>Subject: {a.target_subject}</span>}
            {a.target_grade_min != null && (
              <span> · Grade: {a.target_grade_min}{a.target_grade_max != null && a.target_grade_max !== a.target_grade_min ? `–${a.target_grade_max}` : ""}</span>
            )}
            {a.estimated_minutes && <span> · ~{a.estimated_minutes} min</span>}
          </p>
        )}
      </header>

      {hasSections ? (
        <div className="sections">
          {sections.map((sec: any, si: number) => (
            <section key={si} className="section">
              {sec.title && <h2>Part {si + 1}: {sec.title}</h2>}
              {sec.instructions && <p className="instr">{sec.instructions}</p>}
              {sec.passage && (
                <div className="passage">
                  <div className="passage-label">📖 Read the passage below, then answer the questions.</div>
                  <p className="passage-text">{sec.passage}</p>
                </div>
              )}
              <ol className="questions">
                {(sec.questions || []).map((q: any, qi: number) => (
                  <li key={qi} className="q">
                    <div className="q-text">{q.text || `Question ${qi + 1}`}</div>
                    {q.type === "multiple_choice" && Array.isArray(q.options) && (
                      <ul className="choices">
                        {q.options.map((opt: string, oi: number) => (
                          <li key={oi}>
                            <span className="bubble">○</span>
                            <span>{String.fromCharCode(65 + oi)}. {opt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.type === "short_answer" && <AnswerLines count={2} />}
                    {q.type === "long_answer" && <AnswerLines count={5} />}
                    {!q.type && <AnswerLines count={2} />}
                    {q.type === "fill_blank" && <AnswerLines count={1} />}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="freeform">
          <p>Work space:</p>
          <AnswerLines count={20} />
        </div>
      )}

      <footer className="print-footer">
        <span>Printed from BlockForge Classroom</span>
      </footer>
    </div>
  );
}

function AnswerLines({ count }: { count: number }) {
  return (
    <div className="lines">
      {Array.from({ length: count }).map((_, i) => <div key={i} className="line" />)}
    </div>
  );
}

function safeJSON(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
function stripTag(s: string): string {
  return String(s || "").replace(/^\[AI-Generated\]\s*/, "");
}

const printStyles = `
  @page { size: letter; margin: 0.6in; }
  body { background: white !important; }
  .print-root {
    color: #000;
    background: #fff;
    font-family: Georgia, "Times New Roman", serif;
    max-width: 7.5in;
    margin: 0 auto;
    padding: 0.4in 0.2in;
    line-height: 1.5;
  }
  .print-header h1 { font-size: 24pt; margin: 0 0 6pt; }
  .print-header .meta { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 10pt; }
  .print-header .desc { font-size: 11pt; margin: 6pt 0; }
  .print-header .tags { font-size: 10pt; color: #555; margin: 2pt 0 14pt; }
  .section { margin-top: 18pt; break-inside: avoid; }
  .section h2 { font-size: 14pt; margin: 0 0 4pt; border-bottom: 1pt solid #000; padding-bottom: 3pt; }
  .section .instr { font-size: 10.5pt; font-style: italic; margin: 4pt 0 8pt; }
  .passage { border: 1pt solid #aaa; border-left: 4pt solid #555; padding: 8pt 10pt; margin: 8pt 0 12pt; background: #f9f9f9; break-inside: avoid; }
  .passage-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4pt; }
  .passage-text { font-size: 11.5pt; line-height: 1.6; white-space: pre-wrap; }
  .questions { padding-left: 1.2em; }
  .q { margin-bottom: 14pt; break-inside: avoid; }
  .q-text { font-size: 12pt; font-weight: 600; margin-bottom: 4pt; }
  .choices { list-style: none; padding-left: 1em; margin: 4pt 0; }
  .choices li { display: flex; align-items: center; gap: 6pt; font-size: 11pt; margin: 3pt 0; }
  .choices .bubble { font-size: 14pt; line-height: 1; }
  .lines { margin-top: 6pt; }
  .line { border-bottom: 1pt solid #222; height: 22pt; }
  .freeform { margin-top: 18pt; font-size: 11pt; }
  .print-footer { margin-top: 24pt; font-size: 9pt; color: #777; text-align: center; border-top: 1pt dashed #999; padding-top: 6pt; }
  @media print {
    .print-root { padding: 0; }
    a[href]:after { content: none !important; }
  }
`;
