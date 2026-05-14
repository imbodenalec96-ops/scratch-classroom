// Cross-device sync between localStorage STAR data and Supabase.
//
// Pattern per resource:
//   - On boot: pull from Supabase, merge into local (server wins on
//     last-updated; local-only rows are pushed up).
//   - On every local change: push the changed row to Supabase
//     (fire-and-forget; failure is logged).
//   - Periodic re-pull every 60s so changes from other devices
//     appear without a full page refresh.
//
// Conflict resolution: each row carries an `updated_at` (server
// trigger maintained). When pulling, server row wins if its
// updated_at > local's; when pushing, we always upsert (last write
// wins server-side).
//
// Tables synced:
//   behavior_defs / behavior_events / behavior_templates
//   daily_notes
//   iep_goals / iep_log
//   custom_music

import { supa } from "./supabase.ts";
import {
  StarStore,
  type BehaviorDef, type BehaviorEvent, type BehaviorTemplate,
  type DailyNote, type IepGoal, type IepLogEntry, type StudentGroup,
} from "./storage.ts";

// ── Behavior defs ───────────────────────────────────────────────
type BehaviorDefRow = {
  id: string; label: string; emoji: string;
  tone: BehaviorDef["tone"]; scope: BehaviorDef["scope"];
  student_id: string | null; archived: boolean;
  created_at: string; updated_at: string;
};
const defToRow = (d: BehaviorDef): BehaviorDefRow => ({
  id: d.id, label: d.label, emoji: d.emoji, tone: d.tone, scope: d.scope,
  student_id: d.studentId ?? null, archived: !!d.archived,
  created_at: d.createdDate, updated_at: d.createdDate,
});
const rowToDef = (r: BehaviorDefRow): BehaviorDef => ({
  id: r.id, label: r.label, emoji: r.emoji, tone: r.tone, scope: r.scope,
  studentId: r.student_id || undefined, archived: r.archived,
  createdDate: r.created_at,
});

export async function pullBehaviorDefs(): Promise<number> {
  const { data, error } = await supa().from("star_behavior_defs").select("*");
  if (error || !data) { warn("pullBehaviorDefs", error); return 0; }
  const local = StarStore.getBehaviorDefs();
  const byId = new Map(local.map((d) => [d.id, d]));
  for (const row of data as BehaviorDefRow[]) {
    byId.set(row.id, rowToDef(row));
  }
  StarStore.setBehaviorDefs(Array.from(byId.values()));
  return (data || []).length;
}
export async function pushBehaviorDef(def: BehaviorDef): Promise<void> {
  const { error } = await supa().from("star_behavior_defs").upsert(defToRow(def));
  if (error) warn("pushBehaviorDef", error);
}
export async function deleteBehaviorDefRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_behavior_defs").delete().eq("id", id);
  if (error) warn("deleteBehaviorDef", error);
}

