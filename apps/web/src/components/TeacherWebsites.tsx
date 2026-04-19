import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { useNavigate } from "react-router-dom";
import { Globe, Inbox, Grid3x3, Users, Trash2, ExternalLink, Check, X as XIcon } from "lucide-react";
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
    try {
      const [p, l, c] = await Promise.all([
        api.getPendingWebsiteRequests().catch(() => []),
        api.getWebsiteLibrary().catch(() => []),
        api.getClasses().catch(() => []),
      ]);
      setPending(p || []);
      setLibrary(l || []);
      setClasses(c || []);
    } catch (e: any) { setErr(e?.message || "Failed to load"); }
  };

  useEffect(() => {
    reload();
    // Poll for new student requests every 20s so Alec sees them without refreshing
    const iv = setInterval(() => {
      api.getPendingWebsiteRequests().then(p => { if (p) setPending(p as any[]); }).catch(() => {});
    }, 20_000);
    return () => clearInterval(iv);
  }, []);

  // Load students (for grants tab) — fetch classes fresh each time, don't depend on state timing
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
      // Close immediately — don't block on reload()
      setSaving(false);
      setApproveFor(null);
      // Optimistically add to library so it shows instantly
      if (newSite) setLibrary(prev => [newSite, ...prev.filter(w => w.id !== newSite.id)]);
      if (approveFor?.id) setPending(prev => prev.filter(r => r.id !== approveFor.id));
      setTab("library");
      // Reload in background to sync full state
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

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
          <Globe size={18} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-t3">Learning Apps</div>
          <h1 className="text-2xl font-extrabold text-t1">Websites</h1>
        </div>
        <button
          onClick={() => { setApproveFor({}); setApproveTitle(""); setApproveUrl(""); setApproveCategory(""); setErr(null); }}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer shadow-md shadow-violet-600/30"
        >
          + Add website
        </button>
      </div>

      <div className="flex gap-2 mt-4 mb-5 border-b" style={{ borderColor: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
        {([
          ["pending", <Inbox size={14} key="p" />, `Pending (${pending.length})`],
          ["library", <Grid3x3 size={14} key="l" />, `Library (${library.length})`],
          ["grants", <Users size={14} key="g" />, `Student Grants`],
        ] as const).map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer border-b-2
              ${tab === key ? "border-violet-500 text-violet-400" : "border-transparent text-t3 hover:text-t2"}`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</div>
      )}

      {/* ── Tab: Pending requests ── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-t3 py-8 text-center">No pending website requests. 🎉</p>
          )}
          {pending.map((r) => (
            <div key={r.id} className={`rounded-2xl border p-4 flex items-center gap-3 ${dk ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"}`}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-bold shadow-md flex-shrink-0">
                {(r.student_name || "?").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-t1 truncate">{r.title}</div>
                <div className="text-xs text-t3">Requested by {r.student_name} · {new Date(r.requested_at + "Z").toLocaleString()}</div>
              </div>
              <button
                onClick={() => openApprove(r)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
              >
                <Check size={12} className="inline mr-1" /> Approve + add URL
              </button>
              <button
                onClick={() => doDeny(r)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/40 text-red-400 hover:bg-red-500/10 cursor-pointer"
              >
                <XIcon size={12} className="inline mr-1" /> Deny
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Library ── */}
      {tab === "library" && (
        <div>
          {library.length === 0 ? (
            <p className="text-sm text-t3 py-8 text-center">No websites in the library yet. Approve a request or click "Add website".</p>
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
                      title="Delete"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors"
                      style={{
                        background: dk ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.85)",
                        color: "#ef4444",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
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
        <div className="grid grid-cols-[260px_1fr] gap-5">
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {allStudents.length === 0 ? (
              <p className="text-xs text-t3 py-4">Loading students…</p>
            ) : allStudents.map((s) => {
              const active = s.id === selectedStudentId;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                    active ? "border-violet-500 bg-violet-500/15 text-violet-100"
                    : dk ? "border-white/5 bg-white/[0.02] text-white/70 hover:bg-white/[0.06]"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-bold">
                    {(s.name || "?").charAt(0)}
                  </div>
                  <div className="text-sm font-semibold truncate">{s.name}</div>
                </button>
              );
            })}
          </div>

          <div>
            {selectedStudent ? (
              <>
                <h3 className="text-sm font-bold text-t1 mb-2">{selectedStudent.name}'s websites</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {library.length === 0 ? (
                    <p className="text-xs text-t3">No websites in the library.</p>
                  ) : library.map((w) => {
                    const granted = grantedIds.has(w.id);
                    return (
                      <div
                        key={w.id}
                        className={`rounded-xl border p-3 flex items-center gap-2 ${
                          granted ? "border-emerald-500/40 bg-emerald-500/5"
                          : dk ? "border-white/5 bg-white/[0.02]" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 overflow-hidden">
                          {w.thumbnail_url ? <img src={w.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <Globe size={13} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-t1 truncate">{w.title}</div>
                          <div className="text-[10px] text-t3 truncate">{w.url}</div>
                        </div>
                        {granted ? (
                          <button onClick={() => doRevoke(w.id)} className="text-xs font-bold text-red-400 hover:bg-red-500/10 px-2 py-1 rounded cursor-pointer">
                            Revoke
                          </button>
                        ) : (
                          <button onClick={() => doGrant(w.id)} className="text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 px-2 py-1 rounded cursor-pointer">
                            Grant
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : <p className="text-sm text-t3">Pick a student.</p>}
          </div>
        </div>
      )}

      {/* ── Approve / Add modal ── */}
      {approveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setApproveFor(null)}>
          <div
            className={`rounded-2xl p-5 max-w-md w-full ${dk ? "bg-[#0a0b20] border border-white/10" : "bg-white"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-t1 mb-3">
              {approveFor?.title ? `Approve: "${approveFor.title}"` : "Add a website"}
            </h2>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-t3 uppercase tracking-wider">Title</label>
              <input
                value={approveTitle}
                onChange={(e) => setApproveTitle(e.target.value)}
                placeholder="e.g. Poki.com"
                className={`w-full rounded-xl px-3 py-2 text-sm ${dk ? "bg-white/5 border border-white/10 text-white" : "bg-gray-50 border border-gray-200"}`}
              />
              <label className="block text-xs font-bold text-t3 uppercase tracking-wider mt-2">URL</label>
              <input
                value={approveUrl}
                onChange={(e) => setApproveUrl(e.target.value)}
                placeholder="https://poki.com"
                className={`w-full rounded-xl px-3 py-2 text-sm ${dk ? "bg-white/5 border border-white/10 text-white" : "bg-gray-50 border border-gray-200"}`}
              />
              <label className="block text-xs font-bold text-t3 uppercase tracking-wider mt-2">Category (optional)</label>
              <input
                value={approveCategory}
                onChange={(e) => setApproveCategory(e.target.value)}
                placeholder="games, math, reading…"
                className={`w-full rounded-xl px-3 py-2 text-sm ${dk ? "bg-white/5 border border-white/10 text-white" : "bg-gray-50 border border-gray-200"}`}
              />
              <label className="block text-xs font-bold text-t3 uppercase tracking-wider mt-2">Icon (optional — otherwise picked from category)</label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_PRESETS.map((ic) => {
                  const active = approveIconEmoji === ic;
                  return (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setApproveIconEmoji(active ? "" : ic)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center cursor-pointer transition-colors ${
                        active
                          ? "bg-violet-500/30 ring-2 ring-violet-400"
                          : dk ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      {ic}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-t3 mt-1">
                Preview: <span className="text-base">{approveIconEmoji || inferCategoryIcon(approveCategory)}</span>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setApproveFor(null)} disabled={saving} className="px-3 py-2 rounded-xl text-sm font-bold text-t2 hover:bg-white/5 cursor-pointer">Cancel</button>
              <button onClick={doApprove} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer">
                {saving ? "Saving…" : approveFor?.id ? "Approve + add" : "Add to library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
