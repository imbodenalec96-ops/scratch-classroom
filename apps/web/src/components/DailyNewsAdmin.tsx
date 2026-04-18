import { useEffect, useState } from "react";
import { ExternalLink, Eye, Save, Newspaper } from "lucide-react";
import { api } from "../lib/api.ts";
import { embedForUrl } from "./DailyNewsViewer.tsx";

// Teacher/admin card: paste today's Daily News file URL once each morning.
// Shows the Drive folder shortcut, the current "today's URL", and a preview
// iframe/image so they can confirm the link renders before students hit 9:10.
export default function DailyNewsAdmin({ classId, dk }: { classId: string; dk: boolean }) {
  const [data, setData] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!classId) return;
    api.getDailyNews(classId).then((d) => {
      setData(d);
      setUrl(d?.todays_file_url || "");
      setTitle(d?.todays_file_title || "");
    }).catch(() => {});
  }, [classId]);

  async function save() {
    if (!url.trim()) return;
    setSaving(true);
    try {
      const updated = await api.setDailyNews(classId, {
        todays_file_url: url.trim(),
        todays_file_title: title.trim() || undefined,
      });
      setData(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      alert(`Couldn't save: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  const folderUrl = data?.drive_folder_url;
  const embed = url ? embedForUrl(url) : null;

  return (
    <div className="card animate-slide-in" style={{ animationDelay: "90ms" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
          <Newspaper size={14} /> Daily News Source
          {data?.todays_file_set_at && (
            <span className={`text-[10px] font-normal ${dk ? "text-emerald-400/70" : "text-emerald-600"}`}>
              set {new Date(data.todays_file_set_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </h3>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${dk ? "bg-white/5 hover:bg-white/10 text-white/70" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
          >
            <ExternalLink size={12} /> Open Drive folder
          </a>
        )}
      </div>

      <div className="space-y-2 mb-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste today's file URL (Google Slides, Doc, Drive video, YouTube…)"
          className="input text-sm w-full"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional, e.g. 'April 17 — Earthquake update')"
          className="input text-sm w-full"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!url.trim() || saving}
          className={`btn-primary gap-2 ${savedFlash ? "bg-emerald-500 border-emerald-500" : ""} disabled:opacity-40`}
        >
          <Save size={13} />
          {saving ? "Saving…" : savedFlash ? "Saved!" : "Save today's news"}
        </button>
        <button
          onClick={() => setShowPreview((v) => !v)}
          disabled={!url.trim()}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-all disabled:opacity-40 ${dk ? "bg-blue-500/10 hover:bg-blue-500/18 text-blue-400 border-blue-500/20" : "bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"}`}
        >
          <Eye size={12} /> {showPreview ? "Hide preview" : "Preview"}
        </button>
      </div>

      {showPreview && embed && (
        <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", height: 360, background: "white" }}>
          {embed.kind === "image" ? (
            <img src={embed.src} alt="preview" className="w-full h-full object-contain" />
          ) : (
            <iframe
              src={embed.src}
              title="Daily News preview"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            />
          )}
        </div>
      )}

      {!data && (
        <p className={`mt-3 text-xs ${dk ? "text-white/40" : "text-gray-500"}`}>
          No source configured yet for this class. Paste a URL above to start.
        </p>
      )}
    </div>
  );
}
