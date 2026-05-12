// "I'm out tomorrow" packet — one-tap printable substitute teacher
// pack. Pulls the schedule + roster + each kid's triggers/strategies
// (subNotes), formats it for a sub who's never seen the room before.
//
// IEP goals are intentionally NOT included — they're confidential and
// don't belong in a sub packet. Use the SEIF report (in /star → IEP)
// for IEP-team distribution instead.
//
// Optional fields the teacher fills here (saved locally):
//   - Day note (e.g. "Math is at 11 today, not the usual 10")
//   - Custom sections (anything else: lunch count routine, log-in
//     codes, where the bathroom keys live, etc.)
//   - Emergency contacts (custodian, principal, nurse)

import { useEffect, useMemo, useState } from "react";
import {
  StarStore,
  type StarStudent,
} from "../../lib/star/storage.ts";
import { api } from "../../lib/api.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

interface ScheduleBlock {
  start_time: string;
  end_time: string;
  label?: string;
  subject?: string;
  is_break?: number | boolean;
}

const KEYS = {
  emergency: "star_subplans_emergency",
  notes: "star_subplans_day_notes",
  teacher: "star_subplans_teacher",
  customSections: "star_subplans_custom_sections",
  manualSchedule: "star_subplans_manual_schedule",
};

interface CustomSection {
  id: string;
  title: string;
  body: string;
}

