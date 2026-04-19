import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Coins, Trophy, Loader2 } from "lucide-react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

// ClassDojo-style classroom store. Students spend `users.dojo_points`
// (teacher-awarded) on catalog items the teacher has configured.
//
// Balance chip reads the same endpoint the StudentDashboard uses
// (api.getMyBalance) so the numbers stay in sync.

interface StoreItem {
  id: string;
  name: string;
  emoji: string | null;
  price: number;
  stock: number | null;  // null = unlimited
  enabled: number;
}

interface TxRow {
  id: string;
  item_name: string;
  price: number;
  kind: "redeem" | "adjust";
  delta: number;
  created_at: string;
}

export function CashoutPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [tx, setTx] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    try {
      const [its, bal, txs] = await Promise.all([
        api.getStoreItems().catch(() => [] as StoreItem[]),
        api.getMyBalance().catch(() => ({ dojo_points: 0 })),
        api.getStoreTransactions().catch(() => [] as TxRow[]),
      ]);
      setItems(its || []);
      setBalance(bal?.dojo_points ?? 0);
      setTx(txs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 2500);
  };

  const redeem = async (it: StoreItem) => {
    if (busy) return;
    if (balance < it.price) {
      showFlash("err", `You need ${it.price - balance} more pts for ${it.name}`);
      return;
    }
    if (it.stock != null && it.stock <= 0) {
      showFlash("err", `${it.name} is out of stock`);
      return;
    }
    setBusy(it.id);
    try {
      const r = await api.redeemStoreItem(it.id);
      setBalance(r.dojo_points);
      showFlash("ok", `Got ${it.name}! Show your teacher.`);
      // refresh catalog + tx log in background
      load();
    } catch (e: any) {
      showFlash("err", e?.message || "Could not redeem");
    } finally {
      setBusy(null);
    }
  };

  const affordable = useMemo(() => items.filter(i => i.price <= balance).length, [items, balance]);

  return (
    <div className="min-h-[80vh] px-4 py-10 max-w-3xl mx-auto">
      {/* Flash toast */}
      {flash && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm"
          style={{
            background: flash.kind === "ok"
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "linear-gradient(135deg, #ef4444, #b91c1c)",
            color: "white",
            boxShadow: flash.kind === "ok" ? "0 0 40px rgba(16,185,129,0.4)" : "0 0 40px rgba(239,68,68,0.4)",
          }}
        >
          {flash.text}
        </div>
      )}

      {/* Header + balance */}
      <header className="text-center mb-8">
        <div className="text-5xl mb-3" aria-hidden>💰</div>
        <h1 className="text-3xl font-extrabold mb-1 text-t1">Classroom Store</h1>
        <p className="text-sm text-t3 mb-5">Spend the points your teacher has given you.</p>
        <div
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-base"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.1))",
            border: "1px solid rgba(245,158,11,0.4)",
            color: "#fbbf24",
            boxShadow: "0 4px 20px rgba(245,158,11,0.15)",
          }}
        >
          <span style={{ fontSize: 20 }}>🪙</span>
          <span className="tabular-nums">{balance}</span>
          <span className="text-sm font-semibold opacity-80">points</span>
        </div>
        {!loading && (
          <div className="text-xs text-t3 mt-2">
            {affordable > 0
              ? <>You can afford <b>{affordable}</b> thing{affordable === 1 ? "" : "s"} right now.</>
              : "Earn more points to start shopping!"}
          </div>
        )}
      </header>

      {/* Items grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-t3">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading store…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed" style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--t3)" }}>
          <ShoppingBag className="mx-auto mb-3" size={28} />
          <div className="font-bold text-t2 text-sm mb-1">The store is empty</div>
          <div className="text-xs">Your teacher hasn't added any items yet.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {items.map(it => {
            const canAfford = balance >= it.price;
            const outOfStock = it.stock != null && it.stock <= 0;
            const disabled = !canAfford || outOfStock || busy === it.id;
            return (
              <button
                key={it.id}
                onClick={() => redeem(it)}
                disabled={disabled}
                className="rounded-2xl p-4 text-center transition-all border"
                style={{
                  background: canAfford && !outOfStock
                    ? "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.1))"
                    : "rgba(255,255,255,0.03)",
                  borderColor: canAfford && !outOfStock ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)",
                  opacity: disabled ? 0.55 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                  color: "var(--t1)",
                }}
                onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }}>{it.emoji || "🎁"}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{it.name}</div>
                <div className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: canAfford ? "#fbbf24" : "var(--t3)" }}>
                  🪙 <span className="tabular-nums">{it.price}</span> pts
                </div>
                {it.stock != null && (
                  <div className="text-[10px] mt-1.5" style={{ color: outOfStock ? "#f87171" : "var(--t3)" }}>
                    {outOfStock ? "Out of stock" : `${it.stock} left`}
                  </div>
                )}
                {busy === it.id && (
                  <div className="text-[10px] mt-1 flex items-center justify-center gap-1 text-violet-300">
                    <Loader2 className="animate-spin" size={10} /> Redeeming…
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Transaction log */}
      {tx.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-widest text-t3">
            <Trophy size={14} /> Your history
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
            {tx.slice(0, 15).map((t, i) => {
              const isRedeem = t.kind === "redeem";
              const amount = isRedeem ? -t.price : t.delta;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="text-xl">{isRedeem ? "🛍️" : amount >= 0 ? "➕" : "➖"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-t1 truncate">{t.item_name}</div>
                    <div className="text-[11px] text-t3">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {amount >= 0 ? "+" : ""}{amount}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="text-center mt-10">
        <Link to="/student" className="text-sm font-semibold text-violet-400 hover:text-violet-300">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default CashoutPage;

// Small balance chip reused by the StudentDashboard. Fetches the same endpoint
// so both widgets stay in sync.
export function PointsChip() {
  const [pts, setPts] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => api.getMyBalance()
      .then(d => { if (!cancelled) setPts(d?.dojo_points ?? 0); })
      .catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  if (pts == null) return null;
  return (
    <Link
      to="/cashout"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        background: "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(217,119,6,0.1))",
        border: "1px solid rgba(245,158,11,0.35)",
        color: "#fbbf24",
        fontWeight: 800,
        fontSize: 12,
        textDecoration: "none",
        boxShadow: "0 1px 8px rgba(245,158,11,0.12)",
      }}
      title="Classroom store"
    >
      <Coins size={13} />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{pts}</span>
      <span style={{ opacity: 0.85, fontWeight: 700 }}>pts</span>
    </Link>
  );
}