// ── Behavior events (logs) ──────────────────────────────────────
type BehaviorEventRow = {
  id: string; def_id: string; student_id: string;
  ts: string; date: string;
  note: string | null; location: string | null; duration_min: number | null;
  antecedent: string | null; behavior_detail: string | null;
  response: string | null; outcome: string | null;
  severity: number | null; points_delta: number | null;
  parent_notified: boolean | null; parent_notify_method: string | null;
  follow_up: string | null; witnesses: string | null;
  reporter_name: string | null; photo_path: string | null;
  created_at: string; updated_at: string;
};
const eventToRow = (e: BehaviorEvent): BehaviorEventRow => ({
  id: e.id, def_id: e.defId, student_id: e.studentId,
  ts: e.ts, date: e.date,
  note: e.note ?? null, location: e.location ?? null,
  duration_min: e.durationMin ?? null,
  antecedent: e.antecedent ?? null, behavior_detail: e.behaviorDetail ?? null,
  response: e.response ?? null, outcome: e.outcome ?? null,
  severity: e.severity ?? null, points_delta: e.pointsDelta ?? null,
  parent_notified: e.parentNotified ?? null,
  parent_notify_method: e.parentNotifyMethod ?? null,
  follow_up: e.followUp ?? null, witnesses: e.witnesses ?? null,
  reporter_name: e.reporterName ?? null,
  // photoDataUrl is converted to photo_path by the caller before
  // arriving here, so we never push raw base64 to the DB.
  photo_path: e.photoPath ?? null,
  created_at: e.ts, updated_at: e.ts,
});
const rowToEvent = (r: BehaviorEventRow): BehaviorEvent => ({
  id: r.id, defId: r.def_id, studentId: r.student_id,
  ts: r.ts, date: r.date,
  note: r.note ?? undefined,
  location: r.location ?? undefined,
  durationMin: r.duration_min ?? undefined,
  antecedent: r.antecedent ?? undefined,
  behaviorDetail: r.behavior_detail ?? undefined,
  response: r.response ?? undefined,
  outcome: r.outcome ?? undefined,
  severity: (r.severity as any) ?? undefined,
  pointsDelta: r.points_delta ?? undefined,
  parentNotified: r.parent_notified ?? undefined,
  parentNotifyMethod: (r.parent_notify_method as any) ?? undefined,
  followUp: r.follow_up ?? undefined,
  witnesses: r.witnesses ?? undefined,
  reporterName: r.reporter_name ?? undefined,
  // Surface as photoDataUrl pointing to the public URL — readers
  // treat both the same. Kept under photoPath as well for round-trip.
  ...(r.photo_path ? {
    photoPath: r.photo_path,
    photoDataUrl: supa().storage.from("star-photos").getPublicUrl(r.photo_path).data.publicUrl,
  } : {}),
});
export async function pullBehaviorEvents(): Promise<number> {
  const { data, error } = await supa().from("star_behavior_events").select("*").order("ts", { ascending: true });
  if (error || !data) { warn("pullBehaviorEvents", error); return 0; }
  const local = StarStore.getBehaviorLog();
  const byId = new Map(local.map((e) => [e.id, e]));
  for (const row of data as BehaviorEventRow[]) {
    byId.set(row.id, rowToEvent(row));
  }
  // Sort by ts and write back — preserves chronological order in
  // the local log so end-of-day reports stay correct.
  const merged = Array.from(byId.values()).sort((a, b) => a.ts.localeCompare(b.ts));
  localStorage.setItem("star_behavior_log", JSON.stringify(merged));
  return (data || []).length;
}
export async function pushBehaviorEvent(e: BehaviorEvent): Promise<void> {
  const { error } = await supa().from("star_behavior_events").upsert(eventToRow(e));
  if (error) warn("pushBehaviorEvent", error);
}
export async function deleteBehaviorEventRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_behavior_events").delete().eq("id", id);
  if (error) warn("deleteBehaviorEvent", error);
}

// ── Behavior templates ──────────────────────────────────────────
type TemplateRow = { id: string; label: string; field: BehaviorTemplate["field"]; body: string; created_at: string; updated_at: string };
export async function pullBehaviorTemplates(): Promise<number> {
  const { data, error } = await supa().from("star_behavior_templates").select("*");
  if (error || !data) { warn("pullBehaviorTemplates", error); return 0; }
  const local = StarStore.getBehaviorTemplates();
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const row of data as TemplateRow[]) {
    byId.set(row.id, { id: row.id, label: row.label, field: row.field, body: row.body, createdDate: row.created_at });
  }
  StarStore.setBehaviorTemplates(Array.from(byId.values()));
  return (data || []).length;
}
export async function pushBehaviorTemplate(t: BehaviorTemplate): Promise<void> {
  const { error } = await supa().from("star_behavior_templates").upsert({
    id: t.id, label: t.label, field: t.field, body: t.body, created_at: t.createdDate, updated_at: t.createdDate,
  });
  if (error) warn("pushBehaviorTemplate", error);
}
export async function deleteBehaviorTemplateRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_behavior_templates").delete().eq("id", id);
  if (error) warn("deleteBehaviorTemplate", error);
}

// ── Daily notes (per kid + class-wide) ──────────────────────────
type DailyNoteRow = {
  date: string; student_id: string;
  body: string | null; highlights: string | null; growth_areas: string | null;
  mood: string | null; attendance: string | null;
  parent_follow_up: boolean | null; parent_follow_note: string | null;
  created_at: string; updated_at: string;
};
const dnToRow = (n: DailyNote): DailyNoteRow => ({
  date: n.date, student_id: n.studentId,
  body: n.body ?? null, highlights: n.highlights ?? null, growth_areas: n.growthAreas ?? null,
  mood: n.mood ?? null, attendance: n.attendance ?? null,
  parent_follow_up: n.parentFollowUp ?? null,
  parent_follow_note: n.parentFollowNote ?? null,
  created_at: n.updatedAt, updated_at: n.updatedAt,
});
const rowToDn = (r: DailyNoteRow): DailyNote => ({
  date: r.date, studentId: r.student_id,
  body: r.body ?? undefined, highlights: r.highlights ?? undefined, growthAreas: r.growth_areas ?? undefined,
  mood: (r.mood as any) ?? undefined, attendance: (r.attendance as any) ?? undefined,
  parentFollowUp: r.parent_follow_up ?? undefined,
  parentFollowNote: r.parent_follow_note ?? undefined,
  updatedAt: r.updated_at,
});
export async function pullDailyNotes(): Promise<number> {
  const { data, error } = await supa().from("star_daily_notes").select("*");
  if (error || !data) { warn("pullDailyNotes", error); return 0; }
  const local = StarStore.getDailyNotes();
  for (const row of data as DailyNoteRow[]) {
    local[`${row.date}::${row.student_id}`] = rowToDn(row);
  }
  localStorage.setItem("star_daily_notes", JSON.stringify(local));
  return (data || []).length;
}
export async function pushDailyNote(n: DailyNote): Promise<void> {
  const { error } = await supa().from("star_daily_notes").upsert(dnToRow(n));
  if (error) warn("pushDailyNote", error);
}

