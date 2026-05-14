// Pulls every piece of STAR data the user owns and bundles it into a
// single JSON file that a rebuild agent can seed into a fresh database.
// Mirrors the table layout in the build spec so the receiver can map
// each section to an INSERT or upsert without guesswork.
//
// Data sources:
//   - Postgres (Neon) via /api endpoints: star_barcodes, star_submissions,
//     classes, class roster, schedule, store items + transactions, kiosk PINs
//   - Supabase via supabaseSync: behaviors, daily notes, IEP goals + log,
//     groups, custom music, behavior templates
//   - LocalStorage: anything that hasn't been server-synced yet
//
// The bundle includes a README header explaining the schema + a
// generated_at timestamp. Receiver opens the JSON, reads the README,
// generates CREATE TABLE + INSERT SQL for each section.

import { StarStore } from "./storage.ts";
import { api } from "../api.ts";
import { getActiveClassId } from "./boardEvents.ts";

export interface RebuildBundle {
  meta: {
    generated_at: string;
    generated_by: string;
    schema_version: string;
    star_room_teacher: string;
    star_room_class: string | null;
    notes: string[];
  };
  classes: any[];
  class_members: Array<{ class_id: string; user_id: string }>;
  users: any[];                    // students from /auth/students + board data
  star_students: any[];            // STAR-side roster (firstName/lastName/grade/IEP)
  schedule: any[];                 // class_schedule blocks
  specials_rotation: any[];

  // Per-kid points / stars / level / reward state (board-side data)
  // Includes dojo_points, behavior_stars, level (L1-L5), reward_count,
  // mcdonalds_for, avatar_url, avatar_emoji, specials_grade for every kid.
  board_user_data: any[];

  // Assignments + grades (the big payloads)
  star_barcodes: Array<{
    class_id: string;
    barcode: string;
    payload: any;                  // full BcEntry: name, subject, gradeLevel, studentName, questions, lesson, ...
    created_at: string;
  }>;
  star_submissions: Array<{
    class_id: string;
    barcode: string;
    student_id: string;
    student_name: string;
    pct: number;
    letter_grade: string;
    status: string;
    score: number | null;
    max_score: number | null;
    completed_date: string;
    logged_at: string;
  }>;

  // Behaviors
  star_behavior_defs: any[];
  star_behavior_events: any[];
  star_behavior_templates: any[];

  // Notes + IEP
  star_daily_notes: any[];
  star_iep_goals: any[];
  star_iep_log: any[];

  // Roster organization
  star_groups: any[];

  // Misc STAR features
  star_custom_music: any[];
  star_refusal_log: any[];
  star_pass_log: any[];

  // Store
  store_items: any[];
  store_transactions: any[];

  // Per-device cache state (for the rebuild's diagnostics, not for seeding)
  _local_cache_snapshot: {
    bcDB_keys: string[];
    asnTrack_keys: string[];
    storage_usage_kb: number;
  };
}

/** Build the full rebuild bundle. Best-effort — any section that fails
 *  fetches as an empty array with a warning in `meta.notes`. */