function todayPacific(): string {
  const d = new Date(Date.now() - 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function SubPlansGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => {
    const t = new Date(Date.now() - 7 * 3600_000 + 86_400_000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  });
  const [teacherName, setTeacherName] = useState<string>(() => loadStr(KEYS.teacher, ""));
  const [emergencyText, setEmergencyText] = useState<string>(() => loadStr(KEYS.emergency, defaultEmergencyText()));
  const [dayNote, setDayNote] = useState<string>(() => loadStr(KEYS.notes, ""));
  // Manual schedule rows for when the API doesn't have one (or when
  // the teacher wants to override). Saved locally per device.
  const [manualSchedule, setManualSchedule] = useState<ScheduleBlock[]>(() => loadJson<ScheduleBlock[]>(KEYS.manualSchedule, []));
  const [showSchedEditor, setShowSchedEditor] = useState(false);
  // Custom sections — anything else the sub needs (lunch count
  // routine, where the bathroom key lives, computer login info, etc.)
  const [customSections, setCustomSections] = useState<CustomSection[]>(() => loadJson<CustomSection[]>(KEYS.customSections, []));

  // Load the class schedule from the API once mounted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cs: any[] = await api.getClasses();
        const cls = Array.isArray(cs) ? cs[0] : null;
        if (!cls?.id) { setScheduleErr("No class found."); return; }
        const data = await api.getBoardData(cls.id);
        if (cancelled) return;
        const blocks: ScheduleBlock[] = Array.isArray((data as any)?.schedule)
          ? (data as any).schedule
          : Array.isArray((data as any)?.blocks)
            ? (data as any).blocks
            : [];
        // Some board endpoints expose schedule via a nested `settings` key
        // — do a defensive lookup if the shape differs.
        if (blocks.length > 0) setSchedule(blocks);
      } catch (e: any) {
        setScheduleErr(e?.message || "Couldn't load schedule");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Effective schedule: manual rows always win when present (lets the
  // teacher fix a bad API response or fill one in entirely manually).
  const effectiveSchedule = manualSchedule.length > 0 ? manualSchedule : schedule;

  const print = () => {
    saveStr(KEYS.teacher, teacherName);
    saveStr(KEYS.emergency, emergencyText);
    saveStr(KEYS.notes, dayNote);
    saveJson(KEYS.manualSchedule, manualSchedule);
    saveJson(KEYS.customSections, customSections);
    openSubPacketWindow({
      students, schedule: effectiveSchedule, date,
      teacherName: teacherName.trim(),
      emergencyText: emergencyText.trim(),
      dayNote: dayNote.trim(),
      customSections: customSections.filter((c) => c.title.trim() || c.body.trim()),
    });
    loggedBeep();
  };

  // Schedule editor handlers
  const addScheduleRow = () => setManualSchedule((rows) => [...rows, { start_time: "", end_time: "", label: "", subject: "" }]);
  const updateScheduleRow = (i: number, patch: Partial<ScheduleBlock>) => {
    setManualSchedule((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeScheduleRow = (i: number) => setManualSchedule((rows) => rows.filter((_, idx) => idx !== i));
  const seedScheduleFromApi = () => {
    if (schedule.length === 0) return;
    setManualSchedule(schedule.map((b) => ({ ...b })));
  };
  const clearManualSchedule = () => {
    if (!window.confirm("Drop manual schedule and use the API one?")) return;
    setManualSchedule([]);
  };

  // Custom-section handlers
  const addCustomSection = () => {
    setCustomSections((s) => [...s, { id: `cs-${Date.now()}`, title: "", body: "" }]);
  };
  const updateCustomSection = (id: string, patch: Partial<CustomSection>) => {
    setCustomSections((s) => s.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCustomSection = (id: string) => {
    setCustomSections((s) => s.filter((c) => c.id !== id));
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10, marginBottom: 12,
      }}>
        <Field label="Day to cover">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </Field>
        <Field label="Your name (optional)">
          <input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Ms. Imboden"
            style={inp()}
          />
        </Field>
      </div>

      <Field label="Special instructions for the day (optional)">
        <textarea
          value={dayNote}
          onChange={(e) => setDayNote(e.target.value)}
          rows={3}
          placeholder="e.g. Math swaps with Reading today · Anna's mom is picking her up at 2 · Specials is Art (room 14)"
          style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>

      <Field label="Emergency contacts + procedures">
        <textarea
          value={emergencyText}
          onChange={(e) => setEmergencyText(e.target.value)}
          rows={6}
          placeholder="Front office ext. · Nurse ext. · Custodian ext. · Fire drill plan · etc."
          style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>

      {/* Schedule editor — collapsed by default, expand to override */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
            Schedule for the day · {effectiveSchedule.length} block{effectiveSchedule.length === 1 ? "" : "s"}
            {manualSchedule.length > 0 && <span style={{ marginLeft: 8, color: "#f9a8d4" }}>· edited manually</span>}
          </div>
          <button onClick={() => setShowSchedEditor((v) => !v)} style={ghostBtn()}>
            {showSchedEditor ? "✕ Close editor" : "✏️ Edit schedule"}
          </button>
        </div>
        {showSchedEditor && (
          <div style={{
            padding: 12, borderRadius: 12, marginBottom: 8,
            background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.30)",
          }}>
            <div style={{ fontSize: 11, color: "rgba(196,181,253,0.75)", marginBottom: 8 }}>
              Schedule loads automatically from <b>/board</b> (the Teacher Board Settings → Schedule).
              Override it here just for this packet — manual rows always win when present.
            </div>
            {manualSchedule.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(196,181,253,0.55)", padding: 8, textAlign: "center", borderRadius: 8, background: "rgba(0,0,0,0.20)", marginBottom: 8 }}>
                No manual rows yet. {schedule.length > 0 ? `${schedule.length} blocks loaded from the board API.` : "Nothing loaded from the board either."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {manualSchedule.map((b, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr 1fr auto", gap: 6, alignItems: "center" }}>
                    <input type="time" value={b.start_time || ""} onChange={(e) => updateScheduleRow(i, { start_time: e.target.value })} style={smallInp()} />
                    <input type="time" value={b.end_time || ""} onChange={(e) => updateScheduleRow(i, { end_time: e.target.value })} style={smallInp()} />
                    <input value={b.label || ""} onChange={(e) => updateScheduleRow(i, { label: e.target.value })} placeholder="Block name (e.g. Reading)" style={smallInp()} />
                    <input value={b.subject || ""} onChange={(e) => updateScheduleRow(i, { subject: e.target.value })} placeholder="Notes (room #, page, etc.)" style={smallInp()} />
                    <button onClick={() => removeScheduleRow(i)} style={miniDanger()}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {schedule.length > 0 && manualSchedule.length === 0 && (
                <button onClick={seedScheduleFromApi} style={ghostBtn()}>📥 Copy {schedule.length} from board</button>
              )}
              {manualSchedule.length > 0 && (
                <button onClick={clearManualSchedule} style={ghostBtn()}>↺ Reset to board</button>
              )}
              <button onClick={addScheduleRow} style={primaryBtn(false)}>+ Add row</button>
            </div>
          </div>
        )}
      </div>

      {/* Custom sections — anything else the sub needs */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)" }}>
            Extra sections · {customSections.length}
          </div>
          <button onClick={addCustomSection} style={ghostBtn()}>+ Add section</button>
        </div>
        {customSections.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(196,181,253,0.55)", padding: 8, textAlign: "center", borderRadius: 8, background: "rgba(0,0,0,0.20)" }}>
            Add anything else the sub needs — lunch count routine, where the bathroom keys live, computer login info, attendance instructions, fire drill spot, etc.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {customSections.map((c) => (
              <div key={c.id} style={{
                padding: 10, borderRadius: 10,
                background: "rgba(168,85,247,0.04)",
                border: "1px solid rgba(168,85,247,0.20)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 6 }}>
                  <input value={c.title} onChange={(e) => updateCustomSection(c.id, { title: e.target.value })} placeholder="Section title (e.g. 'Lunch count routine')" style={inp()} />
                  <button onClick={() => removeCustomSection(c.id)} style={miniDanger()}>✕</button>
                </div>
                <textarea
                  value={c.body}
                  onChange={(e) => updateCustomSection(c.id, { body: e.target.value })}
                  rows={3}
                  placeholder="Tell the sub what to do, in any order. Each line prints as a separate line in the packet."
                  style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: "10px 14px", borderRadius: 12,
        background: "rgba(168,85,247,0.06)",
        border: "1px solid rgba(168,85,247,0.20)",
        fontSize: 12, color: "rgba(196,181,253,0.80)", fontWeight: 600, lineHeight: 1.5,
      }}>
        Packet includes: schedule ({effectiveSchedule.length || "—"} blocks), <b style={{ color: "#fce7f3" }}>{students.length}</b> students with per-kid triggers + calming strategies (set in Settings → Sub Notes), {customSections.length > 0 ? `${customSections.length} custom section${customSections.length === 1 ? "" : "s"}, ` : ""}and your emergency procedures.
        <div style={{ marginTop: 4, fontSize: 11, color: "rgba(196,181,253,0.65)" }}>
          🔒 IEP goals are intentionally NOT included — they're confidential. Use /star → 🎯 IEP for IEP-team distribution.
        </div>
        {scheduleErr && manualSchedule.length === 0 && <div style={{ marginTop: 4, color: "#fca5a5" }}>⚠ {scheduleErr} — fix in /board → Settings → Schedule, or add manual rows above.</div>}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button onClick={print} style={primaryBtn(false)}>
          🖨 Print Sub Packet
        </button>
      </div>
    </div>
  );
}

/* ── Print template ──────────────────────────────────────────────── */

function openSubPacketWindow(args: {
  students: StarStudent[];
  schedule: ScheduleBlock[];
  date: string;
  teacherName: string;
  emergencyText: string;
  dayNote: string;
  customSections: CustomSection[];
}) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const { students, schedule, date, teacherName, emergencyText, dayNote, customSections } = args;
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Schedule grid
  const sched = schedule.length === 0
    ? `<div class="empty">No schedule on file. Walk the sub through the day verbally on arrival.</div>`
    : `<table>
        <thead><tr><th>Time</th><th>Block</th><th>Notes</th></tr></thead>
        <tbody>${schedule.map((b) => `<tr>
          <td class="t">${escapeHtml(b.start_time || "")}–${escapeHtml(b.end_time || "")}</td>
          <td><b>${escapeHtml(b.label || b.subject || "—")}</b></td>
          <td>${b.is_break ? "🟢 Break" : (b.subject || "")}</td>
        </tr>`).join("")}</tbody>
      </table>`;

  // Per-kid sections — IEP goals intentionally omitted (confidential).
  // Sub gets the disability label (already public-roster info) and the
  // teacher's hand-written triggers/strategies from subNotes.
  const kidPages = students.map((s) => {
    return `
      <div class="kid">
        <div class="kid-head">
          <div class="avatar">${escapeHtml((s.firstName || "?").charAt(0).toUpperCase())}</div>
          <div>
            <h3>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h3>
            <div class="kid-meta">
              ${s.grade ? `Grade ${escapeHtml(s.grade)}` : ""}
              ${s.disability ? ` · ${escapeHtml(s.disability)}` : ""}
            </div>
          </div>
        </div>

        ${s.subNotes ? `<div class="kid-section sub-notes">
          <div class="kid-label">⚠ Triggers · what works · what doesn't</div>
          <div class="sub-notes-text">${escapeHtml(s.subNotes).replace(/\n/g, "<br>")}</div>
        </div>` : `<div class="kid-section empty">
          No sub notes on file. Add triggers/strategies in /star → Settings → Sub Notes for ${escapeHtml(s.firstName)}.
        </div>`}

        ${s.parentName || s.parentEmail || s.phone ? `<div class="kid-contact">
          <span class="lbl">Family contact:</span>
          ${s.parentName ? escapeHtml(s.parentName) + " · " : ""}
          ${s.parentEmail ? escapeHtml(s.parentEmail) + " · " : ""}
          ${s.phone ? escapeHtml(s.phone) : ""}
        </div>` : ""}
      </div>
    `;
  }).join("");

  // Custom sections (anything else the teacher added)
  const customHtml = customSections.length === 0 ? "" : customSections.map((c) => `
    <section class="custom-block">
      <h2>📌 ${escapeHtml(c.title || "Note")}</h2>
      <div class="custom-body">${escapeHtml(c.body).replace(/\n/g, "<br>")}</div>
    </section>
  `).join("");

  const html = `<!doctype html><html><head><title>Sub Plans — ${escapeHtml(dateLabel)}</title>
    <style>${SUB_CSS}</style></head>
    <body>
      <div class="toolbar no-print">
        <div>📋 Sub Plans Packet — ${escapeHtml(dateLabel)}</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>

      <section class="cover">
        <div class="kicker">Substitute Teacher Packet</div>
        <h1>${escapeHtml(dateLabel)}</h1>
        <div class="meta">
          ${teacherName ? `<b>Regular teacher:</b> ${escapeHtml(teacherName)} · ` : ""}
          ${students.length} students · ${schedule.length || 0} schedule blocks
        </div>
        ${dayNote ? `<div class="day-note">
          <div class="day-note-lbl">📌 Special instructions for today</div>
          <div class="day-note-body">${escapeHtml(dayNote).replace(/\n/g, "<br>")}</div>
        </div>` : ""}
      </section>

      <section class="page">
        <h2>📅 Today's schedule</h2>
        ${sched}
      </section>

      <section class="page">
        <h2>🚨 Emergency procedures &amp; contacts</h2>
        <div class="emerg">${escapeHtml(emergencyText).replace(/\n/g, "<br>")}</div>
      </section>

      <section class="page">
        <h2>👥 Roster — ${students.length} students</h2>
        <p class="roster-note">Each kid's triggers + calming strategies are pulled from <b>Settings → Sub Notes</b>. <b>IEP goals are intentionally not printed</b> — they're confidential.</p>
        <div class="roster">${kidPages}</div>
      </section>

      ${customHtml ? `<section class="page">${customHtml}</section>` : ""}

      <div class="footer">
        Generated by STAR · ${escapeHtml(dateLabel)}${teacherName ? ` · for ${escapeHtml(teacherName)}` : ""}
      </div>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
    </body></html>`;

  w.document.write(html);
  w.document.close();
  successBeep();
}

const SUB_CSS = `
  @media print { @page { size: letter; margin: 0.5in; } .no-print { display: none; } .page { page-break-before: auto; } .cover { page-break-after: always; } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.5; }
  .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
  .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }

  .cover { padding: 60px 28px; text-align: center; background: linear-gradient(135deg, #faf5ff, #fdf2f8, #ede9fe); border-bottom: 3px solid #d8b4fe; }
  .cover .kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.32em; text-transform: uppercase; color: #6d28d9; }
  .cover h1 { margin: 8px 0; font-size: 36px; letter-spacing: -0.02em; color: #4c1d95; }
  .cover .meta { font-size: 13px; color: #6b21a8; }
  .day-note { margin-top: 24px; padding: 14px 18px; border-radius: 12px; background: white; border: 2px dashed #ec4899; text-align: left; max-width: 540px; margin-left: auto; margin-right: auto; }
  .day-note-lbl { font-size: 10px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; color: #be185d; margin-bottom: 4px; }
  .day-note-body { font-size: 14px; color: #1f1235; font-weight: 600; }

  .page { padding: 24px; }
  h2 { font-size: 16px; margin: 6px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 6px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 10px; background: #faf5ff; border-bottom: 2px solid #d8b4fe; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #4c1d95; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  td.t { white-space: nowrap; font-family: "SF Mono", Menlo, monospace; font-weight: 700; color: #6d28d9; font-size: 12px; }

  .empty { padding: 14px; background: #faf5ff; border: 1px dashed #d8b4fe; border-radius: 8px; color: #6d28d9; font-size: 12px; text-align: center; }

  .emerg { padding: 14px 16px; border-radius: 10px; background: #fef3c7; border: 1.5px solid #fbbf24; font-size: 13px; line-height: 1.7; color: #78350f; white-space: pre-wrap; font-family: -apple-system, sans-serif; }

  .roster { display: flex; flex-direction: column; gap: 16px; }
  .kid { padding: 14px 16px; border-radius: 12px; border: 1.5px solid #d8b4fe; background: #faf5ff; page-break-inside: avoid; }
  .kid-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899); color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; flex-shrink: 0; }
  .kid h3 { margin: 0; font-size: 17px; color: #1f1235; letter-spacing: -0.015em; }
  .kid-meta { font-size: 11px; color: #6b21a8; font-weight: 600; }

  .kid-section { margin-top: 10px; }
  .kid-label { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #6d28d9; margin-bottom: 4px; }

  ul.goals { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  ul.goals li { padding: 6px 10px 6px 32px; position: relative; background: white; border: 1px solid #ede9fe; border-radius: 6px; font-size: 12px; color: #1f1235; }
  ul.goals li .num { position: absolute; left: 6px; top: 6px; display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; padding: 0 5px; border-radius: 999px; background: #6d28d9; color: white; font-weight: 800; font-size: 10px; }

  .sub-notes { background: white; border: 2px solid #ec4899; border-radius: 10px; padding: 10px 12px; }
  .sub-notes .kid-label { color: #be185d; }
  .sub-notes-text { font-size: 13px; color: #1f1235; line-height: 1.55; font-weight: 500; }

  .kid-contact { margin-top: 8px; padding: 6px 10px; border-radius: 6px; background: white; border: 1px dashed #c4b5fd; font-size: 11px; color: #6b21a8; font-weight: 600; }
  .kid-contact .lbl { color: #6d28d9; font-weight: 800; margin-right: 4px; }

  .footer { padding: 14px 24px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #ede9fe; }
  .roster-note { font-size: 11px; color: #6b21a8; background: #faf5ff; border: 1px dashed #d8b4fe; padding: 8px 10px; border-radius: 8px; margin: 0 0 12px; }
  .custom-block { background: #faf5ff; border: 1px solid #d8b4fe; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
  .custom-block h2 { font-size: 14px; margin: 0 0 8px; color: #4c1d95; border: none; padding: 0; }
  .custom-body { font-size: 13px; color: #1f1235; line-height: 1.55; white-space: pre-wrap; }
  .kid-section.empty { font-size: 11px; color: #6b7280; font-style: italic; padding: 8px 10px; background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 6px; }
`;

/* ── helpers ─────────────────────────────────────────────────────── */

function defaultEmergencyText(): string {
  return [
    "Front office: ext. _____",
    "Nurse: ext. _____",
    "Principal: _____ (mobile _____)",
    "Custodian: ext. _____",
    "",
    "FIRE DRILL: exit the room via _____ door, line up at _____.",
    "LOCKDOWN: lock the door, lights off, kids in the corner away from windows.",
    "MEDICAL: page nurse, send a kid to the office if no answer.",
  ].join("\n");
}

function loadStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function saveStr(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch {}
}
function loadJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveJson<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}
function smallInp(): React.CSSProperties {
  return {
    width: "100%", padding: "6px 8px", borderRadius: 6,
    background: "rgba(0,0,0,0.30)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 12, outline: "none", boxSizing: "border-box",
  };
}
function miniDanger(): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6,
    background: "rgba(239,68,68,0.20)",
    border: "1px solid rgba(239,68,68,0.45)",
    color: "#fca5a5", fontWeight: 800, fontSize: 12,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.30)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}

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

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 18px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
    touchAction: "manipulation",
  };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
