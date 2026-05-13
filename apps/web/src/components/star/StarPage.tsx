// STAR Program hub. Tabs:
//   • Generator    — create assignments + refusal forms with barcodes
//   • Old work     — manually add a paper assignment so it can be graded
//   • Reports      — searchable + CSV-exportable logs
//   • Settings     — OpenRouter API key, model, students, quick templates
//
// Tip: scan a barcode anywhere in the app to pop the right modal.

import React, { useEffect, useMemo, useState } from "react";
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
import QuizGenerator, { QuizPackGenerator } from "./QuizGenerator.tsx";
import IepTracker from "./IepTracker.tsx";
import IepAssignmentGenerator from "./IepAssignmentGenerator.tsx";
import IepPacketGenerator from "./IepPacketGenerator.tsx";
import KudosCertificate from "./KudosCertificate.tsx";
import FolderLabelsGenerator from "./FolderLabelsGenerator.tsx";
import StudentReferenceSheet from "./StudentReferenceSheet.tsx";
import PecsBuilder from "./PecsBuilder.tsx";
import BehaviorTracker from "./BehaviorTracker.tsx";
import GroupsManager from "./GroupsManager.tsx";
import EndOfDayReport from "./EndOfDayReport.tsx";
import StarBackupPanel from "./StarBackupPanel.tsx";
import SnapshotGenerator from "./SnapshotGenerator.tsx";
import SubPlansGenerator from "./SubPlansGenerator.tsx";
import StarReports from "./StarReports.tsx";
import GradebookModal from "./GradebookModal.tsx";
import StarHome from "./StarHome.tsx";
import StarGradebookView from "./StarGradebookView.tsx";
import StarDataView from "./StarDataView.tsx";
import { tokens as T } from "../../lib/star/theme.ts";
import { Button } from "./ui.tsx";

