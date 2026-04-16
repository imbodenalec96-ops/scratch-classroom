import React, { useRef, useState } from "react";
import type { Asset } from "@scratch/shared";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";

interface Props { assets: Asset[]; onAdd: (asset: Asset) => void; onDelete: (id: string) => void; }

export default function AssetManager({ assets, onAdd, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"image" | "sound" | "model">("image");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const result = await api.upload(file); onAdd(result); }
    catch (err) { console.error("Upload failed:", err); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const filtered = assets.filter((a) => a.type === tab);

  return (
    <div className="card p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-t1">Assets</h3>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
            accept={tab === "image" ? "image/*" : tab === "sound" ? "audio/*" : ".glb,.gltf,.obj"} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-primary text-xs py-1 px-2">
            {uploading ? "Uploading..." : "+ Upload"}
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        {(["image", "sound", "model"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs py-1 px-3 rounded-full font-medium transition-all cursor-pointer ${
              tab === t ? "bg-violet-600 text-white" : "btn-ghost py-1 px-3 rounded-full"}`}>
            {t === "image" ? "🖼 Images" : t === "sound" ? "🔊 Sounds" : "🧊 3D Models"}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-6 text-t3 text-sm">No {tab}s yet. Upload to add.</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {filtered.map((asset) => (
            <div key={asset.id} className="group relative rounded-lg p-2 text-center border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}>
              {asset.type === "image" ? (
                <img src={asset.url} alt={asset.name} className="w-full h-12 object-cover rounded" />
              ) : (
                <div className="w-full h-12 rounded flex items-center justify-center text-lg" style={{ background: "var(--bg-hover)" }}>
                  {asset.type === "sound" ? "🔊" : "🧊"}
                </div>
              )}
              <span className="text-[10px] text-t3 truncate block mt-1">{asset.name}</span>
              <button onClick={() => onDelete(asset.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
