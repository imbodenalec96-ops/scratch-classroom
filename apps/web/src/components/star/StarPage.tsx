// STAR Program hub. Tabs:
//   • Generator    — create assignments + refusal forms with barcodes
//   • Old work     — manually add a paper assignment so it can be graded
//   • Reports      — searchable + CSV-exportable logs
//   • Settings     — OpenRouter API key, model, students, quick templates
//
// Tip: scan a barcode anywhere in the app to pop the right modal.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, saveAll, rehydrateBcDB,
  type StarStudent, type StarTrackerEntry, type BcEntry, type Subject,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep } from "../../lib/star/sounds.ts";
import { syncFromClassroom, type SyncResult } from "../../lib/star/sync.ts";
import { setActiveClassId } from "../../lib/star/boardEvents.ts";
import { api } from "../../lib/api.ts";
import { importStarCsv, type ImportResult } from "../../lib/star/importCsv.ts";
import AssignmentGenerator from "./AssignmentGenerator.tsx";
import AfternoonPackGenerator from "./AfternoonPackGenerator.tsx";
import RefusalFormGenerator from "./RefusalFormGenerator.tsx";
import StarReports from "./StarReports.tsx";
import GradebookModal from "./GradebookModal.tsx";
import StarHome from "./StarHome.tsx";
import StarGradebookView from "./StarGradebookView.tsx";
import StarDataView from "./StarDataView.tsx";
import { tokens as T } from "../../lib/star/theme.ts";
import { Button } from "./ui.tsx";

type Tab = "home" | "gradebook" | "create" | "reports" | "data" | "settings";

const SUBJECTS: Subject[] = ["Math","Reading","Writing","Science","Social Studies","PE","Art","Library","Music"];
const GRADES = ["K","1st","2nd","3rd","4th","5th"];

