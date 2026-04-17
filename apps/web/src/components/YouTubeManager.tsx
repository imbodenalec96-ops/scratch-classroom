import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import {
  Youtube, ChevronLeft, Plus, Check, X, Library, Clock,
  CheckCircle2, XCircle, Trash2, Play, Film,
} from "lucide-react";

type Tab = "pending" | "approved" | "denied" | "library";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function YouTubeManager() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [tab, setTab] = useState<Tab>("library");
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [pending, setPending] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [denied, setDenied] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Add video form state
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Educational");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getClasses().then(c => {
      setClasses(c);
      if (c.length > 0 && !selectedClassId) setSelectedClassId(c[0].id);
    }).catch(console.error);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, d] = await Promise.all([
        api.getYouTubeRequests("pending").catch(() => []),
        api.getYouTubeRequests("approved").catch(() => []),
        api.getYouTubeRequests("denied").catch(() => []),
      ]);
      setPending(p); setApproved(a); setDenied(d);
      if (selectedClassId) {
        const lib = await api.getYouTubeLibrary(selectedClassId).catch(() => []);
        setLibrary(lib);
      }
    } finally { setLoading(false); }
  }, [selectedClassId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleApprove = async (r: any) => {
    const url = (urlInputs[r.id] || "").trim();
    if (!url) { alert("Paste a YouTube URL first."); return; }
    try {
      // Approve the request AND set the student's approved_video
      await api.approveYouTubeRequest(r.id, url);
      try { await api.approveStudentVideo(r.student_id, url, r.title); } catch {}
      setUrlInputs(p => { const n = { ...p }; delete n[r.id]; return n; });
      loadAll();
    } catch (e: any) { alert("Error: " + e.message); }
  };

  const handleDeny = async (r: any) => {
    try { await api.denyYouTubeRequest(r.id); loadAll(); }
    catch (e: any) { alert("Error: " + e.message); }
  };

  const handleAddToLibrary = async () => {
    if (!selectedClassId) { alert("Select a class first."); return; }
    if (!newUrl.trim() || !newTitle.trim()) { alert("URL and title are required."); return; }
    const videoId = extractYouTubeId(newUrl);
    if (!videoId) { alert("Couldn't extract YouTube video ID from that URL."); return; }
    setAdding(true);
    try {
      await api.addToYouTubeLibrary({
        class_id: selectedClassId,
        title: newTitle.trim(),
        url: newUrl.trim(),
        category: newCategory,
        auto_approve: true,
      });
      setNewUrl(""); setNewTitle(""); setNewCategory("Educational");
      loadAll();
    } catch (e: any) { alert("Error adding: " + e.message); }
    finally { setAdding(false); }
  };

  const handleRemoveFromLibrary = async (id: string) => {
    if (!confirm("Remove this video from the library?")) return;
    try { await api.removeFromYouTubeLibrary(id); loadAll(); }
    catch (e: any) { alert("Error: " + e.message); }
  };

  const TabBtn = ({ id, label, count, icon: Icon }: { id: Tab; label: string; count: number; icon: any }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
        tab === id
          ? dk ? "bg-red-500/15 text-red-400 border-red-500/30"
               : "bg-red-50 text-red-600 border-red-200"
          : dk ? "bg-white/[0.03] hover:bg-white/[0.05] text-white/50 border-white/[0.06]"
               : "bg-white hover:bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      <Icon size={14} />
      {label}
      {count > 0 && (
        <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          tab === id ? "bg-red-500 text-white" : dk ? "bg-white/[0.08] text-white/60" : "bg-gray-200 text-gray-700"
        }`}>{count}</span>
      )}
    </button>
  );

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="p-7 space-y-5 animate-page-enter max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${dk ? "text-white" : "text-gray-900"}`}>
            <Youtube size={22} className="text-red-400" />
            YouTube Queue
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            Manage student video requests and curate a class video library
          </p>
        </div>
        <Link to="/teacher" className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border ${
          dk ? "border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.04]"
             : "border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"
        }`}>
          <ChevronLeft size={13}/> Back to Dashboard
        </Link>
      </div>

      {/* Class picker */}
      {classes.length > 0 && (
        <div className="card flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-semibold ${dk ? "text-white/50" : "text-gray-600"}`}>Class:</span>
          {classes.map(c => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                selectedClassId === c.id
                  ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                  : dk ? "text-white/50 border-white/[0.08] hover:bg-white/[0.03]"
                       : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabBtn id="library"  label="Class Library"  count={library.length}  icon={Library} />
        <TabBtn id="pending"  label="Pending"        count={pending.length}  icon={Clock} />
        <TabBtn id="approved" label="Approved"       count={approved.length} icon={CheckCircle2} />
        <TabBtn id="denied"   label="Denied"         count={denied.length}   icon={XCircle} />
      </div>

      {/* Library tab */}
      {tab === "library" && (
        <div className="space-y-4">
          {/* Add Video form */}
          <div className="card">
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
              <Plus size={14} /> Add Video to Library
              {selectedClass && <span className={`text-xs font-normal ${dk ? "text-white/25" : "text-gray-400"}`}>— {selectedClass.name}</span>}
            </h3>
            <div className="space-y-2">
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                placeholder="YouTube URL (https://www.youtube.com/watch?v=…)"
                className="input text-sm w-full" />
              <div className="flex gap-2 flex-wrap">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="Video title…" className="input text-sm flex-1 min-w-[200px]" />
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="input text-sm w-40">
                  <option>Educational</option>
                  <option>Music</option>
                  <option>Stories</option>
                  <option>Brain Break</option>
                  <option>Holiday</option>
                  <option>Math</option>
                  <option>Reading</option>
                  <option>Science</option>
                </select>
                <button onClick={handleAddToLibrary} disabled={adding || !newUrl.trim() || !newTitle.trim() || !selectedClassId}
                  className="btn-primary gap-1.5 px-4">
                  {adding ? "Adding…" : <><Plus size={13}/> Add to Library</>}
                </button>
              </div>
              {newUrl && extractYouTubeId(newUrl) && (
                <div className="flex items-center gap-3 mt-2 p-2 rounded-lg" style={{ background: dk ? "rgba(255,255,255,0.03)" : "#f8fafc" }}>
                  <img src={`https://img.youtube.com/vi/${extractYouTubeId(newUrl)}/default.jpg`}
                    alt="preview" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6 }} />
                  <div className={`text-xs ${dk ? "text-white/50" : "text-gray-500"}`}>
                    Preview — video ID <code className={dk ? "text-violet-400" : "text-violet-600"}>{extractYouTubeId(newUrl)}</code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Library grid */}
          <div className="card">
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
              <Film size={14} /> Library Videos ({library.length})
            </h3>
            {library.length === 0 ? (
              <div className={`text-center py-10 text-sm ${dk ? "text-white/25" : "text-gray-400"}`}>
                <Film size={36} className="mx-auto mb-3 opacity-30" />
                No videos yet — add your first one above. ☝️
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {library.map((v: any) => (
                  <div key={v.id} className={`rounded-xl overflow-hidden border ${dk ? "border-white/[0.06]" : "border-gray-200"}`} style={{ background: dk ? "rgba(255,255,255,0.02)" : "white" }}>
                    <div style={{ position: "relative" }}>
                      <img src={v.thumbnail_url || `https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`}
                        alt={v.title} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                      <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.75)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                        {v.category || "General"}
                      </span>
                    </div>
                    <div className="p-3">
                      <div className={`text-xs font-semibold leading-tight mb-2 line-clamp-2 ${dk ? "text-white/85" : "text-gray-800"}`}>
                        {v.title}
                      </div>
                      <div className="flex gap-1.5">
                        <a href={v.url} target="_blank" rel="noreferrer"
                          className={`flex items-center gap-1 flex-1 justify-center py-1 rounded text-[10px] font-semibold ${dk ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
                          <Play size={10}/> Preview
                        </a>
                        <button onClick={() => handleRemoveFromLibrary(v.id)}
                          className={`p-1.5 rounded cursor-pointer ${dk ? "text-white/30 hover:text-red-400 hover:bg-red-500/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"}`}>
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending tab */}
      {tab === "pending" && (
        <div className="card">
          {pending.length === 0 ? (
            <div className={`text-center py-10 text-sm ${dk ? "text-white/25" : "text-gray-400"}`}>
              <Clock size={32} className="mx-auto mb-2 opacity-30" />
              No pending requests right now 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((r: any) => (
                <div key={r.id} className={`rounded-xl p-4 border ${dk ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span style={{ fontSize: 24 }}>🎓</span>
                    <div className="flex-1">
                      <div className={`font-semibold text-sm ${dk ? "text-white" : "text-gray-900"}`}>Student #{r.student_id}</div>
                      <div className={`text-xs ${dk ? "text-white/50" : "text-gray-500"}`}>wants: <strong>"{r.title}"</strong></div>
                    </div>
                    {r.requested_at && <div className={`text-[10px] ${dk ? "text-white/25" : "text-gray-400"}`}>{new Date(r.requested_at).toLocaleString()}</div>}
                  </div>
                  <input value={urlInputs[r.id] || ""} onChange={e => setUrlInputs(p => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Paste YouTube URL to approve…" className="input text-sm w-full mb-2" />
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(r)} disabled={!(urlInputs[r.id] || "").trim()}
                      className="btn-primary flex-1 gap-1.5"><Check size={13}/> Approve</button>
                    <button onClick={() => handleDeny(r)} className="btn-danger gap-1.5 px-4"><X size={13}/> Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Approved tab */}
      {tab === "approved" && (
        <div className="card">
          {approved.length === 0 ? (
            <div className={`text-center py-10 text-sm ${dk ? "text-white/25" : "text-gray-400"}`}>
              <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30" />
              No approved requests yet.
            </div>
          ) : (
            <div className="space-y-2">
              {approved.map((r: any) => (
                <div key={r.id} className="list-row">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <div>
                      <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>{r.title}</div>
                      <div className={`text-xs ${dk ? "text-white/25" : "text-gray-400"}`}>Student #{r.student_id}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Denied tab */}
      {tab === "denied" && (
        <div className="card">
          {denied.length === 0 ? (
            <div className={`text-center py-10 text-sm ${dk ? "text-white/25" : "text-gray-400"}`}>
              <XCircle size={32} className="mx-auto mb-2 opacity-30" />
              No denied requests.
            </div>
          ) : (
            <div className="space-y-2">
              {denied.map((r: any) => (
                <div key={r.id} className="list-row">
                  <div className="flex items-center gap-3">
                    <XCircle size={14} className="text-red-400" />
                    <div>
                      <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>{r.title}</div>
                      <div className={`text-xs ${dk ? "text-white/25" : "text-gray-400"}`}>Student #{r.student_id}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