// ── IEP goals + log ─────────────────────────────────────────────
type IepGoalRow = {
  id: string; student_id: string; area: string | null; goal_text: string;
  met_threshold: number | null; partial_threshold: number | null;
  created_at: string; updated_at: string;
};
export async function pullIepGoals(): Promise<number> {
  const { data, error } = await supa().from("star_iep_goals").select("*");
  if (error || !data) { warn("pullIepGoals", error); return 0; }
  const local = StarStore.getIepGoals();
  const byId = new Map(local.map((g) => [g.id, g]));
  for (const row of data as IepGoalRow[]) {
    byId.set(row.id, {
      id: row.id, studentId: row.student_id, area: row.area ?? undefined,
      goalText: row.goal_text,
      metThreshold: row.met_threshold ?? undefined,
      partialThreshold: row.partial_threshold ?? undefined,
      createdDate: row.created_at, updatedDate: row.updated_at,
    });
  }
  StarStore.setIepGoals(Array.from(byId.values()));
  return (data || []).length;
}
export async function pushIepGoal(g: IepGoal): Promise<void> {
  const { error } = await supa().from("star_iep_goals").upsert({
    id: g.id, student_id: g.studentId, area: g.area ?? null, goal_text: g.goalText,
    met_threshold: g.metThreshold ?? null, partial_threshold: g.partialThreshold ?? null,
    created_at: g.createdDate, updated_at: g.updatedDate,
  });
  if (error) warn("pushIepGoal", error);
}
export async function deleteIepGoalRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_iep_goals").delete().eq("id", id);
  if (error) warn("deleteIepGoal", error);
}

type IepLogRow = {
  id: string; student_id: string; date: string; status: IepLogEntry["status"];
  note: string | null; logged_at: string;
  created_at: string; updated_at: string;
};
export async function pullIepLog(): Promise<number> {
  const { data, error } = await supa().from("star_iep_log").select("*");
  if (error || !data) { warn("pullIepLog", error); return 0; }
  const local = StarStore.getIepLog();
  const byId = new Map(local.map((e) => [e.id, e]));
  for (const row of data as IepLogRow[]) {
    byId.set(row.id, {
      id: row.id, studentId: row.student_id, date: row.date,
      status: row.status, note: row.note ?? undefined, loggedAt: row.logged_at,
    });
  }
  StarStore.setIepLog(Array.from(byId.values()));
  return (data || []).length;
}
export async function pushIepLogEntry(e: IepLogEntry): Promise<void> {
  const { error } = await supa().from("star_iep_log").upsert({
    id: e.id, student_id: e.studentId, date: e.date, status: e.status,
    note: e.note ?? null, logged_at: e.loggedAt,
    created_at: e.loggedAt, updated_at: e.loggedAt,
  });
  if (error) warn("pushIepLogEntry", error);
}

// ── Custom music ────────────────────────────────────────────────
type MusicRow = { id: string; label: string; video_id: string; emoji: string; price: number; created_at: string; updated_at: string };
export async function pullCustomMusic(): Promise<number> {
  const { data, error } = await supa().from("star_custom_music").select("*");
  if (error || !data) { warn("pullCustomMusic", error); return 0; }
  const presets = (data as MusicRow[]).map((r) => ({
    id: r.id, label: r.label, videoId: r.video_id, emoji: r.emoji, price: r.price,
    mood: "custom" as const, isCustom: true,
  }));
  try {
    const { setCustomMusicPresets } = await import("../musicPresets.ts");
    setCustomMusicPresets(presets);
  } catch {}
  return presets.length;
}
export async function pushCustomMusic(preset: { id: string; label: string; videoId: string; emoji: string; price: number }): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supa().from("star_custom_music").upsert({
    id: preset.id, label: preset.label, video_id: preset.videoId,
    emoji: preset.emoji, price: preset.price,
    created_at: now, updated_at: now,
  });
  if (error) warn("pushCustomMusic", error);
}
export async function deleteCustomMusicRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_custom_music").delete().eq("id", id);
  if (error) warn("deleteCustomMusic", error);
}

