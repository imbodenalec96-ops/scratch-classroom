// CSV importer for the original STAR_Scanner.html report export.
// Accepts the exact 14-column shape the legacy app exports and turns
// each row into a bcDB entry (+ asnTracker for assignments). Idempotent
// — rows whose Barcode ID is already in bcDB are skipped.

import {
  StarStore, saveAll,
  type Subject, type StarQuestion, type StarTrackerEntry, type StarAssignment, type BcEntry,
  type StarSubmission,
} from "./storage.ts";

const SUBJECT_NORMALIZE: Record<string, Subject> = {
  math: "Math", reading: "Reading", writing: "Writing", english: "Writing",
  ela: "Reading", science: "Science", "social studies": "Social Studies",
  history: "Social Studies", pe: "PE", "physical education": "PE",
  art: "Art", music: "Music", library: "Library",
};

function normalizeSubject(s: string | null | undefined): Subject {
  if (!s) return "Math";
  const k = String(s).toLowerCase().trim();
  return SUBJECT_NORMALIZE[k] || (s as Subject) || "Math";
}

export interface ImportResult {
  ok: boolean;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  message: string;
}

// Tiny CSV parser that handles quoted fields with embedded commas + escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(cell); cell = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v && v.trim().length > 0));
}

// Index header row → column index map. Tolerant of casing + spaces.
function indexHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => { map[h.trim().toLowerCase()] = i; });
  return map;
}
const get = (row: string[], idx: Record<string, number>, key: string): string =>
  (row[idx[key.toLowerCase()] ?? -1] || "").trim();

export function importStarCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { ok: false, total: 0, imported: 0, skipped: 0, errors: ["Empty CSV"], message: "Empty CSV" };
  }
  const idx = indexHeaders(rows[0]);
  const dataRows = rows.slice(1);

  const bcDB = StarStore.getBcDB();
  const tracker = StarStore.getAsnTrack();
  const asns = StarStore.getAsns();

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of dataRows) {
    try {
      const barcode = get(r, idx, "Barcode ID") || get(r, idx, "Barcode");
      const type    = get(r, idx, "Type").toLowerCase();
      const name    = get(r, idx, "Name") || "Untitled";
      if (!barcode) { skipped++; continue; }
      if (bcDB[barcode]) { skipped++; continue; }

      const studentName = get(r, idx, "Student");
      const created     = get(r, idx, "Created") || new Date().toLocaleDateString();
      const createdISO  = isoFromAnyDate(created);

      if (type === "assignment") {
        const subject = normalizeSubject(get(r, idx, "Subject"));
        const grade   = get(r, idx, "Grade");
        const week    = get(r, idx, "Week");
        const day     = get(r, idx, "Day");
        const goal    = get(r, idx, "IEP Goal");
        const qCount  = Math.max(1, Number(get(r, idx, "Questions")) || 10);
        const subCount = Number(get(r, idx, "Submissions")) || 0;
        const avgPct  = parsePct(get(r, idx, "Avg %"));
        const avgGrade = get(r, idx, "Avg Grade");

        const questions: StarQuestion[] = Array.from({ length: qCount }, (_, i) => ({
          num: i + 1, text: `Question ${i + 1}`, answer: "—",
        }));

        const entry: BcEntry = {
          id: barcode, type: "assignment",
          name, subject, gradeLevel: grade || "",
          studentName: studentName || undefined,
          week: week || undefined,
          day: day || undefined,
          goal: goal || undefined,
          questions, lesson: null,
          createdDate: createdISO,
        };
        bcDB[barcode] = entry;

        // Reconstruct an aggregate submission from the Avg % column so the
        // grade history isn't blank for already-graded rows. Real per-question
        // marks are lost but the rollup grade survives.
        const submissions: StarSubmission[] = [];
        if (subCount > 0 && avgPct != null) {
          submissions.push({
            studentId: "imported",
            studentName: studentName || "Imported",
            completedDate: createdISO.slice(0, 10),
            score: Math.round((avgPct / 100) * qCount),
            maxScore: qCount,
            pct: avgPct,
            letterGrade: avgGrade || letterFromPct(avgPct),
            feedback: subCount > 1 ? `Imported summary of ${subCount} submissions.` : "Imported from legacy STAR.",
            timeSpent: "",
            notes: "",
            status: "completed",
            qMarks: {},
            loggedAt: new Date().toISOString(),
          });
        }

        const trk: StarTrackerEntry = {
          id: barcode, name, subject, gradeLevel: grade || "",
          studentName: studentName || undefined,
          week: week || undefined, day: day || undefined,
          goal: goal || undefined,
          questions, lesson: null,
          createdDate: createdISO,
          status: submissions.length > 0 ? "completed" : "assigned",
          submissions,
        };
        tracker[barcode] = trk;

        const asn: StarAssignment = {
          id: barcode, name, subject, type: "Assignment", grade: grade || undefined,
        };
        asns.unshift(asn);
        imported++;
      } else if (type === "work-refusal-form" || type === "specials-refusal-form") {
        const entry: BcEntry = {
          id: barcode,
          type,
          name,
          studentName: studentName || "All",
          createdDate: createdISO,
        };
        bcDB[barcode] = entry;
        imported++;
      } else {
        errors.push(`Unknown type "${type}" for barcode ${barcode}`);
        skipped++;
      }
    } catch (e: any) {
      errors.push(e?.message || String(e));
      skipped++;
    }
  }

  saveAll({ bcDB, asnTracker: tracker, asns });

  return {
    ok: true,
    total: dataRows.length,
    imported, skipped, errors,
    message: `Imported ${imported} of ${dataRows.length} rows (${skipped} skipped${errors.length ? `, ${errors.length} errors` : ""}).`,
  };
}

function parsePct(s: string): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function letterFromPct(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function isoFromAnyDate(s: string): string {
  // Accept "5/6/2026", "2026-05-06", "5/6/26"
  if (!s) return new Date().toISOString();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    let [, mm, dd, yy] = m1;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) return d2.toISOString();
  return new Date().toISOString();
}
