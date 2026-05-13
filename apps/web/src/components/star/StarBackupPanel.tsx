// STAR Data backup / restore — carries every local-only STAR
// setting between devices. The server already syncs students,
// assignments, and minted barcodes, but these keys stay local:
//
//   star_behavior_defs / log / templates
//   star_iep_goals / log / default thresholds
//   star_daily_notes
//   star_custom_music
//   star_student_birthdays
//   star_subplans_*
//   star_templates (assignment templates)
//   star_bcdb (locally-minted barcodes — backup so re-import works
//              even on a device that never synced from the relay)
//   star_grade_map_version (so re-applying the baked grades runs again)
//
// Workflow: MacBook → Download backup. iPad → Open the JSON file.
// All marked keys are restored to localStorage, then the page
// reloads so the rest of the app picks up the new data.

import { useRef, useState } from "react";
import { StarStore } from "../../lib/star/storage.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { pushAllLocalBarcodes } from "../../lib/star/barcodeRelay.ts";
import { api } from "../../lib/api.ts";

// Keys included in the backup. NEW LOCAL KEYS GO HERE so future
// teacher-customizable data still rides across devices.
const BACKUP_KEYS = [
  // Behavior tracker
  "star_behavior_defs",
  "star_behavior_log",
  "star_behavior_templates",
  // IEP
  "star_iep_goals",
  "star_iep_log",
  "star_iep_default_met",
  "star_iep_default_partial",
  // Daily notes (per-kid narratives for the end-of-day report)
  "star_daily_notes",
  // Music
  "star_custom_music",
  // Student details set in /star (birthdays, parent contacts, sub notes)
  "star_student_birthdays",
  // Sub plans (manual schedule, custom sections, emergency text)
  "star_subplans_emergency",
  "star_subplans_day_notes",
  "star_subplans_teacher",
  "star_subplans_custom_sections",
  "star_subplans_manual_schedule",
  // Assignment generator templates
  "star_templates",
  // Behavior reporter name (so it pre-fills on the new device)
  "star_behavior_reporter_name",
  // Local barcode cache + grade-map version
  "star_bcdb",
  "star_asntrack",
  "star_a",
  "star_l",
  "star_grade_map_version",
];

interface BackupBundle {
  __star_backup: true;
  version: 1;
  exportedAt: string;
  exportedFrom: string;
  payload: Record<string, string>;
}