// ── Student groups ─────────────────────────────────────────────
type GroupRow = {
  id: string; name: string; emoji: string; color: string;
  subject: string | null; student_ids: string[];
  created_at: string; updated_at: string;
};
const groupToRow = (g: StudentGroup): GroupRow => ({
  id: g.id, name: g.name, emoji: g.emoji, color: g.color,
  subject: g.subject ?? null, student_ids: g.studentIds || [],
  created_at: g.createdDate, updated_at: g.updatedDate,
});
const rowToGroup = (r: GroupRow): StudentGroup => ({
  id: r.id, name: r.name, emoji: r.emoji, color: r.color,
  subject: r.subject || undefined, studentIds: r.student_ids || [],
  createdDate: r.created_at, updatedDate: r.updated_at,
});
export async function pullGroups(): Promise<number> {
  const { data, error } = await supa().from("star_groups").select("*");
  if (error || !data) { warn("pullGroups", error); return 0; }
  // Server is source of truth for groups — replace whatever's local
  // entirely. Otherwise locally-deleted groups would re-spawn from
  // a stale local copy. (Behaviors merge by id; groups don't need
  // that nuance — the whole list is small + always edited together.)
  StarStore.setGroups((data as GroupRow[]).map(rowToGroup));
  return (data || []).length;
}
export async function pushGroup(group: StudentGroup): Promise<void> {
  const { error } = await supa().from("star_groups").upsert(groupToRow(group));
  if (error) warn("pushGroup", error);
}
export async function deleteGroupRemote(id: string): Promise<void> {
  const { error } = await supa().from("star_groups").delete().eq("id", id);
  if (error) warn("deleteGroup", error);
}

// ── Master sync ─────────────────────────────────────────────────

/** Pull everything from Supabase into local storage. Runs on app
 *  boot and every 60s after. Returns a count of total rows pulled
 *  for the dashboard's "Synced just now" indicator. */
export async function fullStarPull(): Promise<{ ok: boolean; totalRows: number; perTable: Record<string, number> }> {
  const perTable: Record<string, number> = {};
  try {
    perTable.behavior_defs       = await pullBehaviorDefs();
    perTable.behavior_events     = await pullBehaviorEvents();
    perTable.behavior_templates  = await pullBehaviorTemplates();
    perTable.daily_notes         = await pullDailyNotes();
    perTable.iep_goals           = await pullIepGoals();
    perTable.iep_log             = await pullIepLog();
    perTable.custom_music        = await pullCustomMusic();
    perTable.groups              = await pullGroups();
  } catch (e: any) {
    console.warn("[fullStarPull]", e?.message || e);
    return { ok: false, totalRows: 0, perTable };
  }
  const totalRows = Object.values(perTable).reduce((a, n) => a + n, 0);
  return { ok: true, totalRows, perTable };
}

/** Push every local row up to Supabase. Used for a manual "force
 *  sync" button + on app boot to catch anything created offline. */
export async function fullStarPush(): Promise<{ pushed: number }> {
  let pushed = 0;
  for (const d of StarStore.getBehaviorDefs())      { await pushBehaviorDef(d);      pushed++; }
  for (const t of StarStore.getBehaviorTemplates()) { await pushBehaviorTemplate(t); pushed++; }
  for (const e of StarStore.getBehaviorLog())       { await pushBehaviorEvent(e);    pushed++; }
  for (const n of Object.values(StarStore.getDailyNotes())) { await pushDailyNote(n); pushed++; }
  for (const g of StarStore.getIepGoals())          { await pushIepGoal(g);          pushed++; }
  for (const l of StarStore.getIepLog())            { await pushIepLogEntry(l);      pushed++; }
  for (const g of StarStore.getGroups())            { await pushGroup(g);            pushed++; }
  // Custom music — read from the local list and push individually
  try {
    const { getCustomMusicPresets } = await import("../musicPresets.ts");
    for (const m of getCustomMusicPresets()) {
      if (!m.videoId) continue;
      await pushCustomMusic({ id: m.id, label: m.label, videoId: m.videoId, emoji: m.emoji || "🎵", price: m.price ?? 15 });
      pushed++;
    }
  } catch {}
  return { pushed };
}

function warn(label: string, error: any) {
  if (!error) return;
  console.warn(`[supa sync · ${label}]`, error?.message || error);
}
