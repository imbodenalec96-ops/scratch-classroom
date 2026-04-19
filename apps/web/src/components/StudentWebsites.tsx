import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Globe, Plus, Send, X } from "lucide-react";
import { LearningAppTile, LearningAppGrid, inferCategoryIcon } from "./LearningAppTile.tsx";

export default function StudentWebsites() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const WS_CACHE = "sw_cache_v1";
  const [sites, setSites] = useState<any[]>(() => {
    try { const c = localStorage.getItem(WS_CACHE); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(sites.length === 0);
  const [showRequest, setShowRequest] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMyWebsites()
      .then(data => {
        const list = data || [];
        setSites(list);
        try { localStorage.setItem(WS_CACHE, JSON.stringify(list)); } catch {}
      })
      .catch(() => { if (sites.length === 0) setError("Failed to load websites"); })
      .finally(() => setLoading(false));
  }, []);

  const handleRequest = async () => {
    const title = requestTitle.trim();
    if (!title) return;
    setRequesting(true);
    try {
      await api.requestWebsite(title);
      setRequestSent(true);
      setRequestTitle("");
      setTimeout(() => { setRequestSent(false); setShowRequest(false); }, 2500);
    } catch {
      setError("Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  const card: React.CSSProperties = {
    background: dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)",
    border: dk ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
    borderRadius: 16,
    padding: 24,
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, marginBottom: 4 }}>
            Learning Apps
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
            <Globe size={26} style={{ color: "#8b5cf6" }} />
            Websites
          </div>
        </div>
        <button
          onClick={() => { setShowRequest(true); setRequestSent(false); setError(null); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "#fff", border: "none", borderRadius: 12,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          <Plus size={16} /> Request a site
        </button>
      </div>

      {/* Request modal */}
      {showRequest && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ ...card, width: 420, position: "relative", boxShadow: "0 24px 48px rgba(0,0,0,0.35)" }}>
            <button onClick={() => setShowRequest(false)} style={{
              position: "absolute", top: 14, right: 14, background: "none", border: "none",
              cursor: "pointer", opacity: 0.5, color: "inherit",
            }}><X size={18} /></button>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Request a website</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 18 }}>
              Tell your teacher what site you'd like access to. They'll review and add the URL.
            </div>
            {requestSent ? (
              <div style={{ textAlign: "center", padding: "20px 0", fontSize: 15, color: "#4ade80", fontWeight: 700 }}>
                ✅ Request sent! Your teacher will review it.
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={requestTitle}
                  onChange={e => setRequestTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRequest()}
                  placeholder="e.g. Cool Math Games"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                    background: dk ? "rgba(255,255,255,0.07)" : "#f3f4f6",
                    border: dk ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e5e7eb",
                    color: "inherit", outline: "none", marginBottom: 12,
                  }}
                />
                <button
                  disabled={!requestTitle.trim() || requesting}
                  onClick={handleRequest}
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 10,
                    background: requestTitle.trim() ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : (dk ? "rgba(255,255,255,0.08)" : "#e5e7eb"),
                    color: requestTitle.trim() ? "#fff" : (dk ? "rgba(255,255,255,0.3)" : "#9ca3af"),
                    border: "none", fontWeight: 700, fontSize: 14, cursor: requestTitle.trim() ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <Send size={14} /> {requesting ? "Sending…" : "Send request"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", opacity: 0.5, padding: 60, fontSize: 15 }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: "center", color: "#f87171", padding: 40 }}>{error}</div>
      ) : sites.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <Globe size={40} style={{ opacity: 0.3, margin: "0 auto 14px" }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No websites yet</div>
          <div style={{ fontSize: 13, opacity: 0.5 }}>
            Your teacher hasn't added any sites yet. You can request one above!
          </div>
        </div>
      ) : (
        <LearningAppGrid>
          {sites.map(site => (
            <LearningAppTile key={site.id} app={site} dk={dk} />
          ))}
        </LearningAppGrid>
      )}
    </div>
  );
}