type Tab = "home" | "gradebook" | "create" | "iep" | "behavior" | "groups" | "reports" | "data" | "settings";

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
    // Clean up legacy duplicate submissions from before the save path
    // was fixed — see dedupAsnTrackSubmissions in storage.ts. Without
    // this, snapshots + gradebook averages still factor in old grades.
    // Also re-stamp completedDate from loggedAt in Pacific time
    // (UTC-stamped grades from after 5 PM Pacific were pushed into
    // tomorrow's date and silently dropped from today's snapshot).
    // And auto-prune assignments older than 30 days so localStorage
    // doesn't balloon past the browser's ~10 MB cap, which causes
    // new grades to be silently rejected by the browser.
    (async () => {
      const { dedupAsnTrackSubmissions, fixUtcCompletedDates, pruneOldAssignments } = await import("../../lib/star/storage.ts");
      dedupAsnTrackSubmissions();
      fixUtcCompletedDates();
      pruneOldAssignments(30);
    })();
    // Best-effort silent sync on first mount so the roster + assignment
    // barcodes are always fresh when a teacher opens the page.
    runSync();
    // Capture the active class id so STAR events fired from this device
    // (iPad) get relayed to the server and picked up by the projector.
    // After the class id is set, push every local QZ/AS/WR/SP
    // barcode to the server (idempotent upsert) to catch up any
    // assignments that were minted before the class id was ready —
    // fixes "I made it today but the iPad can't find it".
    api.getClasses().then(async (cs) => {
      if (Array.isArray(cs) && cs[0]?.id) {
        setActiveClassId(cs[0].id);
        try {
          const { pushAllLocalBarcodes } = await import("../../lib/star/barcodeRelay.ts");
          await pushAllLocalBarcodes();
        } catch {}
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { id: "home"      as Tab, icon: "🏠", label: "Home" },
    { id: "gradebook" as Tab, icon: "📚", label: "Gradebook" },
    { id: "create"    as Tab, icon: "✨", label: "Create" },
    { id: "iep"       as Tab, icon: "🎯", label: "IEP" },
    { id: "behavior"  as Tab, icon: "📈", label: "Behavior" },
    { id: "groups"    as Tab, icon: "👥", label: "Groups" },
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

          {/* GROUP 2 — IEP-aligned (auto-logs progress on grade) */}
          <CreateGroup label="IEP-Aligned" hint="Pick a kid's IEP goal — generated work auto-logs Met/Partial/Not yet on score.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="📦" title="IEP packet (every kid × every goal)" description="One tap — generates an IEP-aligned worksheet for each kid for each of their goals. Synthesizes a grade-level goal if a kid has none on file.">
                <IepPacketGenerator />
              </SectionWrapper>
              <SectionWrapper icon="🎯" title="From an IEP goal" description="Worksheet, quiz, or reflection — tied to a specific goal so the SEIF report fills in by itself.">
                <IepAssignmentGenerator />
              </SectionWrapper>
            </div>
          </CreateGroup>

          {/* GROUP 3 — Quizzes (MCQ format) */}
          <CreateGroup label="Quizzes" hint="Multiple-choice. Bubble-sheet print + auto-grades on scan.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="📝" title="Quiz pack" description="One MCQ quiz per kid in one PDF.">
                <QuizPackGenerator />
              </SectionWrapper>
              <SectionWrapper icon="🎯" title="Personal quiz" description="One MCQ quiz for one kid.">
                <QuizGenerator />
              </SectionWrapper>
            </div>
          </CreateGroup>

          {/* GROUP — Reports & Share (parent/student snapshots + sub plans) */}
          <CreateGroup label="Reports & Share" hint="One-tap printable PDFs — for parents, kids, and substitutes.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: T.space.lg }}>
              <SectionWrapper icon="📤" title="Day / Month Snapshot" description="One-page PDF of a kid's day OR month — parent edition or kid-friendly student edition.">
                <SnapshotGenerator />
              </SectionWrapper>
              <SectionWrapper icon="📋" title="Sub plans packet" description="Schedule + roster + IEP cliff notes + your emergency procedures, all in one PDF.">
                <SubPlansGenerator />
              </SectionWrapper>
              <SectionWrapper icon="📊" title="End-of-day report" description="One-tap recap of the whole day — assignments completed, behaviors logged, refusals, passes. Print at 3pm to file with admin or share with co-teachers.">
                <EndOfDayReport />
              </SectionWrapper>
              <SectionWrapper icon="🏆" title="Kudos certificate" description="One-tap fun certificate on cardstock — kid's name, photo, and a kudos barcode for the fridge.">
                <KudosCertificate />
              </SectionWrapper>
              <SectionWrapper icon="📌" title="Folder labels" description="Avery 5160 sheet with each kid's name + photo + a scannable STAR barcode. Scan the label on the iPad to pull up the kid's pending assignments and recent grades.">
                <FolderLabelsGenerator />
              </SectionWrapper>
              <SectionWrapper icon="📋" title="Student reference sheet" description="Clipboard / desk reference with every kid's photo + big scannable barcode. Tally-grid layout adds 8 hand-tracking columns for the day.">
                <StudentReferenceSheet />
              </SectionWrapper>
              <SectionWrapper icon="🟦" title="PECS card builder" description="Build a printable set of 2&quot; picture symbols for sentence boards, AAC, or first/then. 74 bundled symbols + custom cards.">
                <PecsBuilder />
              </SectionWrapper>
            </div>
          </CreateGroup>

          {/* GROUP 3 — Single-shot generators */}
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
              <SectionWrapper icon="🎮" title="Free time barcodes" description="Earned reward or sensory regulation timer — 5 / 10 / 15 / 20 min.">
                <FreetimeBarcodesPanel />
              </SectionWrapper>
              <SectionWrapper icon="🚪" title="Movement (Specials + Lunch)" description="Kids scan on the way to/from PE/Music/Art and lunch — auto-tracks who's out.">
                <MovementBarcodesPanel />
              </SectionWrapper>
              <SectionWrapper icon="⏱" title="Class timer barcodes" description="Scan + the projector board kicks off the visual countdown — no walking back to the iPad.">
                <TimerBarcodesPanel />
              </SectionWrapper>
              <SectionWrapper icon="🛠" title="Supplies & library" description="Track who borrowed the iPad / pencil / headphones / library books.">
                <SupplyBarcodesPanel />
              </SectionWrapper>
              <SectionWrapper icon="📈" title="Behavior barcodes" description="One barcode per behavior you've defined. Scan to log + tap a kid. Add new behaviors at /star → 📈 Behavior.">
                <BehaviorBarcodesPanel />
              </SectionWrapper>
            </div>
            <SectionWrapper icon="📥" title="Add old paper assignment" description="Mint a barcode for a worksheet you already had on paper.">
              <ManualAssignmentEntry key={syncStamp} onOpenGradebook={(id) => setOpenGradebook(id)} />
            </SectionWrapper>
          </CreateGroup>
        </>
      )}

      {tab === "iep" && (
        <>
          <PageHeader
            kicker="🎯 IEP Goals"
            title="Daily progress · IEP team-ready"
            subtitle="Tap Met / Partial / Not yet per kid each day. Set goals in Settings → IEP Goals. Print a SEIF report for your IEP meetings — per kid or whole class."
          />
          <IepTracker />
        </>
      )}

      {tab === "behavior" && (
        <>
          <PageHeader
            kicker="📈 Behavior"
            title="Custom behavior tracker"
            subtitle="Tap a chip on a kid to log a behavior. Long-press to add a note. Frequency chart + IEP-printable report at the bottom."
          />
          <BehaviorTracker />
        </>
      )}

      {tab === "groups" && (
        <>
          <PageHeader
            kicker="👥 Groups"
            title="Group roster"
            subtitle="Who's in whose group — pulled live from the roster, styled to match the board, and printable as a wall poster."
          />
          <GroupsManager />
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
          <div style={{ marginTop: T.space["2xl"] }}>
            <SectionWrapper icon="💾" title="Cross-device backup & restore" description="Carry behaviors / IEP goals / daily notes / custom music / templates between your MacBook, iPad, and Chromebook. The roster + assignments sync automatically through the server, but local-only settings need this.">
              <StarBackupPanel />
            </SectionWrapper>
          </div>
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

/* ── Free Time barcodes — earned reward / sensory regulation timer ── */
function FreetimeBarcodesPanel() {
  const items = [
    { id: "FREETIME-5",  label: "🎮 Free Time · 5 min",  note: "Scan + tap a kid. 5-minute timed session, ends automatically or by re-scan." },
    { id: "FREETIME-10", label: "🎮 Free Time · 10 min", note: "10-minute reward / regulation block." },
    { id: "FREETIME-15", label: "🎮 Free Time · 15 min", note: "15-minute reward — earned for behavior plan or finished work." },
    { id: "FREETIME-20", label: "🎮 Free Time · 20 min", note: "20-minute longer reward window." },
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
    w.document.write(`<!doctype html><html><head><title>STAR free time barcodes</title>
      <style>
        @media print { @page { size: letter; margin: 0.5in; } }
        body { font-family: -apple-system, sans-serif; padding: 16px; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        h2 { font-size: 18px; margin: 0 0 12px; }
      </style>
    </head><body>
      <h2>STAR — Free Time Barcodes (laminate at your desk)</h2>
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
        }}>🖨 Print free time sheet</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
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

/* ── Behavior barcodes — one per behavior def, scan to log ──────── */
function BehaviorBarcodesPanel() {
  const [defs, setDefs] = React.useState(() => StarStore.getBehaviorDefs());
  React.useEffect(() => {
    const refresh = () => setDefs(StarStore.getBehaviorDefs());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const visible = defs.filter((d) => !d.archived);
  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const cells = visible.map((d) => {
      const c = d.tone === "positive" ? "#10b981" : d.tone === "challenge" ? "#f59e0b" : "#3b82f6";
      const code = `BH-${d.id}`;
      return `
        <div style="border:2.5px dashed ${c};border-radius:14px;padding:18px;text-align:center;page-break-inside:avoid">
          <div style="font-size:42px;line-height:1;margin-bottom:6px">${d.emoji}</div>
          <div style="font-size:18px;font-weight:900;margin-bottom:4px;color:#111">${d.label}</div>
          <div style="font-size:10px;font-weight:800;color:${c};letter-spacing:0.10em;text-transform:uppercase;margin-bottom:10px">${d.tone}${d.scope === "student" ? " · per-kid" : ""}</div>
          ${require_bc128(code)}
        </div>
      `;
    }).join("");
    w.document.write(`<!doctype html><html><head><title>STAR behavior barcodes</title>
      <style>
        @media print { @page { size: letter; margin: 0.4in; } }
        body { font-family: -apple-system, sans-serif; padding: 16px; color: #111; }
        h2 { font-size: 18px; margin: 0 0 6px; }
        .lede { font-size: 12px; color: #555; margin-bottom: 14px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      </style>
    </head><body>
      <h2>STAR — Behavior Barcodes</h2>
      <div class="lede">Scan a barcode → roster grid pops on the iPad → tap a kid (or +&nbsp;to add note + points). Long-press a kid for a note. Add or edit behaviors at /star → 📈 Behavior.</div>
      <div class="grid">${cells}</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200))</script>
    </body></html>`);
    w.document.close();
  };
  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
          {visible.length} behavior{visible.length === 1 ? "" : "s"} on file · scan to log
        </div>
        <button onClick={print} disabled={visible.length === 0} style={{
          padding: "10px 14px", borderRadius: 10,
          background: visible.length === 0 ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)",
          color: "white", border: "none", fontWeight: 800,
          cursor: visible.length === 0 ? "not-allowed" : "pointer",
          fontSize: 13, opacity: visible.length === 0 ? 0.55 : 1,
        }}>🖨 Print behavior sheet</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {visible.map((d) => {
          const c = d.tone === "positive" ? "#10b981" : d.tone === "challenge" ? "#f59e0b" : "#3b82f6";
          return (
            <div key={d.id} style={{
              padding: 10, borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${c}55`, textAlign: "center",
            }}>
              <div style={{ fontSize: 24, marginBottom: 2 }}>{d.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6, color: "#fce7f3" }}>{d.label}</div>
              <div dangerouslySetInnerHTML={{ __html: bc128svg(`BH-${d.id}`, 0, 44, false, 1.0) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tiny inline helper so the template above can call bc128svg as a
// stringifier (we call the same fn the React panel uses).
function require_bc128(code: string): string {
  return bc128svg(code, 0, 70, true, 1.6);
}

/* ── Movement barcodes (Specials in/out, Lunch in/out) ─────────── */
function MovementBarcodesPanel() {
  const items = [
    { id: "SPECIALS-OUT", label: "🎨 Specials — OUT", note: "Scan + tap kids leaving for PE/Music/Art." },
    { id: "SPECIALS-IN",  label: "🎨 Specials — IN",  note: "Scan + tap kids walking back in." },
    { id: "LUNCH-OUT",    label: "🍱 Lunch — OUT",    note: "Scan + tap kids leaving for lunch." },
    { id: "LUNCH-IN",     label: "🍱 Lunch — IN",     note: "Scan + tap returning kids." },
  ];
  return <BarcodeSheetPanel items={items} title="Movement" sheetTitle="STAR — Movement Barcodes (laminate by the door)" />;
}

/* ── Class timer barcodes (TIMER-N) ────────────────────────────── */
function TimerBarcodesPanel() {
  const items = [
    { id: "TIMER-5",  label: "⏱ 5 min",  note: "Scan to start a 5-min countdown on the projector." },
    { id: "TIMER-10", label: "⏱ 10 min", note: "Same — 10 min." },
    { id: "TIMER-15", label: "⏱ 15 min", note: "Same — 15 min." },
    { id: "TIMER-20", label: "⏱ 20 min", note: "Same — 20 min." },
  ];
  return <BarcodeSheetPanel items={items} title="Timer" sheetTitle="STAR — Class Timer Barcodes (laminate near your desk)" />;
}

/* ── Supply / library barcodes ─────────────────────────────────── */
function SupplyBarcodesPanel() {
  const items = [
    { id: "SUPPLY-PENCIL-OUT",     label: "✏️ Pencil — OUT",      note: "Borrow a pencil." },
    { id: "SUPPLY-PENCIL-IN",      label: "✏️ Pencil — IN",       note: "Return a pencil." },
    { id: "SUPPLY-TABLET-OUT",     label: "📱 Tablet — OUT",      note: "Borrow a tablet (no more 'where's the iPad')." },
    { id: "SUPPLY-TABLET-IN",      label: "📱 Tablet — IN",       note: "Return a tablet." },
    { id: "SUPPLY-HEADPHONES-OUT", label: "🎧 Headphones — OUT",  note: "Borrow headphones." },
    { id: "SUPPLY-HEADPHONES-IN",  label: "🎧 Headphones — IN",   note: "Return headphones." },
    { id: "BOOK-OUT",              label: "📚 Book — OUT",        note: "Class library checkout. Type the title in the popup." },
    { id: "BOOK-IN",               label: "📚 Book — IN",         note: "Library return." },
  ];
  return <BarcodeSheetPanel items={items} title="Supplies & Library" sheetTitle="STAR — Supply Barcodes (laminate by the supply tub)" />;
}

/* ── shared print-sheet renderer (saves duplicating all 4 panels) ── */
function BarcodeSheetPanel({ items, title, sheetTitle }: {
  items: Array<{ id: string; label: string; note: string }>;
  title: string;
  sheetTitle: string;
}) {
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
    w.document.write(`<!doctype html><html><head><title>${sheetTitle}</title>
      <style>
        @media print { @page { size: letter; margin: 0.5in; } }
        body { font-family: -apple-system, sans-serif; padding: 16px; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        h2 { font-size: 18px; margin: 0 0 12px; }
      </style>
    </head><body>
      <h2>${sheetTitle}</h2>
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
        }}>🖨 Print {title.toLowerCase()} sheet</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: 6,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "auto 1fr 1fr 80px auto",
                gap: 6, alignItems: "center",
              }}>
                <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, opacity: 0.7, padding: "0 4px" }}>{s.id}</span>
                <input value={s.firstName} onChange={(e) => setStudent(i, { firstName: e.target.value })} placeholder="First" style={inp()} />
                <input value={s.lastName}  onChange={(e) => setStudent(i, { lastName: e.target.value })}  placeholder="Last"  style={inp()} />
                <input value={s.grade || ""} onChange={(e) => setStudent(i, { grade: e.target.value })}   placeholder="Grade" style={inp()} />
                <button onClick={() => removeStudent(i)} style={ghostBtn()}>✕</button>
              </div>
              <textarea
                value={s.subNotes || ""}
                onChange={(e) => setStudent(i, { subNotes: e.target.value })}
                rows={2}
                placeholder="📋 Sub notes — triggers, calming strategies, what works (printed in the Sub Plans packet)"
                style={{ ...inp(), marginTop: 6, resize: "vertical", fontFamily: "inherit", minHeight: 50 }}
              />
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
        <IepGoalsPanel students={students} />
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <CsvImportPanel />
      </div>
    </div>
  );
}

/* ── IEP Goals editor — multi-goal per kid, used by IEP tab + SEIF report ── */

// Pre-baked roster IEP goals — one-tap loader for Alec's actual class.
// Names matched case-insensitively against the student roster. Kids
// not on roster are skipped silently. Rayden's goals are kept here
// in case he comes back; he's filtered out of the board separately.
const ROSTER_IEP_GOALS: Record<string, Array<{ area: string; goalText: string }>> = {
  anna: [
    { area: "Reading — Phonics", goalText: "Will apply instructional-level phonics and word analysis skills to decode and recognize high-frequency words with 80% accuracy" },
    { area: "Reading — CVC Blending", goalText: "Will accurately blend CVC words with 80% accuracy during structured activities" },
    { area: "Reading — Sight Words", goalText: "Will recognize and read the first 50 Fry sight words with 60% accuracy" },
    { area: "Writing — Conventions", goalText: "Will demonstrate command of standard English conventions including capitalization and punctuation when writing a complete sentence, achieving 80% accuracy" },
    { area: "Writing — Dictation", goalText: "Will trace a sentence in response to a verbal prompt that she has dictated" },
    { area: "Math", goalText: "Will independently solve addition and subtraction problems within 20 using a number line or manipulatives with 80% accuracy" },
    { area: "Social/Emotional — Transitions", goalText: "Will transition between classroom activities independently and appropriately in 3/5 opportunities using visual schedules or timers" },
    { area: "Social/Emotional — Emotion Expression", goalText: "Will accept direction within 2 prompts and communicate emotions and needs using words or visuals when frustrated" },
  ],
  ameer: [
    { area: "Behavior — On-Task", goalText: "When assigned an academic task during whole group instruction, will independently remain on-task for 20 minutes or until task is completed, in 4/5 academic tasks" },
    { area: "Behavior — Transitions", goalText: "Given a visual schedule and a verbal prompt, will transition from an in-process activity to a new activity using 1 strategy from the anchor chart, for 4/5 transition opportunities" },
    { area: "Social/Emotional — Conflict Resolution", goalText: "Given a written assignment to brainstorm positive strategies for handling conflict, will write a list of at least 3 positive strategies, for 4/5 conflict opportunities" },
    { area: "Behavior — Classroom Expectations", goalText: "Given a visual of a new classroom expectation and a verbal prompt, will follow the new classroom expectation by acting in accordance with the visual, for 4/5 opportunities" },
  ],
  jaida: [
    { area: "Reading — Context Clues", goalText: "After reading a paragraph containing 1 bold unknown word and at least 1 underlined context clue, will use the context clue to write the meaning of the unknown word, for 4/5 unknown words on 3/4 progress monitoring assessments" },
    { area: "Reading — Root Words", goalText: "Will write a definition for 1 bolded word containing a common root (e.g., aquatics, geothermal, cardiac) using context clues, for 4/5 unknown words" },
    { area: "Reading — Prefixes", goalText: "Will write a definition for 1 bolded word containing a prefix (e.g., undone, antiviral, retell) using context clues and prefixes, for 4/5 unknown words" },
    { area: "Writing — Conventions", goalText: "Given an instructional-level sentence with a highlighted writing convention error related to capitalization, punctuation, or spelling, will correct the error by rewriting the sentence, for 4/5 sentences on 3/4 progress monitoring assessments" },
    { area: "Math — Add/Subtract", goalText: "Given a visually represented equation with two multi-digit whole numbers within 1,000 and a place value chart, will add or subtract by bundling or decomposing the pieces with guiding questions, for 4/5 equations on 3/4 progress monitoring assessments" },
    { area: "Math — Multiplication", goalText: "Given a multiplication problem with 2 multi-digit whole numbers up to 3 digits each (e.g., 468 × 44), will use the standard algorithm to solve in 2 minutes or less, for 4/5 multiplication exercises" },
    { area: "Social/Emotional — If-Then", goalText: "When asked to predict how a given behavior might affect the feelings of others, will write an If-Then sentence including the given behavior and 1 predicted emotion, scoring 2/2 rubric points on 4/5 progress monitoring assessments" },
    { area: "Behavior — Bullying/Teasing", goalText: "Given written definitions of teasing and bullying behaviors, will write 2 examples of unwelcome teasing or bullying behaviors experienced or witnessed, scoring 2/2 rubric points on 4/5 progress monitoring assessments" },
  ],
  kaleb: [
    { area: "Reading — Decoding", goalText: "Given a word list of 20 regularly spelled one-syllable words with closed, open, vowel digraph, vowel-consonant-e, and r-controlled syllable types, will decode and blend to read 18/20 words aloud using a decoding strategy on 3/4 progress monitoring assessments" },
    { area: "Reading — Comprehension", goalText: "After a read-aloud of a 3-4 sentence independent-level literary story, when verbally prompted to describe a character, will verbally state 2 details from the story that describe the character on 3/4 progress monitoring assessments" },
    { area: "Writing — Sentence Frames", goalText: "Given a worksheet read aloud with 5 sentence frames, will complete each sentence frame verbally and in writing using a word bank, applying correct prepositional phrase placement, verb tense, and adjective order, for 5/5 sentences" },
    { area: "Writing — Conventions", goalText: "Given a read-aloud of a written sentence with 1 writing convention error related to capitalization of names and end punctuation, will correct the error by crossing out and replacing, for 3/4 sentences on 3/4 progress monitoring assessments" },
    { area: "Math — Add/Subtract", goalText: "Given an addition or subtraction problem within 1,000 and a place value chart, will write the sum or difference using a place value strategy with guiding questions, for 4/5 problems on 3/4 progress monitoring assessments" },
    { area: "Math — Multiplication", goalText: "Given a visually represented multiplication expression with multiples of ten within three digits and a one-digit number, will find the product by counting equal groups using illustrations, arrays, or area models, for 4/5 problems on 3/4 progress monitoring assessments" },
    { area: "Social/Emotional — Emotions", goalText: "Given a written If-Then sentence starter describing how a familiar behavior makes one feel, will complete the sentence by selecting 1 emotion from a word bank, scoring 1/1 rubric points on 4/5 progress monitoring assessments" },
    { area: "Behavior — On-Task", goalText: "When assigned an academic task during whole group instruction, will independently remain on-task for 15 minutes or until the task is completed, in 4/5 academic tasks" },
    { area: "Behavior — Ethical Choices", goalText: "Given a written assignment with 2 choices of how a person in an ethical scenario can be responsible, will circle 1 way in which that person could accept responsibility, on 4/5 progress monitoring assessments" },
  ],
  zoey: [
    { area: "Reading — Vowel Digraphs", goalText: "Given a written word list of 10 one-syllable words containing long-a, long-e, and long-o vowel digraphs (e.g., road, rain, speech), will verbally decode the words to read aloud 8/10 on 3/4 progress monitoring assessments" },
    { area: "Reading — Two-Syllable Decoding", goalText: "Given a word list of 20 regularly spelled two-syllable words including six different syllable types, will verbally decode each syllable and blend to read 16/20 words aloud using a decoding strategy on 3/4 progress monitoring assessments" },
    { area: "Reading — Main Idea", goalText: "Given an instructional-level informational text with an explicitly stated main idea, will determine the main idea with 90% accuracy for 3/4 texts" },
    { area: "Articulation", goalText: "Will improve articulation by correctly producing /s/, /z/, \"CH\", and \"J\" in conversation, maintaining 90% criteria as implemented by the Speech Language Pathologist" },
    { area: "Math — Place Value/Add/Subtract", goalText: "Given an addition or subtraction problem within 500 visually represented with base ten blocks, will write the sum or difference using a place value strategy with guiding questions, for 4/5 problems on 3/4 progress monitoring assessments" },
    { area: "Writing — Opinion Paragraph", goalText: "Given an opinion writing prompt, will write a 4-sentence opinion paragraph with 1 topic sentence, 3 supporting reasons, and 2 transition words, on 2/3 writing prompts" },
    { area: "Social/Emotional — On-Task", goalText: "When assigned an academic task during whole group instruction, will independently remain on-task for 15 minutes or until the task is completed, in 4/5 academic tasks" },
    { area: "Social/Emotional — Calming Strategies", goalText: "Given the end of a 20-minute unstructured activity and a choice board, will implement a calming strategy from their toolbox for 5 minutes, for 4/5 opportunities on 3/4 progress monitoring assessments" },
  ],
  rayden: [
    { area: "Behavior — On-Task", goalText: "When assigned an academic task during whole group instruction, will independently remain on-task for 15 minutes or until the task is completed, in 4/5 academic tasks as measured by observation and documentation" },
    { area: "Behavior — Transitions", goalText: "Given an anchor chart of transition strategies and a verbal prompt, will transition from an in-process activity to a new activity using 1 strategy from the anchor chart, for 4/5 transition opportunities on 3/4 progress monitoring assessments" },
    { area: "Social/Emotional — Upsetting Situations", goalText: "Given a written task evaluating how a person in a scenario deals with an upsetting situation (e.g., being left out, losing, rejection, being teased), will write a response explaining if they would approach it the same way and give one reason why/why not, scoring 2/2 on 4/5 progress monitoring assessments" },
    { area: "Behavior — Productive School Behaviors", goalText: "Will demonstrate productive school behaviors on a daily basis, achieving 80% as measured by observations and documentation by special education staff" },
    { area: "Behavior — Maladaptive Behaviors", goalText: "Will decrease maladaptive behaviors when upset while participating in structured and unstructured activities 90% of the time, as measured by observation and documentation" },
  ],
};

function IepGoalsPanel({ students }: { students: StarStudent[] }) {
  const [goals, setGoals] = useState(() => StarStore.getIepGoals());
  const [openId, setOpenId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { area: string; goalText: string; metT: string; partT: string }>>({});
  const [importFlash, setImportFlash] = useState<string | null>(null);
  const [defaultMet, setDefaultMet] = useState<number>(() => StarStore.getIepDefaultMetThreshold());
  const [defaultPart, setDefaultPart] = useState<number>(() => StarStore.getIepDefaultPartialThreshold());

  const refresh = () => setGoals(StarStore.getIepGoals());

  const goalsForKid = (sid: string) => goals.filter((g) => g.studentId === sid);

  const setDraft = (id: string, patch: { area?: string; goalText?: string; metT?: string; partT?: string }) => {
    setDrafts((cur) => ({
      ...cur,
      [id]: {
        area:     patch.area     !== undefined ? patch.area     : (cur[id]?.area     ?? ""),
        goalText: patch.goalText !== undefined ? patch.goalText : (cur[id]?.goalText ?? ""),
        metT:     patch.metT     !== undefined ? patch.metT     : (cur[id]?.metT     ?? ""),
        partT:    patch.partT    !== undefined ? patch.partT    : (cur[id]?.partT    ?? ""),
      },
    }));
  };

  const persistGoal = (id: string) => {
    const d = drafts[id];
    if (!d) return;
    const numOrUndef = (s: string): number | undefined => {
      const n = Number(s);
      return s === "" || !Number.isFinite(n) ? undefined : Math.max(0, Math.min(100, Math.round(n)));
    };
    StarStore.updateIepGoal(id, {
      goalText: d.goalText, area: d.area,
      metThreshold: numOrUndef(d.metT) ?? null as any,
      partialThreshold: numOrUndef(d.partT) ?? null as any,
    });
    refresh();
    setSavedFlash(id);
    setTimeout(() => setSavedFlash((x) => x === id ? null : x), 800);
  };

  const addGoal = (sid: string) => {
    const g = StarStore.addIepGoal(sid, "", "");
    refresh();
    setDraft(g.id, { area: "", goalText: "" });
    setOpenId(sid);
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this goal?")) return;
    StarStore.deleteIepGoal(id);
    refresh();
  };

  const loadRoster = () => {
    let loaded = 0;
    let skipped: string[] = [];
    for (const s of students) {
      const key = (s.firstName || "").trim().toLowerCase();
      const list = ROSTER_IEP_GOALS[key];
      if (!list) { skipped.push(s.firstName); continue; }
      StarStore.setStudentGoals(s.id, list);
      loaded += list.length;
    }
    refresh();
    setImportFlash(`Loaded ${loaded} goals across ${students.length - skipped.length} students.${skipped.length ? ` Not in preset: ${skipped.join(", ")}.` : ""}`);
    setTimeout(() => setImportFlash(null), 6000);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14, padding: 16, color: "#f5f1e8",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>🎯 IEP Goals</div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
          Add as many goals per kid as the IEP doc lists. All show in the IEP tab + SEIF report.
        </div>
      </div>

      {Object.keys(ROSTER_IEP_GOALS).length > 0 && (
        <div style={{
          marginTop: 10, marginBottom: 4,
          padding: "10px 12px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.06))",
          border: "1px solid rgba(168,85,247,0.30)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: "#fce7f3", fontWeight: 600 }}>
            One-tap import: Anna, Ameer, Jaida, Kaleb, Zoey, Rayden — real IEP goals you sent over.
          </div>
          <button
            onClick={loadRoster}
            style={{
              padding: "8px 14px", borderRadius: 999,
              background: "linear-gradient(135deg, #ec4899, #a855f7)",
              border: "none", color: "white", fontWeight: 800, fontSize: 12,
              cursor: "pointer", touchAction: "manipulation",
              boxShadow: "0 6px 16px -6px rgba(236,72,153,0.55)",
            }}
          >📥 Load my class goals</button>
        </div>
      )}

      {/* Global default thresholds — used when a goal doesn't specify its own */}
      <div style={{
        marginTop: 10, padding: "10px 14px", borderRadius: 10,
        background: "rgba(168,85,247,0.06)",
        border: "1px solid rgba(168,85,247,0.20)",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
          color: "rgba(196,181,253,0.65)",
        }}>Default Grading</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#86efac", fontWeight: 700 }}>
          ≥
          <input
            type="number" min={0} max={100}
            value={defaultMet}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
              setDefaultMet(v);
              StarStore.setIepDefaultMetThreshold(v);
            }}
            style={{ ...inp(), width: 76, padding: "5px 8px", textAlign: "center" }}
          />
          % Met
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#fcd34d", fontWeight: 700 }}>
          ≥
          <input
            type="number" min={0} max={100}
            value={defaultPart}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
              setDefaultPart(v);
              StarStore.setIepDefaultPartialThreshold(v);
            }}
            style={{ ...inp(), width: 76, padding: "5px 8px", textAlign: "center" }}
          />
          % Partial
        </label>
        <span style={{ flex: 1, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
          Used when a goal doesn't specify its own threshold below.
        </span>
      </div>
      {importFlash && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 8,
          background: "rgba(34,197,94,0.10)",
          border: "1px solid rgba(34,197,94,0.40)",
          color: "#bbf7d0", fontSize: 12, fontWeight: 700,
        }}>{importFlash}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {students.length === 0 && (
          <div style={{
            padding: 14, borderRadius: 10,
            background: "rgba(168,85,247,0.04)",
            border: "1px dashed rgba(168,85,247,0.25)",
            color: "rgba(196,181,253,0.65)", fontSize: 13, fontWeight: 600,
          }}>
            Add students above first.
          </div>
        )}
        {students.map((s) => {
          const list = goalsForKid(s.id);
          const expanded = openId === s.id || list.length > 0;
          return (
            <div key={s.id} style={{
              padding: 10, borderRadius: 10,
              background: "rgba(168,85,247,0.06)",
              border: "1px solid rgba(168,85,247,0.20)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 13, color: "white", flexShrink: 0,
                  boxShadow: "0 2px 8px -2px rgba(168,85,247,0.55)",
                }}>{(s.firstName || "?").charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#fce7f3" }}>
                  {s.firstName} {s.lastName}
                  <span style={{ marginLeft: 8, color: "rgba(196,181,253,0.55)", fontWeight: 700, fontSize: 11 }}>
                    {list.length} goal{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={() => addGoal(s.id)}
                  style={{
                    padding: "6px 12px", borderRadius: 999,
                    background: "rgba(168,85,247,0.10)",
                    border: "1px solid rgba(168,85,247,0.30)",
                    color: "#fce7f3", fontWeight: 800, fontSize: 12,
                    cursor: "pointer", touchAction: "manipulation",
                  }}
                >+ Add goal</button>
                <button
                  onClick={() => setOpenId((cur) => cur === s.id ? null : s.id)}
                  style={{
                    padding: "6px 10px", borderRadius: 999,
                    background: "rgba(168,85,247,0.06)",
                    border: "1px solid rgba(168,85,247,0.20)",
                    color: "rgba(196,181,253,0.75)", fontWeight: 800, fontSize: 12,
                    cursor: "pointer", touchAction: "manipulation",
                  }}
                >{openId === s.id ? "Hide" : "Show"}</button>
              </div>

              {expanded && list.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((g) => {
                    const draft = drafts[g.id] ?? {
                      area: g.area || "",
                      goalText: g.goalText,
                      metT: g.metThreshold !== undefined ? String(g.metThreshold) : "",
                      partT: g.partialThreshold !== undefined ? String(g.partialThreshold) : "",
                    };
                    const flash = savedFlash === g.id;
                    return (
                      <div key={g.id} style={{
                        padding: 8, borderRadius: 10,
                        background: flash ? "rgba(34,197,94,0.10)" : "rgba(10,4,20,0.30)",
                        border: flash ? "1px solid rgba(34,197,94,0.45)" : "1px solid rgba(168,85,247,0.15)",
                      }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "180px 1fr auto auto",
                          gap: 6, alignItems: "center",
                        }}>
                          <input
                            value={draft.area}
                            onChange={(e) => setDraft(g.id, { area: e.target.value })}
                            onBlur={() => persistGoal(g.id)}
                            placeholder="Area (e.g. Reading)"
                            style={inp()}
                          />
                          <input
                            value={draft.goalText}
                            onChange={(e) => setDraft(g.id, { goalText: e.target.value })}
                            onBlur={() => persistGoal(g.id)}
                            placeholder="IEP goal text"
                            style={inp()}
                          />
                          <button
                            onClick={() => persistGoal(g.id)}
                            style={{
                              padding: "8px 12px", borderRadius: 8,
                              background: draft.goalText ? "linear-gradient(135deg, #ec4899, #a855f7)" : "rgba(168,85,247,0.06)",
                              border: draft.goalText ? "1px solid rgba(236,72,153,0.55)" : "1px solid rgba(168,85,247,0.20)",
                              color: "white", fontWeight: 800, fontSize: 12,
                              cursor: "pointer", touchAction: "manipulation",
                            }}
                          >{flash ? "✓" : "Save"}</button>
                          <button
                            onClick={() => remove(g.id)}
                            title="Delete"
                            style={{
                              padding: "8px 10px", borderRadius: 8,
                              background: "rgba(239,68,68,0.10)", color: "#fca5a5",
                              border: "1px solid rgba(239,68,68,0.40)",
                              cursor: "pointer", fontSize: 13,
                            }}
                          >🗑</button>
                        </div>
                        {/* Per-goal grading thresholds */}
                        <div style={{
                          marginTop: 6, display: "flex", alignItems: "center",
                          gap: 8, flexWrap: "wrap",
                        }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
                            color: "rgba(196,181,253,0.55)",
                          }}>Grading thresholds</span>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#86efac", fontWeight: 700 }}>
                            ≥
                            <input
                              type="number" min={0} max={100}
                              value={draft.metT}
                              onChange={(e) => setDraft(g.id, { metT: e.target.value })}
                              onBlur={() => persistGoal(g.id)}
                              placeholder={String(defaultMet)}
                              style={{ ...inp(), width: 70, padding: "4px 6px", textAlign: "center" }}
                            />
                            % Met
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#fcd34d", fontWeight: 700 }}>
                            ≥
                            <input
                              type="number" min={0} max={100}
                              value={draft.partT}
                              onChange={(e) => setDraft(g.id, { partT: e.target.value })}
                              onBlur={() => persistGoal(g.id)}
                              placeholder={String(defaultPart)}
                              style={{ ...inp(), width: 70, padding: "4px 6px", textAlign: "center" }}
                            />
                            % Partial
                          </label>
                          <span style={{ fontSize: 11, color: "rgba(196,181,253,0.45)", fontWeight: 600, fontStyle: "italic" }}>
                            blank → uses defaults ({defaultMet}% / {defaultPart}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {expanded && list.length === 0 && (
                <div style={{
                  marginTop: 10, padding: "10px 12px", borderRadius: 8,
                  background: "rgba(168,85,247,0.04)",
                  border: "1px dashed rgba(168,85,247,0.25)",
                  color: "rgba(196,181,253,0.65)", fontSize: 12, fontWeight: 600,
                }}>
                  No goals yet — tap <b style={{ color: "#fce7f3" }}>+ Add goal</b> above.
                </div>
              )}
            </div>
          );
        })}
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