export default function StarPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [openGradebook, setOpenGradebook] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Bumped each time we sync — child tabs (manual entry) read fresh storage on remount.
  const [syncStamp, setSyncStamp] = useState(0);

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await syncFromClassroom();
      setSyncStatus(result);
      if (result.ok) {
        setSyncStamp((n) => n + 1);
        if (result.assignmentsAdded > 0 || result.studentsTotal > 0) successBeep();
      } else {
        errorBeep();
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    rehydrateBcDB();
    // Best-effort silent sync on first mount so the roster + assignment
    // barcodes are always fresh when a teacher opens the page.
    runSync();
    // Capture the active class id so STAR events fired from this device
    // (iPad) get relayed to the server and picked up by the projector.
    api.getClasses().then((cs) => {
      if (Array.isArray(cs) && cs[0]?.id) setActiveClassId(cs[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { id: "home"      as Tab, icon: "🏠", label: "Home" },
    { id: "gradebook" as Tab, icon: "📚", label: "Gradebook" },
    { id: "create"    as Tab, icon: "✨", label: "Create" },
    { id: "reports"   as Tab, icon: "📊", label: "Reports" },
    { id: "data"      as Tab, icon: "💾", label: "Data" },
    { id: "settings"  as Tab, icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={{
      minHeight: "100dvh",
      color: T.color.text,
      fontFamily: T.font.family,
      background: T.color.bg,
      backgroundAttachment: "fixed",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 260px) 1fr",
        maxWidth: 1440, margin: "0 auto",
        minHeight: "100dvh",
      }}>
        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside style={{
          padding: `${T.space["2xl"]}px ${T.space.lg}px`,
          borderRight: `1px solid ${T.color.border}`,
          display: "flex", flexDirection: "column", gap: T.space.lg,
          position: "sticky", top: 0, alignSelf: "start",
          height: "100dvh", overflowY: "auto",
        }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: T.space.md }}>
            <div style={{ position: "relative", width: 48, height: 48 }}>
              <div style={{
                position: "absolute", inset: -2, borderRadius: T.radius.lg,
                background: "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #ec4899)",
                filter: "blur(0.5px)",
              }} />
              <span style={{
                position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 48, height: 48, borderRadius: T.radius.lg,
                background: "linear-gradient(135deg, #1a0f2e 0%, #0f0a1f 100%)",
                fontSize: 24,
                boxShadow: "inset 0 2px 0 rgba(255,255,255,0.08), 0 0 18px rgba(168,85,247,0.35)",
              }}>⭐</span>
            </div>
            <div>
              <h1 style={{
                fontSize: 22, fontWeight: 900,
                margin: 0, letterSpacing: "-0.025em", lineHeight: 1.1,
                background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 50%, #f9a8d4 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>STAR</h1>
              <div style={{ fontSize: T.font.size.xs, color: "rgba(196,181,253,0.65)", fontWeight: 700, letterSpacing: "0.04em" }}>
                Tracker & Refusal Log
              </div>
            </div>
          </div>

          {/* Sidebar tabs */}
          <nav role="tablist" aria-label="STAR sections" style={{
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: T.radius.md,
                    background: active ? T.color.surfaceRaised : "transparent",
                    color: active ? T.color.text : T.color.textMuted,
                    border: "none", outline: "none",
                    fontFamily: T.font.family,
                    fontWeight: active ? T.font.weight.bold : T.font.weight.normal,
                    fontSize: T.font.size.md, textAlign: "left",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: T.space.md,
                    position: "relative",
                    transition: `background ${T.motion.standard}, color ${T.motion.standard}`,
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = T.color.surface; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = T.focusRing; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
                >
                  {active && (
                    <span aria-hidden style={{
                      position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                      width: 3, height: "60%", borderRadius: 2,
                      background: T.color.accent, boxShadow: `0 0 12px ${T.color.accent}99`,
                    }} />
                  )}
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sync at bottom of sidebar */}
          <div style={{ marginTop: "auto", paddingTop: T.space.lg, borderTop: `1px solid ${T.color.border}` }}>
            <Button variant="secondary" fullWidth onClick={runSync} loading={syncing}
              icon={!syncing ? <span>🔄</span> : undefined}>
              {syncing ? "Syncing…" : "Sync from Classroom"}
            </Button>
            {syncStatus && syncStatus.message && (
              <div role="status" aria-live="polite" style={{
                marginTop: T.space.sm, padding: `${T.space.sm}px ${T.space.md}px`,
                borderRadius: T.radius.md,
                background: syncStatus.ok ? T.color.successSoft : T.color.dangerSoft,
                border: `1px solid ${syncStatus.ok ? T.color.successBorder : T.color.dangerBorder}`,
                fontSize: T.font.size.xs, color: T.color.text, lineHeight: 1.4,
              }}>
                {syncStatus.message}
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────── */}
        <main style={{
          padding: `${T.space["2xl"]}px ${T.space["3xl"]}px ${T.space["4xl"]}px`,
          minWidth: 0,
        }}>
          {/* HERO scanner — bigger, brighter, the focal point */}
          <div style={{
            marginBottom: T.space["2xl"],
            padding: `${T.space["2xl"]}px ${T.space["3xl"]}px`,
            borderRadius: T.radius["2xl"],
            background: `linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.10) 50%, rgba(99,102,241,0.16) 100%)`,
            border: `1px solid ${T.color.accentBorder}`,
            boxShadow: `${T.shadow.xl}, ${T.shadow.inset}`,
            position: "relative", overflow: "hidden",
          }}>
            {/* Decorative shimmer */}
            <div aria-hidden style={{
              position: "absolute", top: -100, right: -100,
              width: 360, height: 360, borderRadius: "50%",
              background: `radial-gradient(circle, ${T.color.accent}22 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: T.space.xl, flexWrap: "wrap", position: "relative" }}>
              <span style={{
                fontSize: 48,
                filter: `drop-shadow(0 4px 12px ${T.color.accent}66)`,
              }}>📷</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{
                  display: "block", marginBottom: 6,
                  fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
                  letterSpacing: "0.22em", textTransform: "uppercase",
                  color: T.color.accent,
                }} htmlFor="star-barcode-input">
                  Barcode Scanner
                </label>
                <HeroBarcodeInput />
              </div>
            </div>
            <div style={{ marginTop: T.space.md, fontSize: T.font.size.sm, color: T.color.textMuted, position: "relative" }}>
              USB scanner types automatically. Or type a barcode + Enter. Scans pop the right modal — assignments, refusals, passes — from any page.
            </div>
          </div>

      {tab === "home" && <StarHome onTab={(t) => setTab(t)} />}

      {tab === "gradebook" && <StarGradebookView />}

      {tab === "create" && (
        <>
          <PageHeader
            kicker="✨ Create"
            title="Build assignments + barcodes"
            subtitle="Generate fresh content per student, mint refusal forms, print pass + status barcode sheets, or add an old paper assignment to the system."
          />

          {/* GROUP 1 — Bulk packs (the heroes of the page) */}
          <CreateGroup label="Bulk Packs" hint="One click, one PDF, one assignment per kid.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="🌅" title="Morning pack" description="Warm-up packets for the start of class.">
                <AfternoonPackGenerator defaultLabel="Morning" defaultSubject="Reading" />
              </SectionWrapper>
              <SectionWrapper icon="🌇" title="Afternoon pack" description="Independent work for the second block.">
                <AfternoonPackGenerator defaultLabel="Afternoon" defaultSubject="Math" />
              </SectionWrapper>
            </div>
          </CreateGroup>

          {/* GROUP 2 — Single-shot generators */}
          <CreateGroup label="Single Item" hint="When you only need one barcode at a time.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="✨" title="Single assignment" description="One barcoded worksheet for one kid.">
                <AssignmentGenerator />
              </SectionWrapper>
              <SectionWrapper icon="🚨" title="Refusal form" description="Print a fresh refusal incident form.">
                <RefusalFormGenerator />
              </SectionWrapper>
            </div>
          </CreateGroup>

          {/* GROUP 3 — Utilities (laminate-once / paper-import) */}
          <CreateGroup label="Utilities" hint="Print once, scan often.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="🚻" title="Pass barcodes" description="Laminate near the door — bathroom / water / sensory.">
                <PassBarcodesPanel />
              </SectionWrapper>
              <SectionWrapper icon="📋" title="Status barcodes" description="Absent / skipped / excused / makeup with one scan.">
                <StatusBarcodesPanel />
              </SectionWrapper>
            </div>
            <SectionWrapper icon="📥" title="Add old paper assignment" description="Mint a barcode for a worksheet you already had on paper.">
              <ManualAssignmentEntry key={syncStamp} onOpenGradebook={(id) => setOpenGradebook(id)} />
            </SectionWrapper>
          </CreateGroup>
        </>
      )}

      {tab === "reports" && (
        <>
          <PageHeader
            kicker="📊 Reports"
            title="What's been happening"
            subtitle="Filterable tables of refusals, assignment submissions, and the barcode database. Export any view to CSV."
          />
          <StarReports />
        </>
      )}

      {tab === "data" && (
        <>
          <PageHeader
            kicker="💾 Data"
            title="Storage inspector"
            subtitle="See exactly what's saved in this device's localStorage. Wipe a section, wipe everything, or export the whole STAR snapshot as JSON."
          />
          <StarDataView />
        </>
      )}

      {tab === "settings" && (
        <>
          <PageHeader
            kicker="⚙️ Settings"
            title="Preferences + roster"
            subtitle="OpenRouter AI key, points-per-completion, quick note templates, and your student roster."
          />
          <SettingsPanel />
        </>
      )}

      {openGradebook && (
        <GradebookModal barcode={openGradebook} onClose={() => setOpenGradebook(null)} />
      )}
        </main>
      </div>
    </div>
  );
}

/* ── hero barcode input — bigger, friendlier than the small header one ─ */
/* ── shared layout helpers used by every tab ─────────────────────── */

function PageHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: T.space["2xl"] }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, marginBottom: T.space.sm,
        padding: "5px 12px", borderRadius: 999,
        background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.10))",
        border: "1px solid rgba(168,85,247,0.30)",
        fontSize: 10, fontWeight: 800,
        letterSpacing: "0.28em", textTransform: "uppercase",
        color: "#f9a8d4",
      }}>
        <span style={{
          display: "inline-block", width: 6, height: 6, borderRadius: "50%",
          background: "#ec4899", boxShadow: "0 0 10px rgba(236,72,153,0.85)",
        }} />
        {kicker}
      </div>
      <h2 style={{
        fontSize: T.font.size["4xl"], fontWeight: T.font.weight.black,
        margin: 0, letterSpacing: "-0.035em", lineHeight: 1.05,
        background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 40%, #f9a8d4 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>{title}</h2>
      {subtitle && (
        <p style={{ marginTop: T.space.sm, color: T.color.textMuted, fontSize: T.font.size.lg, lineHeight: 1.5, maxWidth: 720 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function CreateGroup({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: T.space["3xl"] }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12,
        marginBottom: T.space.md,
        paddingBottom: T.space.sm,
        borderBottom: "1px solid rgba(168,85,247,0.18)",
      }}>
        <h3 style={{
          margin: 0,
          fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em",
          background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>{label}</h3>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: "rgba(196,181,253,0.55)", letterSpacing: "0.04em",
        }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function SectionWrapper({ icon, title, description, children }: {
  icon?: string; title: string; description?: string; children: React.ReactNode;
}) {
  // The wrapper is the card. Subcomponents should NOT add their own
  // outer card or duplicate heading anymore — they render directly
  // into this card's body.
  return (
    <section style={{ marginBottom: T.space.lg }}>
      <div style={{
        background: T.color.surface,
        border: `1px solid ${T.color.border}`,
        borderRadius: T.radius.xl,
        padding: T.space.xl,
        boxShadow: T.shadow.md,
      }}>
        <div style={{ marginBottom: T.space.md, display: "flex", alignItems: "flex-start", gap: T.space.md }}>
          {icon && (
            <span style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg, rgba(168,85,247,0.20), rgba(236,72,153,0.10))",
              border: "1px solid rgba(168,85,247,0.30)",
              fontSize: 22,
            }}>{icon}</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{
              fontSize: T.font.size.lg, fontWeight: T.font.weight.bold,
              margin: 0, letterSpacing: "-0.015em", color: T.color.text,
              lineHeight: 1.2,
            }}>
              {title}
            </h3>
            {description && (
              <p style={{ margin: `${T.space.xs}px 0 0`, color: T.color.textMuted, fontSize: T.font.size.sm, lineHeight: 1.45 }}>
                {description}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function HeroBarcodeInput() {
  const [v, setV] = useState("");
  const [focused, setFocused] = useState(false);
  return (
    <input
      id="star-barcode-input"
      value={v}
      onChange={(e) => setV(e.target.value.toUpperCase())}
      onKeyDown={(e) => { if (e.key === "Enter") setTimeout(() => setV(""), 60); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder="Type or scan barcode + Enter…"
      autoFocus
      autoComplete="off"
      spellCheck={false}
      aria-label="Barcode scanner"
      style={{
        width: "100%", padding: "14px 18px",
        borderRadius: T.radius.lg,
        background: T.color.surfaceSunken, color: T.color.text,
        border: `2px solid ${focused ? T.color.accent : T.color.borderStrong}`,
        boxShadow: focused ? T.focusRing : "none",
        fontFamily: T.font.mono,
        fontSize: T.font.size.xl, fontWeight: T.font.weight.bold,
        outline: "none", letterSpacing: "0.06em",
        boxSizing: "border-box",
        transition: `border-color ${T.motion.fast}, box-shadow ${T.motion.fast}`,
      }}
    />
  );
}

/* ── pass barcode print sheet ────────────────────────────────────── */

function PassBarcodesPanel() {
  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const passes = [
      { id: "PASS-BATHROOM", label: "🚻 Bathroom Pass", note: "Scan + tap student to send out. Scan again + tap to mark return." },
      { id: "PASS-WATER",    label: "💧 Water Break",    note: "Scan + tap student. Tracks elapsed time on the board." },
      { id: "PASS-BREAK",    label: "🛋 Sensory Break",  note: "Scan + tap student. Alerts after 5 minutes." },
    ];
    const cells = passes.map((p) => `
      <div style="border:2px dashed #999;border-radius:14px;padding:24px;text-align:center;page-break-inside:avoid">
        <div style="font-size:24px;font-weight:800;margin-bottom:8px">${p.label}</div>
        <div style="font-size:12px;color:#555;margin-bottom:14px">${p.note}</div>
        ${bc128svg(p.id, 0, 100, true, 2.4)}
      </div>
    `).join("");
    w.document.write(`<!doctype html><html><head><title>STAR pass barcodes</title>
      <style>
        @media print { @page { size: letter; margin: 0.5in; } }
        body { font-family: -apple-system, sans-serif; padding: 16px; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        h2 { font-size: 18px; margin: 0 0 12px; }
      </style>
    </head><body>
      <h2>STAR — Pass Barcodes (laminate + tape near the door)</h2>
      <div class="grid">${cells}</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={print} style={{
          padding: "10px 14px", borderRadius: 10,
          background: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", color: "white",
          border: "none", fontWeight: 800, cursor: "pointer", fontSize: 13,
        }}>🖨 Print pass sheet</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {[
          { id: "PASS-BATHROOM", label: "🚻 Bathroom" },
          { id: "PASS-WATER",    label: "💧 Water" },
          { id: "PASS-BREAK",    label: "🛋 Sensory Break" },
        ].map((p) => (
          <div key={p.id} style={{
            padding: 10, borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{p.label}</div>
            <div dangerouslySetInnerHTML={{ __html: bc128svg(p.id, 0, 56, true, 1.4) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── status barcodes (Absent / Skipped / Excused / Makeup) ────── */

function StatusBarcodesPanel() {
  const items = [
    { id: "STATUS-ABSENT",  label: "🚫 Mark Absent",  note: "Scan when a student is absent. Pick the student + assignment in the popup." },
    { id: "STATUS-SKIPPED", label: "⏭ Mark Skipped", note: "Scan when a student skipped this assignment. Counts as missing." },
    { id: "STATUS-EXCUSED", label: "🩹 Mark Excused", note: "Scan when an assignment is excused (medical, IEP, etc)." },
    { id: "STATUS-MAKEUP",  label: "🔁 Mark Makeup",  note: "Scan when a student is doing makeup work — sets status to in-progress." },
  ];
  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const cells = items.map((p) => `
      <div style="border:2px dashed #999;border-radius:14px;padding:24px;text-align:center;page-break-inside:avoid">
        <div style="font-size:24px;font-weight:800;margin-bottom:8px">${p.label}</div>
        <div style="font-size:12px;color:#555;margin-bottom:14px">${p.note}</div>
        ${bc128svg(p.id, 0, 100, true, 2.4)}
      </div>
    `).join("");
    w.document.write(`<!doctype html><html><head><title>STAR status barcodes</title>
      <style>
        @media print { @page { size: letter; margin: 0.5in; } }
        body { font-family: -apple-system, sans-serif; padding: 16px; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        h2 { font-size: 18px; margin: 0 0 12px; }
      </style>
    </head><body>
      <h2>STAR — Assignment Status Barcodes (laminate near the gradebook)</h2>
      <div class="grid">${cells}</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={print} style={{
          padding: "10px 14px", borderRadius: 10,
          background: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", color: "white",
          border: "none", fontWeight: 800, cursor: "pointer", fontSize: 13,
        }}>🖨 Print status sheet</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {items.map((p) => (
          <div key={p.id} style={{
            padding: 10, borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{p.label}</div>
            <div dangerouslySetInnerHTML={{ __html: bc128svg(p.id, 0, 56, true, 1.4) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── manual entry — let teacher add an existing/old paper assignment ── */

function ManualAssignmentEntry({ onOpenGradebook }: { onOpenGradebook: (id: string) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [grade, setGrade] = useState("3rd");
  const [studentName, setStudentName] = useState("");
  const [week, setWeek] = useState("1");
  const [day, setDay] = useState("Monday");
  const [goal, setGoal] = useState("");
  const [maxScore, setMaxScore] = useState<number>(10);
  const [created, setCreated] = useState<{ id: string } | null>(null);

  // Existing assignments — quick list to grade more of
  const [tracker, setTracker] = useState<Record<string, StarTrackerEntry>>(() => StarStore.getAsnTrack());

  const create = () => {
    if (!name.trim()) { errorBeep(); return; }
    const bcDB = StarStore.getBcDB();
    const subjPrefix = subject.slice(0, 2).toUpperCase();
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    let n = 1;
    let id = "";
    while (true) {
      id = `${subjPrefix}-${yy}${mm}${dd}-${String(n).padStart(3, "0")}`;
      if (!bcDB[id]) break;
      n++;
    }

    // Create empty placeholder questions so the gradebook math (score / max)
    // works without forcing per-question marking.
    const questions = Array.from({ length: maxScore }, (_, i) => ({
      num: i + 1, text: `Question ${i + 1}`, answer: "—",
    }));

    const entry: BcEntry = {
      id, type: "assignment", name, subject, gradeLevel: grade,
      studentName: studentName || undefined, week, day, goal: goal || undefined,
      questions, lesson: null, createdDate: now.toISOString(),
    };
    bcDB[id] = entry;

    const trk = StarStore.getAsnTrack();
    trk[id] = {
      id, name, subject, gradeLevel: grade,
      studentName: studentName || undefined, week, day, goal: goal || undefined,
      questions, lesson: null, createdDate: now.toISOString(),
      status: "assigned", submissions: [],
    };

    const asns = StarStore.getAsns();
    asns.unshift({ id, name, subject, type: "Assignment", grade });

    saveAll({ bcDB, asnTracker: trk, asns });
    successBeep();
    setTracker({ ...trk });
    setCreated({ id });
    setName("");
  };

  const print = (id: string) => {
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) return;
    const svg = bc128svg(id, 0, 90, true, 2.0);
    w.document.write(`<!doctype html><html><head><title>${id}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:24px;text-align:center}</style>
      </head><body>
      <h2 style="margin:0 0 12px">${id}</h2>
      <div>${svg}</div>
      <div style="margin-top:8px;color:#666;font-size:12px">Tape this barcode to the paper — scan to grade.</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
      </body></html>`);
    w.document.close();
  };

  const sorted = useMemo(() => Object.values(tracker).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || "")), [tracker]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ color: "#f5f1e8" }}>

        <Field label="Assignment name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Multiplication WS p.12" style={inp()} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Subject">
            <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Grade">
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inp()}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Student (optional)">
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} style={inp()} />
          </Field>
          <Field label="IEP Goal (optional)">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} style={inp()} />
          </Field>
          <Field label="Week #">
            <input value={week} onChange={(e) => setWeek(e.target.value)} style={inp()} />
          </Field>
          <Field label="Day">
            <input value={day} onChange={(e) => setDay(e.target.value)} style={inp()} />
          </Field>
          <Field label="Total points">
            <input type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value) || 10)} style={inp()} />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={create} style={primaryBtn()}>📥 Mint Barcode</button>
        </div>

        {created && (
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 10,
            background: "rgba(16,185,129,0.10)",
            border: "1px solid rgba(16,185,129,0.40)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 16, color: "#fde68a" }}>{created.id}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => print(created.id)} style={ghostBtn()}>🖨 Print barcode</button>
                <button onClick={() => onOpenGradebook(created.id)} style={ghostBtn()}>✏️ Grade now</button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}
              dangerouslySetInnerHTML={{ __html: bc128svg(created.id, 0, 70, true, 2.0) }}
            />
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid rgba(168,85,247,0.30)`,
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🗂 Existing Assignments</div>
          {sorted.length > 0 && (
            <button onClick={() => printAllBarcodes(sorted)} style={ghostBtn()}>🖨 Print all labels</button>
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>Click any to open its gradebook.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflow: "auto" }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>No assignments yet.</div>
          ) : sorted.map((a) => (
            <div key={a.id} style={{
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)", color: "white",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
            }}>
              <button onClick={() => onOpenGradebook(a.id)} style={{
                background: "transparent", color: "white", border: "none",
                cursor: "pointer", textAlign: "left", padding: 0,
                display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{a.subject} · {a.gradeLevel || "—"} · {a.submissions?.length || 0} graded</div>
                </div>
                <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, color: "#fde68a", flexShrink: 0 }}>{a.id}</span>
              </button>
              <button
                onClick={() => {
                  const submissionCount = a.submissions?.length || 0;
                  const msg = submissionCount > 0
                    ? `Delete "${a.name}" (${a.id}) and its ${submissionCount} graded submission(s)? This cannot be undone.`
                    : `Delete "${a.name}" (${a.id})?`;
                  if (window.confirm(msg)) {
                    StarStore.deleteAssignment(a.id);
                    setTracker(StarStore.getAsnTrack());
                  }
                }}
                title="Delete assignment"
                style={{
                  padding: "6px 8px", borderRadius: 6,
                  background: "rgba(239,68,68,0.10)", color: "#fca5a5",
                  border: "1px solid rgba(239,68,68,0.40)",
                  cursor: "pointer", fontSize: 12, flexShrink: 0,
                }}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function printAllBarcodes(rows: StarTrackerEntry[]) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const cells = rows.map((r) => `
    <div style="border:1px dashed #999;border-radius:8px;padding:10px;margin:0;page-break-inside:avoid;text-align:center">
      <div style="font-size:12px;font-weight:700;color:#222;margin-bottom:4px">${escapeHtml(r.name)}</div>
      <div style="font-size:10px;color:#666;margin-bottom:6px">${escapeHtml(r.subject)} · ${escapeHtml(r.gradeLevel || "")}</div>
      ${bc128svg(r.id, 0, 60, true, 1.4)}
    </div>
  `).join("");
  w.document.write(`<!doctype html><html><head><title>STAR barcode labels</title>
    <style>
      @media print { @page { size: letter; margin: 0.4in; } }
      body { font-family: -apple-system, sans-serif; padding: 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      h2 { font-size: 16px; margin: 0 0 10px; }
    </style>
  </head><body>
    <h2>STAR barcode labels (${rows.length})</h2>
    <div class="grid">${cells}</div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
  </body></html>`);
  w.document.close();
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* ── settings — API key, students, templates ─────────────────────── */

function SettingsPanel() {
  const [apiKey, setApiKey] = useState(() => StarStore.getApiKey());
  const [model, setModel] = useState(() => StarStore.getAiModel() || "openrouter/auto");
  const [students, setStudents] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [tpls, setTpls] = useState<string[]>(() => StarStore.getTpls());
  const [pointsPerCompletion, setPointsPerCompletion] = useState<number>(() => StarStore.getPointsPerCompletion());
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    StarStore.setApiKey(apiKey.trim());
    StarStore.setAiModel(model.trim() || "openrouter/auto");
    StarStore.setStudents(students);
    StarStore.setTpls(tpls.filter((t) => t.trim()));
    StarStore.setPointsPerCompletion(Math.max(0, Math.floor(pointsPerCompletion) || 0));
    setSavedFlash(true);
    successBeep();
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const setStudent = (i: number, patch: Partial<StarStudent>) => {
    setStudents((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const addStudent = () => {
    const id = `STU-${String(students.length + 1).padStart(3, "0")}`;
    setStudents((arr) => [...arr, { id, firstName: "", lastName: "", grade: "" }]);
  };
  const removeStudent = (i: number) => setStudents((arr) => arr.filter((_, idx) => idx !== i));

  const setTpl = (i: number, v: string) => setTpls((arr) => arr.map((t, idx) => idx === i ? v : t));
  const addTpl = () => setTpls((arr) => [...arr, ""]);
  const removeTpl = (i: number) => setTpls((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>🤖 AI</div>
        <Field label="OpenRouter API Key">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-or-..." style={inp()} />
        </Field>
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="openrouter/auto" style={inp()} />
        </Field>
        <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          Stored locally only. The generator falls back to a built-in lesson if no key is set.
        </p>

        <div style={{ height: 18 }} />

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>🎁 Class Store Points</div>
        <Field label="Points per completed assignment">
          <input type="number" min={0} value={pointsPerCompletion} onChange={(e) => setPointsPerCompletion(Number(e.target.value))} style={inp()} />
        </Field>
        <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          Awarded when a grade is saved with status "completed". Set 0 to disable.
        </p>

        <div style={{ height: 18 }} />

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>📝 Quick Note Templates</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tpls.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input value={t} onChange={(e) => setTpl(i, e.target.value)} style={inp()} />
              <button onClick={() => removeTpl(i)} style={ghostBtn()}>✕</button>
            </div>
          ))}
          <button onClick={addTpl} style={ghostBtn()}>+ Add template</button>
        </div>
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14, padding: 16, color: "#f5f1e8",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>👥 Students ({students.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" }}>
          {students.map((s, i) => (
            <div key={s.id} style={{
              display: "grid", gridTemplateColumns: "auto 1fr 1fr 80px auto",
              gap: 6, alignItems: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: 6,
            }}>
              <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, opacity: 0.7, padding: "0 4px" }}>{s.id}</span>
              <input value={s.firstName} onChange={(e) => setStudent(i, { firstName: e.target.value })} placeholder="First" style={inp()} />
              <input value={s.lastName}  onChange={(e) => setStudent(i, { lastName: e.target.value })}  placeholder="Last"  style={inp()} />
              <input value={s.grade || ""} onChange={(e) => setStudent(i, { grade: e.target.value })}   placeholder="Grade" style={inp()} />
              <button onClick={() => removeStudent(i)} style={ghostBtn()}>✕</button>
            </div>
          ))}
          <button onClick={addStudent} style={ghostBtn()}>+ Add student</button>
        </div>
      </div>

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={{ ...primaryBtn(), background: savedFlash ? "#10b981" : "linear-gradient(135deg,#6366f1,#b23a48)" }}>
          {savedFlash ? "✓ Saved" : "Save settings"}
        </button>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <CsvImportPanel />
      </div>
    </div>
  );
}

/* ── CSV import — bring legacy STAR_Scanner.html exports in ──────── */

function CsvImportPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
  };

  const run = () => {
    if (!text.trim()) { errorBeep(); return; }
    setBusy(true);
    try {
      const r = importStarCsv(text);
      setResult(r);
      if (r.imported > 0) successBeep();
      else errorBeep();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14, padding: 16, color: "#f5f1e8",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>📋 Import Legacy STAR CSV</div>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 10px" }}>
        Paste or upload the CSV exported from the original STAR_Scanner.html app
        (header row: Barcode ID, Type, Name, Subject, Grade, Student, Week, Day,
        IEP Goal, Questions, Created, Submissions, Avg %, Avg Grade). Already-known
        barcodes are skipped — re-imports are safe.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 12, color: "white" }} />
        <button onClick={() => setText(LEGACY_STAR_CSV)} style={ghostBtn()}>📂 Load my legacy CSV</button>
        <button onClick={() => setText("")} style={ghostBtn()}>Clear</button>
        <button onClick={run} disabled={busy || !text.trim()} style={primaryBtn()}>
          {busy ? "Importing…" : "📥 Import rows"}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Paste CSV here…  e.g. "WR-260507-503","assignment","Reading","Reading","5th",...'
        rows={6}
        style={{
          width: "100%", padding: "9px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.30)", color: "white",
          border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 11, fontFamily: "Menlo, monospace",
          outline: "none", resize: "vertical",
        }}
      />

      {result && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: 8,
          background: result.imported > 0 ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
          border: `1px solid ${result.imported > 0 ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.30)"}`,
          fontSize: 12,
        }}>
          {result.message}
          {result.errors.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", opacity: 0.7 }}>{result.errors.length} errors</summary>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {result.errors.slice(0, 10).map((e, i) => <li key={i} style={{ fontSize: 11, opacity: 0.8 }}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
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
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}

// Pre-baked CSV from the legacy STAR_Scanner.html app — the teacher's
// existing assignments + refusal forms. One-click load in the importer.
const LEGACY_STAR_CSV = `"Barcode ID","Type","Name","Subject","Grade","Student","Week","Day","IEP Goal","Questions","Created","Submissions","Avg %","Avg Grade"
"WR-260506-411","assignment","Math","Math","3rd","Kaleb ","1","Monday","","10","5/6/2026","","",""
"WR-260506-085","assignment","Math","Math","3rd","Kaleb ","1","Monday","","10","5/6/2026","2","100%","A"
"WR-260506-228","assignment","Writing","Writing","1st","Anna ","1","Wednesday","","10","5/6/2026","","",""
"WR-250901-001","assignment","Multiplication WS p.12","Math","3rd","All","","","","","","","",""
"WR-250901-002","assignment","Fluency Passage Week 1","Reading","4th","All","","","","","","","",""
"WR-250902-003","assignment","Opinion Writing Draft","Writing","3rd","All","","","","","","","",""
"WR-250903-004","work-refusal-form","Life Cycles Worksheet","Science","4th","All","","","","","","","",""
"WR-250904-006","work-refusal-form","Division Practice p.8","Math","5th","All","","","","","","","",""
"SP-250901-001","specials-refusal-form","Physical Education","PE","All","All","","","","","","","",""
"SP-250901-002","specials-refusal-form","Art Class","Art","All","All","","","","","","","",""
"SP-250901-003","specials-refusal-form","Library Time","Library","All","All","","","","","","","",""
"SP-250901-004","specials-refusal-form","Music Class","Music","All","All","","","","","","","",""
"WR-260506-998","assignment","Reading","Reading","4th","Ameer ","1","Thursday","","10","5/6/2026","","",""
"WR-260506-283","assignment","Reading","Reading","4th","Ameer ","1","Thursday","","10","5/6/2026","1","90%","A"
"WR-260506-639","assignment","Math","Math","4th","Ameer ","1","Thursday","","10","5/6/2026","1","60%","D"
"WR-260506-835","assignment","Math","Math","4th","Ameer ","1","Thursday","","8","5/6/2026","","",""
"WR-260506-731","assignment","Science","Science","4th","Ameer ","1","Thursday","","8","5/6/2026","1","100%","A"
"WR-260506-493","assignment","Social Studies","Social Studies","4th","Ameer ","1","Thursday","","10","5/6/2026","","",""
"WR-260506-471","assignment","Writing","Writing","4th","Ameer ","1","Thursday","","10","5/6/2026","1","80%","B"
"WR-260507-067","assignment","Reading","Reading","5th","Ryan ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-420","assignment","Math","Math","5th","Ryan ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-821","assignment","Math","Math","5th","Ryan ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-995","assignment","Writing","Writing","5th","Ryan ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-238","assignment","Science","Science","5th","Ryan ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-941","assignment","Math","Math","4th","Rayden ","1","Thursday","","10","5/7/2026","1","90%","A"
"WR-260507-187","assignment","Math","Math","5th","Ryan ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-503","assignment","Reading","Reading","5th","Ryan ","1","Thursday","","10","5/7/2026","1","90%","A"
"WR-260507-786","assignment","Reading","Reading","1st","Kaleb ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-931","assignment","Math","Math","1st","Kaleb ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-419","assignment","Writing","Writing","2nd","Anna ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-736","assignment","Math","Math","3rd","Kaleb ","1","Monday","","10","5/7/2026","","",""
"WR-260507-199","assignment","Math","Math","2nd","Kaleb ","1","Monday","","10","5/7/2026","1","100%","A"
"WR-260507-509","assignment","Science","Science","2nd","Kaleb ","1","Monday","","10","5/7/2026","","",""
"WR-260507-550","assignment","Reading","Reading","2nd","Kaleb ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-923","assignment","Reading","Reading","2nd","Aiden ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-120","assignment","Math","Math","2nd","Aiden ","1","Thursday","","10","5/7/2026","","",""
"WR-260507-617","assignment","Reading","Reading","2nd","Zoey ","1","Monday","","10","5/7/2026","1","100%","A"
"WR-260507-350","assignment","Math","Math","2nd","Zoey ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-330","assignment","Writing","Writing","2nd","Zoey ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-247","assignment","Science","Science","2nd","Zoey ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-697","assignment","Reading","Reading","2nd","Anna ","1","Thursday","","10","5/7/2026","1","100%","A"
"WR-260507-100","assignment","Math","Math","2nd","Anna ","1","Thursday","","10","5/7/2026","","",""`;
