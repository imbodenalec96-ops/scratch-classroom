import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Minus, Trophy, ShoppingBag, Trash2, Save,
  Users, Sparkles, Loader2, Package,
} from "lucide-react";
import { api } from "../lib/api.ts";

// Teacher/admin classroom-store panel.
//
// Top: per-student ClassDojo-style points (users.dojo_points) with quick
// +1 / +5 / −1 buttons and a whole-class bump. Polls every 10s so teachers
// can collaborate.
//
// Bottom: store catalog editor (items teachers sell) and recent class-wide
// transaction log.

interface PointRow {
  id: string;
  name: string;
  avatar_emoji: string | null;
  dojo_points: number;
}
interface StoreItem {
  id: string;
  name: string;
  emoji: string | null;
  price: number;
  stock: number | null;
  enabled: number;
}
interface TxRow {
  id: string;
  student_id: string;
  student_name: string | null;
  item_name: string;
  price: number;
  kind: "redeem" | "adjust";
  delta: number;
  created_at: string;
}

const CARD_BG = "rgba(255,255,255,0.02)";
const CARD_BORDER = "rgba(255,255,255,0.07)";
const VIOLET_BG = "rgba(124,58,237,0.2)";
const VIOLET = "#a78bfa";

export default function TeacherStore() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [points, setPoints] = useState<PointRow[]>([]);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [tx, setTx] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // New-item draft
  const [draft, setDraft] = useState<{ name: string; emoji: string; price: string; stock: string }>({
    name: "", emoji: "", price: "10", stock: "",
  });
  const [creating, setCreating] = useState(false);

  const showFlash = (text: string) => {
    setFlash(text);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2200);
  };

  useEffect(() => {
    api.getClasses().then((cs: any[]) => {
      setClasses(cs || []);
      if ((cs || []).length && !classId) setClassId(cs[0].id);
    }).catch(() => {});
  }, []);

  const loadAll = async (showSpinner = false) => {
    if (!classId) return;
    if (showSpinner) setLoading(true);
    try {
      const [p, it, t] = await Promise.all([
        api.getClassPoints(classId).catch(() => [] as PointRow[]),
        api.getStoreItems().catch(() => [] as StoreItem[]),
        api.getStoreClassTransactions(classId).catch(() => [] as TxRow[]),
      ]);
      setPoints(p || []);
      setItems(it || []);
      setTx(t || []);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (!classId) return;
    loadAll(true);
    const iv = setInterval(() => loadAll(false), 10_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // ── Points actions ─────────────────────────────────────────────────────

  const bumpStudent = async (s: PointRow, delta: number) => {
    // Optimistic
    const before = points;
    setPoints(ps => ps.map(x => x.id === s.id ? { ...x, dojo_points: Math.max(0, x.dojo_points + delta) } : x));
    try {
      const r = await api.adjustStudentPoints(s.id, delta);
      setPoints(ps => ps.map(x => x.id === s.id ? { ...x, dojo_points: r.dojo_points } : x));
      showFlash(`${delta > 0 ? "+" : ""}${delta} to ${s.name}`);
      // Refresh transaction log in background so it shows the new row.
      api.getStoreClassTransactions(classId).then(setTx).catch(() => {});
    } catch {
      setPoints(before);
      showFlash(`Could not update ${s.name}`);
    }
  };

  const customBump = async (s: PointRow, raw: string) => {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n === 0) return;
    await bumpStudent(s, n);
  };

  const wholeClass = async (delta: number) => {
    if (!classId || bulkBusy) return;
    setBulkBusy(true);
    try {
      const r = await api.adjustClassPoints(classId, delta);
      showFlash(`${delta > 0 ? "+" : ""}${delta} to ${r.updated} students`);
      await loadAll(false);
    } catch {
      showFlash("Whole-class adjust failed");
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Store items ────────────────────────────────────────────────────────

  const patchItem = async (it: StoreItem, patch: Partial<StoreItem>) => {
    setSaving(it.id);
    const before = items;
    setItems(list => list.map(x => x.id === it.id ? { ...x, ...patch } : x));
    try {
      const body: any = { ...patch };
      if ("enabled" in body) body.enabled = !!body.enabled;
      await api.updateStoreItem(it.id, body);
    } catch {
      setItems(before);
      showFlash("Save failed");
    } finally {
      setSaving(null);
    }
  };

  const createItem = async () => {
    const name = draft.name.trim();
    if (!name) { showFlash("Name required"); return; }
    const price = Math.max(0, Math.trunc(Number(draft.price || "10")));
    const stockRaw = draft.stock.trim();
    const stock = stockRaw === "" ? null : Math.max(0, Math.trunc(Number(stockRaw)));
    setCreating(true);
    try {
      const row = await api.createStoreItem({ name, emoji: draft.emoji.trim() || undefined, price, stock });
      setItems(list => [...list, row]);
      setDraft({ name: "", emoji: "", price: "10", stock: "" });
      showFlash(`Added ${name}`);
    } catch {
      showFlash("Could not add item");
    } finally {
      setCreating(false);
    }
  };

  const removeItem = async (it: StoreItem) => {
    if (!window.confirm(`Delete ${it.name}? This can't be undone.`)) return;
    const before = items;
    setItems(list => list.filter(x => x.id !== it.id));
    try {
      await api.deleteStoreItem(it.id);
      showFlash(`Removed ${it.name}`);
    } catch {
      setItems(before);
      showFlash("Delete failed");
    }
  };

  const totalPts = useMemo(() => points.reduce((a, s) => a + (s.dojo_points || 0), 0), [points]);
  const topEarner = useMemo(
    () => points.slice().sort((a, b) => (b.dojo_points || 0) - (a.dojo_points || 0))[0],
    [points],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto pb-16 animate-page-enter" style={{ color: "var(--t1)" }}>
      {/* Flash */}
      {flash && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "white",
            boxShadow: "0 0 40px rgba(124,58,237,0.4)",
          }}
        >
          {flash}
        </div>
      )}

      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--t3)" }}>Teacher Settings</div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--t1)" }}>
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: VIOLET_BG }}>
              <ShoppingBag size={16} style={{ color: VIOLET }} />
            </span>
            Store &amp; Points
          </h1>
          <p className="text-sm mt-1.5 max-w-xl" style={{ color: "var(--t3)" }}>
            Give or take ClassDojo-style points, and manage the classroom store students spend them in.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {classes.length > 1 && (
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="input text-sm"
              style={{ minWidth: 180 }}
            >
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            🪙 {totalPts} total
          </div>
          {topEarner && (
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: "rgba(16,185,129,0.08)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)" }}
            >
              <Trophy size={12} /> {topEarner.name}: {topEarner.dojo_points}
            </div>
          )}
        </div>
      </header>

      {/* ── POINTS SECTION ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-5 mb-6"
        style={{ background: CARD_BG, borderColor: CARD_BORDER }}
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.15)" }}>
            <Sparkles size={14} style={{ color: "#fbbf24" }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Points</h2>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.12)", color: VIOLET }}>
            auto-refresh every 10s
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => wholeClass(1)}
              disabled={bulkBusy || !classId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))",
                border: "1px solid rgba(16,185,129,0.35)",
                color: "#34d399",
              }}
            >
              <Users size={12} /> Whole class +1
            </button>
            <button
              onClick={() => wholeClass(5)}
              disabled={bulkBusy || !classId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.15))",
                border: "1px solid rgba(16,185,129,0.45)",
                color: "#34d399",
              }}
            >
              <Users size={12} /> Whole class +5
            </button>
            <button
              onClick={() => wholeClass(-1)}
              disabled={bulkBusy || !classId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
              }}
            >
              <Minus size={12} /> Whole class −1
            </button>
          </div>
        </div>

        {loading && points.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm" style={{ color: "var(--t3)" }}>
            <Loader2 className="animate-spin mr-2" size={16} /> Loading class…
          </div>
        ) : points.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>
            No students in this class yet.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {points.map(s => (
              <StudentPointCard key={s.id} student={s} onBump={bumpStudent} onCustom={customBump} />
            ))}
          </div>
        )}
      </section>

      {/* ── STORE ITEMS SECTION ────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-5 mb-6"
        style={{ background: CARD_BG, borderColor: CARD_BORDER }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: VIOLET_BG }}>
            <Package size={14} style={{ color: VIOLET }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Store items</h2>
          <span className="ml-auto text-[11px]" style={{ color: "var(--t3)" }}>
            {items.filter(i => i.enabled).length} active · {items.length} total
          </span>
        </div>

        {/* New-item row */}
        <div className="grid grid-cols-1 md:grid-cols-[60px_1fr_100px_100px_auto] gap-2 items-center mb-5 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}>
          <input
            value={draft.emoji}
            onChange={e => setDraft(d => ({ ...d, emoji: e.target.value }))}
            placeholder="🎁"
            maxLength={4}
            className="input text-center text-lg"
          />
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="New item name (e.g. Sit at teacher's desk)"
            className="input text-sm"
          />
          <input
            value={draft.price}
            onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
            placeholder="Price"
            type="number"
            min={0}
            className="input text-sm"
          />
          <input
            value={draft.stock}
            onChange={e => setDraft(d => ({ ...d, stock: e.target.value }))}
            placeholder="Stock (∞)"
            type="number"
            min={0}
            className="input text-sm"
          />
          <button
            onClick={createItem}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "white",
              boxShadow: "0 2px 12px rgba(124,58,237,0.25)",
            }}
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add item
          </button>
        </div>

        {/* Item list */}
        {items.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: "var(--t3)" }}>
            No items yet. Add the first one above.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it => (
              <StoreItemRow
                key={it.id}
                item={it}
                saving={saving === it.id}
                onPatch={(patch) => patchItem(it, patch)}
                onDelete={() => removeItem(it)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── TRANSACTION LOG ────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border p-5"
        style={{ background: CARD_BG, borderColor: CARD_BORDER }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.12)" }}>
            <Trophy size={14} style={{ color: "#34d399" }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Recent activity</h2>
          <span className="ml-auto text-[11px]" style={{ color: "var(--t3)" }}>last 200 events</span>
        </div>
        {tx.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: "var(--t3)" }}>
            No transactions yet.
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto pr-1">
            {tx.slice(0, 60).map((t, i) => {
              const amt = t.kind === "redeem" ? -t.price : t.delta;
              const positive = amt >= 0;
              return (
                <div key={t.id}
                  className="flex items-center gap-3 py-2"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}
                >
                  <div className="text-lg">{t.kind === "redeem" ? "🛍️" : positive ? "➕" : "➖"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: "var(--t1)" }}>
                      {t.student_name || "Student"}
                      <span className="font-normal opacity-70"> · {t.item_name}</span>
                    </div>
                    <div className="text-[10px] opacity-60">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`text-xs font-bold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                    {positive ? "+" : ""}{amt}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

function StudentPointCard({
  student,
  onBump,
  onCustom,
}: {
  student: PointRow;
  onBump: (s: PointRow, delta: number) => void | Promise<void>;
  onCustom: (s: PointRow, raw: string) => void | Promise<void>;
}) {
  const [custom, setCustom] = useState("");
  const submitCustom = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!custom.trim()) return;
    onCustom(student, custom);
    setCustom("");
  };
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.35), rgba(99,102,241,0.2))" }}
        >
          {student.avatar_emoji || (student.name || "?")[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: "var(--t1)" }}>{student.name}</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>ClassDojo-style points</div>
        </div>
        <div
          className="px-2.5 py-1 rounded-lg font-bold tabular-nums text-sm flex items-center gap-1"
          style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          🪙 {student.dojo_points}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onBump(student, 1)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}
        >
          <Plus size={11} /> 1
        </button>
        <button
          onClick={() => onBump(student, 5)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}
        >
          <Plus size={11} /> 5
        </button>
        <button
          onClick={() => onBump(student, -1)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          <Minus size={11} /> 1
        </button>
      </div>
      <form onSubmit={submitCustom} className="flex items-center gap-1.5">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="custom ±"
          type="number"
          className="input text-xs flex-1"
          style={{ padding: "6px 8px" }}
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "white",
          }}
        >
          Apply
        </button>
      </form>
    </div>
  );
}

function StoreItemRow({
  item,
  saving,
  onPatch,
  onDelete,
}: {
  item: StoreItem;
  saving: boolean;
  onPatch: (patch: Partial<StoreItem>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState<{ name: string; emoji: string; price: string; stock: string }>({
    name: item.name,
    emoji: item.emoji || "",
    price: String(item.price),
    stock: item.stock == null ? "" : String(item.stock),
  });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setLocal({
      name: item.name,
      emoji: item.emoji || "",
      price: String(item.price),
      stock: item.stock == null ? "" : String(item.stock),
    });
    setDirty(false);
  }, [item.id, item.name, item.emoji, item.price, item.stock]);

  const onField = (k: keyof typeof local, v: string) => { setLocal(x => ({ ...x, [k]: v })); setDirty(true); };
  const save = () => {
    const price = Math.max(0, Math.trunc(Number(local.price || 0)));
    const stock = local.stock.trim() === "" ? null : Math.max(0, Math.trunc(Number(local.stock)));
    onPatch({ name: local.name, emoji: local.emoji, price, stock });
    setDirty(false);
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[60px_1fr_100px_100px_auto_auto] gap-2 items-center p-2.5 rounded-xl"
      style={{
        background: item.enabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)",
        border: "1px solid rgba(255,255,255,0.06)",
        opacity: item.enabled ? 1 : 0.6,
      }}
    >
      <input
        value={local.emoji}
        onChange={e => onField("emoji", e.target.value)}
        maxLength={4}
        className="input text-center text-lg"
      />
      <input
        value={local.name}
        onChange={e => onField("name", e.target.value)}
        className="input text-sm"
      />
      <input
        value={local.price}
        onChange={e => onField("price", e.target.value)}
        type="number"
        min={0}
        className="input text-sm"
        placeholder="pts"
      />
      <input
        value={local.stock}
        onChange={e => onField("stock", e.target.value)}
        type="number"
        min={0}
        className="input text-sm"
        placeholder="∞"
      />
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPatch({ enabled: !item.enabled as any })}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all"
          style={{
            background: item.enabled ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)",
            border: `1px solid ${item.enabled ? "rgba(16,185,129,0.35)" : "rgba(148,163,184,0.3)"}`,
            color: item.enabled ? "#34d399" : "#94a3b8",
          }}
          title={item.enabled ? "Enabled — click to hide" : "Hidden — click to enable"}
        >
          {item.enabled ? "Live" : "Hidden"}
        </button>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "white",
            }}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          </button>
        )}
      </div>
      <button
        onClick={onDelete}
        className="px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
        title="Delete item"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