export async function buildRebuildBundle(): Promise<RebuildBundle> {
  const notes: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (e: any) {
      notes.push(`Skipped ${label}: ${e?.message || e}`);
      return fallback;
    }
  };

  const classId = getActiveClassId();
  if (!classId) notes.push("No active class id — class-scoped data (barcodes, submissions, schedule) will be empty.");

  // ── Classes + roster ─────────────────────────────────────────
  const classes = await safe("classes",     () => api.getClasses(),                                []);
  const cm = await safe<Array<{ class_id: string; user_id: string }>>("class_members", async () => {
    if (!classId) return [];
    const students = await api.getStudents(classId).catch(() => []);
    return students.map((s: any) => ({ class_id: classId, user_id: s.id }));
  }, []);
  const studentAccounts = await safe("users (auth/students)", () => api.listStudentAccounts(), [] as any[]);
  const boardData = await safe<any>("board data", async () => classId ? await api.getBoardData(classId) : null, null);

  // Per-kid points + stars + level + reward state. These come from
  // board data which joins users + board_user_data. Saving the full
  // shape so the rebuild can seed every grade-adjacent number on day 1.
  const board_user_data: any[] = ((boardData?.students || []) as any[]).map((s) => ({
    user_id: String(s.id),
    name: s.name,
    avatar_url: s.avatar_url || null,
    avatar_emoji: s.avatar_emoji || null,
    specials_grade: s.specials_grade ?? null,
    dojo_points: s.dojo_points ?? 0,
    behavior_stars: s.behavior_stars ?? 0,
    reward_count: s.reward_count ?? 0,
    level: s.level ?? 1,
    mcdonalds_for: s.mcdonalds_for ?? null,
  }));

  // ── Schedule + specials ──────────────────────────────────────
  const schedule = await safe("schedule",         async () => classId ? await api.getClassSchedule(classId) : [], []);
  const specials_rotation: any[] = boardData?.specials || [];

  // ── Server-side STAR data ────────────────────────────────────
  const barcodeRows = await safe<any[]>("star_barcodes", async () => {
    if (!classId) return [];
    // We don't have a "list every barcode" endpoint; rebuild from the
    // server submissions list union'd with the local bcDB so the
    // payloads come through.
    const list: any[] = [];
    const bcDB = StarStore.getBcDB();
    for (const id in bcDB) {
      const t: any = bcDB[id];
      list.push({
        class_id: classId,
        barcode: id,
        payload: {
          id, type: t.type, name: t.name,
          subject: t.subject, gradeLevel: t.gradeLevel,
          studentName: t.studentName, studentId: t.studentId,
          week: t.week, day: t.day, goal: t.goal,
          questions: t.questions || [], lesson: t.lesson,
          createdDate: t.createdDate,
          iepGoalId: t.iepGoalId, iepGoalArea: t.iepGoalArea,
        },
        created_at: t.createdDate || new Date().toISOString(),
      });
    }
    return list;
  }, []);

  const submissions = await safe<any[]>("star_submissions", async () => {
    if (!classId) return [];
    try {
      const r = await api.starSubmissionsList(classId);
      return r?.submissions || [];
    } catch {
      // Fallback to public mirror if authed call fails (kid devices etc.)
      const r = await api.starSubmissionsPublic(classId);
      return r?.submissions || [];
    }
  }, []);

  // ── Supabase-side STAR data ──────────────────────────────────
  // Pull fresh from Supabase via the existing sync module so the
  // bundle reflects the server state, not a stale local copy.
  await safe("supabase fullStarPull", async () => {
    const { fullStarPull } = await import("./supabaseSync.ts");
    await fullStarPull();
    return null;
  }, null);

  const behavior_defs      = StarStore.getBehaviorDefs();
  const behavior_events    = StarStore.getBehaviorLog();
  const behavior_templates = StarStore.getBehaviorTemplates();
  const daily_notes        = Object.values(StarStore.getDailyNotes());
  const iep_goals          = StarStore.getIepGoals();
  const iep_log            = StarStore.getIepLog();
  const groups             = StarStore.getGroups();

  let custom_music: any[] = [];
  try {
    const m = await import("../musicPresets.ts");
    custom_music = m.getCustomMusicPresets();
  } catch {}

  // ── STAR-side per-kid roster (firstName/lastName/grade) ──────
  const star_students = StarStore.getStudents();

  // ── Refusal + pass logs (local) ──────────────────────────────
  const refusal_log: any[] = StarStore.getLog();
  const pass_log:    any[] = StarStore.getPassLog();

  // ── Store (server) ───────────────────────────────────────────
  const store_items = await safe<any[]>("store_items", () => api.getStoreItems() as any, []);
  const store_transactions = await safe<any[]>("store_transactions", async () => {
    if (!classId) return [];
    return await api.getStoreClassTransactions(classId).catch(() => []);
  }, []);

  // ── Local cache snapshot for diagnostics ─────────────────────
  let storage_usage_kb = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      storage_usage_kb += ((k.length + (localStorage.getItem(k) || "").length) * 2) / 1024;
    }
  } catch {}

  return {
    meta: {
      generated_at: new Date().toISOString(),
      generated_by: "STAR /star → Data → 📦 Export everything for rebuild",
      schema_version: "v1-2026-05-14",
      star_room_teacher: "Mr. Alec",
      star_room_class: classes?.[0]?.name || null,
      notes,
    },
    classes,
    class_members: cm,
    users: studentAccounts,
    star_students,
    schedule,
    specials_rotation,
    board_user_data,
    star_barcodes: barcodeRows,
    star_submissions: submissions,
    star_behavior_defs: behavior_defs,
    star_behavior_events: behavior_events,
    star_behavior_templates: behavior_templates,
    star_daily_notes: daily_notes,
    star_iep_goals: iep_goals,
    star_iep_log: iep_log,
    star_groups: groups,
    star_custom_music: custom_music,
    star_refusal_log: refusal_log,
    star_pass_log: pass_log,
    store_items,
    store_transactions,
    _local_cache_snapshot: {
      bcDB_keys: Object.keys(StarStore.getBcDB()),
      asnTrack_keys: Object.keys(StarStore.getAsnTrack()),
      storage_usage_kb: Math.round(storage_usage_kb),
    },
  };
}

