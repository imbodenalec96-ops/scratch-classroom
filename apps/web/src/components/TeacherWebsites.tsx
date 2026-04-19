import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { useNavigate } from "react-router-dom";
import { Globe, Inbox, Grid3x3, Users, Trash2, ExternalLink, Check, X as XIcon, Clock, ChevronRight, ShieldCheck, ShieldOff } from "lucide-react";
import { LearningAppTile, LearningAppGrid, inferCategoryIcon } from "./LearningAppTile.tsx";

const ICON_PRESETS = ["🌐", "🎮", "📚", "🧮", "✏️", "🎨", "🔬", "⌨️", "💻", "🧠", "🎬", "🎵", "🌍", "🗺️", "🏆", "⚗️"];

type Tab = "pending" | "library" | "grants";

export default function TeacherWebsites() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dk = theme === "dark";

  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [grantsByStudent, setGrantsByStudent] = useState<Record<string, any[]>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Approve-modal state (new library entry from a request OR a fresh add)
  const [approveFor, setApproveFor] = useState<any | null>(null);
  const [approveTitle, setApproveTitle] = useState("");
  const [approveUrl, setApproveUrl] = useState("");
  const [approveCategory, setApproveCategory] = useState("");
  const [approveIconEmoji, setApproveIconEmoji] = useState("");
  const [saving, setSaving] = useState(false);

  // Route guard
  useEffect(() => {
    if (user && user.role !== "teacher" && user.role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const reload = async () => {
    const [p, l, c] = await Promise.all([
      api.getPendingWebsiteRequests().catch(() => null),
      api.getWebsiteLibrary().catch(() => null),
      api.getClasses().catch(() => null),
    ]);
    if (p !== null) setPending(p as any[]);
    if (l !== null) setLibrary(l as any[]);
    if (c !== null) setClasses(c as any[]);
  };

  useEffect(() => {
    reload();
    const iv = setInterval(() => {
      api.getPendingWebsiteRequests().then(p => { if (p) setPending(p as any[]); }).catch(() => {});
    }, 20_000);
    return () => clearInterval(iv);
  }, []);

  // Load students (for grants tab)
  useEffect(() => {
    if (tab !== "grants") return;
    (async () => {
      try {
        const cls = await api.getClasses().catch(() => [] as any[]);
        if (!cls.length) return;
        const map: Record<string, any[]> = {};
        for (const c of cls) {
          try { map[c.id] = await api.getStudents(c.id); } catch { map[c.id] = []; }
        }
        setStudentsByClass(map);
        const first = Object.values(map).flat()[0];
        if (first && !selectedStudentId) setSelectedStudentId(first.id);
      } catch {}
    })();
  }, [tab]);

  // Load grants when a student is selected
  useEffect(() => {
    if (!selectedStudentId) return;
    (async () => {
      try {
        const g = await api.getStudentWebsiteGrants(selectedStudentId);
        setGrantsByStudent((p) => ({ ...p, [selectedStudentId]: g || [] }));
      } catch (e: any) { setErr(e?.message || "Failed to load grants"); }
    })();
  }, [selectedStudentId]);

  const openApprove = (req: any) => {
    setApproveFor(req);
    setApproveTitle(req?.title || "");
    setApproveUrl("");
    setApproveCategory("");
    setApproveIconEmoji("");
    setErr(null);
  };

  const doApprove = async () => {
    const url = approveUrl.trim();
    if (!url) { setErr("URL is required"); return; }
    if (!/^https?:\/\//i.test(url)) { setErr("URL must start with http:// or https://"); return; }
    setSaving(true);
    try {
      const newSite = await api.approveWebsite({
        requestId: approveFor?.id,
        title: approveTitle.trim() || approveFor?.title,
        url,
        category: approveCategory.trim() || undefined,
        iconEmoji: approveIconEmoji || undefined,
      });
      setSaving(false);
      setApproveFor(null);
      if (newSite) setLibrary(prev => [newSite, ...prev.filter(w => w.id !== newSite.id)]);
      if (approveFor?.id) setPending(prev => prev.filter(r => r.id !== approveFor.id));
      setTab("library");
      reload().catch(() => {});
    } catch (e: any) {
      setSaving(false);
      setErr(e?.message || "Failed to approve");
    }
  };

  const doDeny = async (req: any) => {
    if (!confirm(`Deny request "${req.title}"?`)) return;
    try { await api.denyWebsiteRequest(req.id); await reload(); }
    catch (e: any) { setErr(e?.message || "Failed to deny"); }
  };

  const doDelete = async (site: any) => {
    if (!confirm(`Delete "${site.title}" from the library?\nThis also removes it from every student's access.`)) return;
    try { await api.deleteWebsite(site.id); await reload(); }
    catch (e: any) { setErr(e?.message || "Failed to delete"); }
  };

  const doGrant = async (websiteId: string) => {
    if (!selectedStudentId) return;
    try {
      await api.grantWebsite(selectedStudentId, websiteId);
      const g = await api.getStudentWebsiteGrants(selectedStudentId);
      setGrantsByStudent((p) => ({ ...p, [selectedStudentId]: g || [] }));
    } catch (e: any) { setErr(e?.message || "Failed to grant"); }
  };

  const doRevoke = async (websiteId: string) => {
    if (!selectedStudentId) return;
    try {
      await api.revokeWebsite(selectedStudentId, websiteId);
      const g = await api.getStudentWebsiteGrants(selectedStudentId);
      setGrantsByStudent((p) => ({ ...p, [selectedStudentId]: g || [] }));
    } catch (e: any) { setErr(e?.message || "Failed to revoke"); }
  };

  const allStudents = useMemo(() => Object.values(studentsByClass).flat(), [studentsByClass]);
  const selectedStudent = allStudents.find((s) => s.id === selectedStudentId);
  const selectedGrants = selectedStudentId ? (grantsByStudent[selectedStudentId] || []) : [];
  const grantedIds = new Set(selectedGrants.map((g) => g.id));

  const TAB_CFG: { key: Tab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { key: "pending", icon: <Inbox size={14} />, label: "Pending", badge: pending.length || undefined },
    { key: "library", icon: <Grid3x3 size={14} />, label: "Library", badge: library.length || undefined },
    { key: "grants",  icon: <Users size={14} />,    label: "Student Access" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* ── Page header ── */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20 flex-shrink-0">
          <Globe size={19} className="text-white" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-t3 mb-0.5">Learning Apps</div>
          <h1 className="text-2xl font-extrabold text-t1 leading-none">Websites</h1>
        </div>
        <button
          onClick={() => { setApproveFor({}); setApproveTitle(""); setApproveUrl(""); setApproveCategory(""); setErr(null); }}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors cursor-pointer shadow-md shadow-violet-600/30"
        >
          <span className="text-base leading-none">+</span> Add website
        </button>
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 mb-5 p-1 rounded-2xl w-fit"
        style={{ background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)" }}
      >
        {TAB_CFG.map(({ key, icon, label, badge }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                active
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-t3 hover:text-t1 hover:bg-white/5"
              }`}
            >
              {icon}
              <span>{label}</span>
              {badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  active ? "bg-white/20 text-white" : "bg-violet-500/20 text-violet-400"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {err && (
        <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <XIcon size={13} className="flex-shrink-0" />
          {err}
        </div>
      )}

      {/* ── Tab: Pending requests ── */}
      {tab === "pending" && (
        <div className="space-y-2">
          {pending.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
                <Inbox size={24} className="text-t3" />
              </div>
              <p className="text-sm font-semibold text-t2">No pending requests</p>
              <p className="text-xs text-t3 mt-1">Students can request websites from their dashboard.</p>
            </div>
          ) : pending.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border p-4 flex items-center gap-4 transition-colors"
              style={{
                background: dk ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.9)",
                borderColor: dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
              }}
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-base shadow flex-shrink-0">
                {(r.student_name || "?").charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-t1 truncate">{r.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-t3">by</span>
                  <span className="text-xs font-semibold text-t2">{r.student_name}</span>
                  <span className="text-t3 text-xs">·</span>
                  <Clock size={10} className="text-t3 flex-shrink-0" />
                  <span className="text-xs text-t3">{new Date(r.requested_at + "Z").toLocaleString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => doDeny(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors hover:bg-red-500/10"
                  style={{ borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}
                >
                  <XIcon size={12} /> Deny
                </button>
                <button
                  onClick={() => openApprove(r)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors bg-emerald-500/15 hover:bg-emerald-500/25"
                  style={{ color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}
                >
                  <Check size={12} /> Approve + add URL
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Library ── */}
      {tab === "library" && (
        <div>
          {library.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
                <Grid3x3 size={24} className="text-t3" />
              </div>
              <p className="text-sm font-semibold text-t2">Library is empty</p>
              <p className="text-xs text-t3 mt-1">Approve a student request or click "Add website" to get started.</p>
            </div>
          ) : (
            <LearningAppGrid>
              {library.map((w) => (
                <LearningAppTile
                  key={w.id}
                  app={w}
                  dk={dk}
                  asLink={false}
                  onClick={() => window.open(w.url, "_blank", "noopener,noreferrer")}
                  footer={
                    <button
                      onClick={(e) => { e.stopPropagation(); doDelete(w); }}
                      title="Delete from library"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110"
                      style={{
                        background: dk ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.9)",
                        color: "#ef4444",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  }
                />
              ))}
            </LearningAppGrid>
          )}
        </div>
      )}

      {/* ── Tab: Grants (per-student) ── */}
      {tab === "grants" && (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          {/* Student sidebar */}
          <div
            className="rounded-2xl border p-2 max-h-[66vh] overflow-y-auto space-y-0.5"
            style={{
              background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
              borderColor: dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
            }}
          >
            {allStudents.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-xs text-t3">Loading students…</div>
              </div>
            ) : allStudents.map((s) => {
              const active = s.id === selectedStudentId;
              const grantCount = (grantsByStudent[s.id] || []).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    active
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                      : dk
                        ? "text-white/70 hover:bg-white/[0.05] hover:text-white"
                        : "text-gray-700 hover:bg-black/[0.04]"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    active ? "bg-white/20" : "bg-gradient-to-br from-emerald-500 to-teal-600"
                  }`}>
                    {(s.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{s.name}</div>
                    {grantCount > 0 && (
                      <div className={`text-[10px] font-medium ${active ? "text-white/60" : "text-t3"}`}>
                        {grantCount} site{grantCount !== 1 ? "s" : ""} granted
                      </div>
                    )}
                  </div>
                  {active && <ChevronRight size={14} className="flex-shrink-0 opacity-60" />}
                </button>
              );
            })}
          </div>

          {/* Grant panel */}
          <div
            className="rounded-2xl border p-4"
            style={{
              background: dk ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.9)",
              borderColor: dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
            }}
          >
            {selectedStudent ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
                    {(selectedStudent.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-t1">{selectedStudent.name}</div>
                    <div className="text-xs text-t3">{grantedIds.size} of {library.length} sites accessible</div>
                  </div>
                </div>

                {library.length === 0 ? (
                  <p className="text-xs text-t3 py-4 text-center">No websites in the library yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {library.map((w) => {
                      const granted = grantedIds.has(w.id);
                      return (
                        <div
                          key={w.id}
                          className="rounded-xl border p-3 flex items-center gap-3 transition-colors"
                          style={{
                            background: granted
                              ? (dk ? "rgba(52,211,153,0.07)" : "rgba(52,211,153,0.08)")
                              : (dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                            borderColor: granted
                              ? "rgba(52,211,153,0.25)"
                              : (dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"),
                          }}
                        >
                          {/* Site icon */}
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                            style={{ background: "linear-gradient(135deg,#7c3aed,#6366f1)" }}>
                            {w.thumbnail_url
                              ? <img src={w.thumbnail_url} alt="" className="w-full h-full object-cover" />
                              : <Globe size={14} className="text-white" />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-t1 truncate">{w.title}</div>
                            <div className="text-[10px] text-t3 truncate">{w.url}</div>
                          </div>

                          {/* Toggle */}
                          {granted ? (
                            <button
                              onClick={() => doRevoke(w.id)}
                              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-red-500/15 flex-shrink-0"
                              style={{ color: "#f87171" }}
                              title="Revoke access"
                            >
                              <ShieldOff size={12} />
                              <span>Revoke</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => doGrant(w.id)}
                              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-emerald-500/15 flex-shrink-0"
                              style={{ color: "#34d399" }}
                              title="Grant access"
                            >
                              <ShieldCheck size={12} />
                              <span>Grant</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center">
                <Users size={28} className="text-t3 mx-auto mb-3 opacity-40" />
                <p className="text-sm text-t3">Select a student to manage their access</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Approve / Add modal ── */}
      {approveFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => !saving && setApproveFor(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-md w-full shadow-2xl"
            style={{
              background: dk ? "#0d0e22" : "#fff",
              border: `1px solid ${dk ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-extrabold text-t1 leading-tight">
                  {approveFor?.title ? `Approve request` : "Add a website"}
                </h2>
                {approveFor?.title && (
                  <p className="text-xs text-t3 mt-0.5">"{approveFor.title}"</p>
                )}
              </div>
              <button
                onClick={() => setApproveFor(null)}
                disabled={saving}
                className="w-7 h-7 rounded-full flex items-center justify-center text-t3 hover:text-t1 hover:bg-white/5 cursor-pointer flex-shrink-0 mt-0.5"
              >
                <XIcon size={15} />
              </button>
            </div>

            {err && (
              <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <XIcon size={12} className="flex-shrink-0" />{err}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-t3 uppercase tracking-wider mb-1.5">Title</label>
                <input
                  value={approveTitle}
                  onChange={(e) => setApproveTitle(e.target.value)}
                  placeholder="e.g. Poki.com"
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
                    dk
                      ? "bg-white/5 border border-white/10 text-white placeholder-white/25 focus:border-violet-500/60"
                      : "bg-gray-50 border border-gray-200 focus:border-violet-400"
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-t3 uppercase tracking-wider mb-1.5">URL</label>
                <input
                  value={approveUrl}
                  onChange={(e) => setApproveUrl(e.target.value)}
                  placeholder="https://poki.com"
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
                    dk
                      ? "bg-white/5 border border-white/10 text-white placeholder-white/25 focus:border-violet-500/60"
                      : "bg-gray-50 border border-gray-200 focus:border-violet-400"
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-t3 uppercase tracking-wider mb-1.5">Category (optional)</label>
                <input
                  value={approveCategory}
                  onChange={(e) => setApproveCategory(e.target.value)}
                  placeholder="games, math, reading…"
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
                    dk
                      ? "bg-white/5 border border-white/10 text-white placeholder-white/25 focus:border-violet-500/60"
                      : "bg-gray-50 border border-gray-200 focus:border-violet-400"
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-t3 uppercase tracking-wider mb-1.5">
                  Icon — optional, auto-picked from category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_PRESETS.map((ic) => {
                    const active = approveIconEmoji === ic;
                    return (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setApproveIconEmoji(active ? "" : ic)}
                        className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center cursor-pointer transition-all ${
                          active
                            ? "bg-violet-500/30 ring-2 ring-violet-400 scale-110"
                            : dk ? "bg-white/5 hover:bg-white/10 hover:scale-105" : "bg-gray-100 hover:bg-gray-200 hover:scale-105"
                        }`}
                      >
                        {ic}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-t3 mt-2 flex items-center gap-1.5">
                  Preview: <span className="text-base">{approveIconEmoji || inferCategoryIcon(approveCategory)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setApproveFor(null)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-t2 hover:bg-white/5 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={doApprove}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-colors shadow-md shadow-emerald-500/25"
              >
                {saving ? "Saving…" : approveFor?.id ? "Approve + add" : "Add to library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