export default function StarBackupPanel() {
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showFlash = (kind: "ok" | "err", text: string, ms = 3000) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), ms);
  };

  const buildBundle = (): BackupBundle => {
    const payload: Record<string, string> = {};
    let included = 0;
    for (const key of BACKUP_KEYS) {
      try {
        const v = localStorage.getItem(key);
        if (v !== null) { payload[key] = v; included += 1; }
      } catch {}
    }
    void included;
    return {
      __star_backup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedFrom: navigator.userAgent || "unknown",
      payload,
    };
  };

  const downloadBackup = () => {
    const bundle = buildBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.download = `star-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    loggedBeep();
    successBeep();
    showFlash("ok", `Backed up ${Object.keys(bundle.payload).length} settings. Open this file on your iPad to restore.`);
  };

  const copyBundleToClipboard = async () => {
    const bundle = buildBundle();
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle));
      loggedBeep();
      showFlash("ok", `Backup copied to clipboard. On the iPad, paste into the "Restore from text" box.`);
    } catch {
      errorBeep();
      showFlash("err", "Couldn't copy. Use the Download button instead.");
    }
  };

  const restoreFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => applyBundle(String(reader.result || ""));
    reader.onerror = () => showFlash("err", "Couldn't read that file.");
    reader.readAsText(file);
  };

  const [pasteText, setPasteText] = useState("");
  const restoreFromPaste = () => {
    if (!pasteText.trim()) return;
    applyBundle(pasteText);
  };

  const applyBundle = (raw: string) => {
    try {
      const obj = JSON.parse(raw);
      if (!obj || obj.__star_backup !== true) {
        showFlash("err", "That doesn't look like a STAR backup file.");
        errorBeep();
        return;
      }
      const payload = obj.payload || {};
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        showFlash("err", "Backup file is empty.");
        errorBeep();
        return;
      }
      const ok = window.confirm(`Restore ${keys.length} STAR settings from this backup? Any unsaved changes on THIS device will be replaced. The page will reload after restoring.`);
      if (!ok) return;
      for (const k of keys) {
        try { localStorage.setItem(k, String(payload[k])); } catch {}
      }
      loggedBeep();
      successBeep();
      showFlash("ok", `Restored ${keys.length} settings. Reloading…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      errorBeep();
      showFlash("err", `Couldn't parse: ${e?.message || "invalid JSON"}`);
    }
  };

  // Quick preview of what would get backed up
  const summary = (() => {
    let total = 0;
    let sizeKB = 0;
    for (const k of BACKUP_KEYS) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) { total += 1; sizeKB += (v.length / 1024); }
      } catch {}
    }
    void StarStore;
    return { total, sizeKB: sizeKB.toFixed(1) };
  })();

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{
        padding: "12px 14px", borderRadius: 12, marginBottom: 14,
        background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(239,68,68,0.05))",
        border: "1.5px dashed rgba(245,158,11,0.45)",
        fontSize: 12, color: "#fde68a", fontWeight: 600, lineHeight: 1.55,
      }}>
        <b>Why this exists:</b> STAR keeps some settings on each device individually
        — behaviors, IEP goals, daily notes, custom music tracks, sub plan templates,
        and a few more. The class roster and assignments sync automatically, but the
        rest doesn't. Download a backup on your MacBook, open it on your iPad, and
        everything that lives only on the Mac will be copied over.
      </div>

      {flash && (
        <div role="status" aria-live="polite" style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: flash.kind === "ok" ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)",
          border: `1px solid ${flash.kind === "ok" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
          color: flash.kind === "ok" ? "#bbf7d0" : "#fca5a5",
          fontWeight: 800, fontSize: 13,
        }}>{flash.text}</div>
      )}

      {/* PUSH-TO-SERVER — fixes "made today, can't scan on iPad" */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fde68a", marginBottom: 6 }}>
          🔧 If a barcode shows "Not found" on another device
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10, lineHeight: 1.5 }}>
          Sometimes a freshly-minted barcode doesn't push to the server (the active class ID
          can race the save). One tap re-uploads every QZ-, AS-, WR-, SP- barcode from this
          device to the relay. Safe to run repeatedly.
        </div>
        <button
          onClick={async () => {
            try {
              const r = await pushAllLocalBarcodes();
              if (r.pushed === 0 && r.failed === 0) {
                showFlash("ok", "No barcodes to push (or class id not set yet).");
              } else {
                showFlash(r.failed > 0 ? "err" : "ok", `Pushed ${r.pushed} barcodes${r.failed ? `, ${r.failed} failed` : ""}.`, 4000);
              }
              successBeep();
            } catch (e: any) {
              errorBeep();
              showFlash("err", `Failed: ${e?.message || e}`);
            }
          }}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #f59e0b, #ec4899)",
            color: "white", border: "none", fontWeight: 800,
            cursor: "pointer", fontSize: 13,
          }}
        >🚀 Push all my barcodes to the server</button>
      </div>

      {/* SUPABASE — push every behavior, daily note, IEP entry, template,
          and custom-music track from this device up to Supabase so other
          devices (iPad, second laptop) see the same data. Same idea as the
          barcode button above, but for the new cross-device STAR sync. */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: "rgba(16,185,129,0.08)",
        border: "1px solid rgba(16,185,129,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#bbf7d0", marginBottom: 6 }}>
          ☁️ STAR data → Supabase
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10, lineHeight: 1.5 }}>
          Pushes every behavior log entry, daily note, IEP goal + status, template, and custom-music
          track from this device up to Supabase so the iPad sees the same data. Already runs on every
          app boot, but tap here to backfill entries (like today's 5/12 behaviors) right now.
        </div>
        <button
          onClick={async () => {
            try {
              const { fullStarPush } = await import("../../lib/star/supabaseSync.ts");
              const r = await fullStarPush();
              successBeep();
              showFlash("ok", `Pushed ${r.pushed} STAR row${r.pushed === 1 ? "" : "s"} to Supabase.`, 4000);
            } catch (e: any) {
              errorBeep();
              showFlash("err", `Push failed: ${e?.message || e}`);
            }
          }}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #10b981, #0ea5e9)",
            color: "white", border: "none", fontWeight: 800,
            cursor: "pointer", fontSize: 13,
          }}
        >☁️ Push all STAR data to Supabase</button>
      </div>

      {/* GRADES → SERVER. Re-POSTs every local STAR grade row to
          /classes/:id/star-submissions so the board on every device
          can compute letter grades correctly. The original save's
          POST is fire-and-forget; if it ever failed silently (network
          blip, no active class id yet) those grades stayed local-only.
          This button is the safety net. */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: "rgba(59,130,246,0.08)",
        border: "1px solid rgba(59,130,246,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#bfdbfe", marginBottom: 6 }}>
          📊 Grades → Server (board fix)
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10, lineHeight: 1.5 }}>
          Re-uploads every grade you've ever saved on this device to the server. Use this when the projector
          board is showing wrong / missing grades for a kid — usually means their submissions never made
          it to the database. Safe to run repeatedly.
        </div>
        <button
          onClick={async () => {
            try {
              const { getActiveClassId } = await import("../../lib/star/boardEvents.ts");
              const classId = getActiveClassId();
              if (!classId) {
                showFlash("err", "No active class — open /board first then come back.");
                return;
              }
              const tracker = StarStore.getAsnTrack();
              let posted = 0, failed = 0;
              for (const bc in tracker) {
                const t = tracker[bc];
                for (const sub of (t.submissions || [])) {
                  if (!sub.studentId) continue;
                  try {
                    await api.starSubmissionPost(classId, {
                      barcode: bc,
                      studentId: sub.studentId,
                      studentName: sub.studentName || "",
                      pct: sub.pct ?? 0,
                      letterGrade: sub.letterGrade || "",
                      status: sub.status || "completed",
                      score: sub.score ?? 0,
                      maxScore: sub.maxScore ?? 0,
                      completedDate: sub.completedDate || "",
                      loggedAt: sub.loggedAt || new Date().toISOString(),
                    });
                    posted += 1;
                  } catch { failed += 1; }
                }
              }
              successBeep();
              showFlash(failed > 0 ? "err" : "ok", `Pushed ${posted} grade${posted === 1 ? "" : "s"} to server${failed ? `, ${failed} failed` : ""}.`, 5000);
            } catch (e: any) {
              errorBeep();
              showFlash("err", `Push failed: ${e?.message || e}`);
            }
          }}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            color: "white", border: "none", fontWeight: 800,
            cursor: "pointer", fontSize: 13,
          }}
        >📊 Push all grades to the server</button>
      </div>

      {/* FREE UP STORAGE — drops bcDB + asnTrack entries older than the
          chosen window. The local cache balloons past the browser's
          ~10 MB localStorage cap after a few weeks of daily use, and
          new saves start being silently rejected. This is the manual
          escape hatch when that happens. Server data is untouched. */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fca5a5", marginBottom: 6 }}>
          🧹 Free up storage (last resort)
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10, lineHeight: 1.5 }}>
          Browser localStorage caps at ~10 MB. Once you cross it, new grades save to the server but the
          snapshot + gradebook on this device stop updating. This drops local copies of assignments
          older than 14 days. Server data is untouched — re-grading an old item still works (it'll
          re-fetch from the server on scan).
        </div>
        <button
          onClick={async () => {
            if (!window.confirm("Drop local cache of assignments older than 14 days?\n\nGrades stay on the server. Only the on-device cache is cleared.")) return;
            try {
              const { pruneOldAssignments, clearBehaviorPhotos } = await import("../../lib/star/storage.ts");
              clearBehaviorPhotos();
              const r = pruneOldAssignments(14);
              successBeep();
              showFlash("ok", `Pruned ${r.bcDBRemoved} barcodes + ${r.trackRemoved} grade records. Your snapshot should now update on next save.`, 5000);
            } catch (e: any) {
              errorBeep();
              showFlash("err", `Prune failed: ${e?.message || e}`);
            }
          }}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            color: "white", border: "none", fontWeight: 800,
            cursor: "pointer", fontSize: 13,
          }}
        >🧹 Free up storage now</button>
      </div>

      {/* BACKUP */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: 14,
        background: "rgba(168,85,247,0.06)",
        border: "1px solid rgba(168,85,247,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 8 }}>
          ⬇️ Back up FROM this device
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10 }}>
          {summary.total} STAR setting{summary.total === 1 ? "" : "s"} on this device · ~{summary.sizeKB} KB total
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={downloadBackup} style={primary(false)}>📥 Download backup file</button>
          <button onClick={copyBundleToClipboard} style={ghost()}>📋 Copy to clipboard</button>
        </div>
      </div>

      {/* RESTORE */}
      <div style={{
        padding: 14, borderRadius: 12,
        background: "rgba(168,85,247,0.06)",
        border: "1px solid rgba(168,85,247,0.30)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#f9a8d4", marginBottom: 8 }}>
          ⬆️ Restore TO this device
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.85)", marginBottom: 10 }}>
          Open the backup file you downloaded on the other device, OR paste the JSON below.
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) restoreFromFile(f);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #10b981, #3b82f6)",
            color: "white", border: "none", fontWeight: 800,
            fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 10,
          }}
        >📂 Pick a backup file</button>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>
          OR · paste the JSON
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={3}
          placeholder='{"__star_backup":true,"version":1,…}'
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.30)", color: "white",
            border: "1px solid rgba(168,85,247,0.25)",
            fontSize: 11, outline: "none", fontFamily: "Menlo, monospace",
            resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={restoreFromPaste} disabled={!pasteText.trim()} style={primary(!pasteText.trim())}>
            ↻ Restore from pasted JSON
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
        💡 The class roster + assignments sync automatically through the server, so
        you only need this for things you customized in /star itself. Run it once a
        week or whenever you've added new behaviors / templates / daily notes.
      </div>
    </div>
  );
}

function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px", borderRadius: 10,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
    color: "white", border: "none", fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 13,
    opacity: disabled ? 0.55 : 1,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "11px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 13,
  };
}