/** Trigger a browser download of the bundle as a .json file with a
 *  README block at the very top so a human reader (or an LLM reading
 *  the file) immediately sees what each section is for. */
export async function downloadRebuildBundle(): Promise<{ ok: boolean; bytes: number; error?: string }> {
  try {
    const bundle = await buildRebuildBundle();
    const readme = `\
═══════════════════════════════════════════════════════════════════════════
  STAR / Scratch Classroom — Rebuild Data Bundle
  Generated: ${bundle.meta.generated_at}
  By:        ${bundle.meta.generated_by}
  Schema:    ${bundle.meta.schema_version}
  Teacher:   ${bundle.meta.star_room_teacher}
  Class:     ${bundle.meta.star_room_class || "(none)"}
═══════════════════════════════════════════════════════════════════════════

  WHAT THIS IS:
  A complete dump of the teacher's STAR data — every assignment, every grade,
  every behavior event, every IEP goal, every group, every daily note. Hand
  this to a rebuild agent ("seed the new STAR database from this JSON") and
  it will have everything it needs to recreate the teacher's working state.

  SECTIONS:
    classes               — class records (id, name)
    class_members         — (class_id, user_id) pairs
    users                 — student accounts (id, name, avatar_url)
    star_students         — STAR-side per-kid roster (firstName, grade, IEP notes)
    schedule              — daily block schedule (subject, start_time, end_time)
    specials_rotation     — A-F cycle specials grid
    board_user_data       — per-kid dojo_points, behavior_stars, level (L1-L5),
                            reward_count, mcdonalds_for, avatar_url, avatar_emoji,
                            specials_grade — every number the projector shows

    star_barcodes         — every assignment minted, with full payload
                            (questions, lesson, vocab, etc.)
    star_submissions      — every grade ever saved (1 per kid per assignment)

    star_behavior_defs    — custom behavior definitions (label, emoji, tone, scope)
    star_behavior_events  — every behavior log entry (with ABC fields when reportable)
    star_behavior_templates — reusable snippets for ABC textareas

    star_daily_notes      — per-kid daily narratives
    star_iep_goals        — per-kid IEP goals with met/partial thresholds
    star_iep_log          — daily Met/Partial/Not entries per goal

    star_groups           — group roster (name, emoji, color, members)

    star_custom_music     — teacher-added YouTube tracks
    star_refusal_log      — work + specials refusals
    star_pass_log         — bathroom/water/break pass history

    store_items           — store catalog
    store_transactions    — every spend + adjust

    _local_cache_snapshot — diagnostic only; not for seeding

  HOW TO SEED:
    Each section maps 1:1 to a table in the rebuild spec. Generate INSERT
    statements per section. For tables with PK (class_id, barcode, student_id)
    use UPSERT (ON CONFLICT DO UPDATE) so re-runs are idempotent.

    Suggested SQL skeleton:
      INSERT INTO star_barcodes (class_id, barcode, payload, created_at)
      VALUES (...) ON CONFLICT (class_id, barcode) DO UPDATE SET ...;

    For Supabase tables (star_behavior_*, star_groups, etc.), use the same
    pattern — every table has a single 'id' PK except star_daily_notes which
    is (date, student_id).

  CAVEATS:
    - photo_path fields point to a Supabase Storage bucket that won't exist
      in the new project. Either migrate the bucket or null these out.
    - star_submissions.q_marks is JSONB; preserve as-is.
    - Lesson + question payloads inside star_barcodes are arbitrarily large
      jsonb objects; preserve as-is.

═══════════════════════════════════════════════════════════════════════════
`;
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([readme + "\n" + json], { type: "application/json;charset=utf-8" });
    const filename = `star-rebuild-${bundle.meta.generated_at.slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, bytes: blob.size };
  } catch (e: any) {
    return { ok: false, bytes: 0, error: e?.message || String(e) };
  }
}
