// Live camera capture for any device. Streams the back camera via
// getUserMedia, shows a live preview, and snaps a JPEG when the
// teacher taps the shutter. Used inside GradebookModal so every
// barcode scan can attach a worksheet photo right there.
//
// Browser support: works on iOS Safari 11+, Android Chrome, desktop
// Chrome/Firefox/Edge. Requires HTTPS (Vercel provides this) and
// camera permission. Falls back to a file-input native-camera path
// if getUserMedia isn't available.

import { useEffect, useRef, useState } from "react";
import { StarStore, type StarPhoto } from "../../lib/star/storage.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";

interface Props {
  barcode: string;
  studentId?: string;
  studentName?: string;
  onSaved?: (photo: StarPhoto) => void;
  onClose?: () => void;
}

export default function CameraCapture({ barcode, studentId, studentName, onSaved, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapped, setSnapped] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Existing photos for this barcode + student so the teacher can see
  // what's already attached. Refreshed after save / delete.
  const [photos, setPhotos] = useState<StarPhoto[]>(() =>
    (StarStore.getPhotos()[barcode] || []).filter((p) => !studentId || p.studentId === studentId),
  );

  const startStream = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Live camera not supported here — use the file input instead.");
      return;
    }
    try {
      // Prefer the back camera ("environment"). Falls back to any camera
      // if the device only has a front-facing one.
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      successBeep();
    } catch (e: any) {
      setError(e?.message || "Camera permission denied or unavailable.");
      errorBeep();
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  };

  // Auto-start the camera when the component mounts. The very first call
  // on a fresh page-load may need a user gesture (browser autoplay rules),
  // but inside an already-clicked-open modal it usually works straight away.
  useEffect(() => {
    startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !streaming) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const maxSide = 800;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const c = document.createElement("canvas");
    c.width = tw; c.height = th;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, tw, th);
    setSnapped(c.toDataURL("image/jpeg", 0.78));
    successBeep();
  };

  const onFileFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const dataUrl = await fileToDataUrl(f, 800, 0.78);
      setSnapped(dataUrl);
      successBeep();
    } catch (err: any) {
      errorBeep();
      setError(err?.message || "Couldn't read file.");
    }
  };

  const save = () => {
    if (!snapped) return;
    const photo: StarPhoto = {
      id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      barcode, studentId, studentName,
      dataUrl: snapped,
      ts: Date.now(),
      note: note.trim() || undefined,
    };
    StarStore.addPhoto(photo);
    loggedBeep();
    setPhotos((StarStore.getPhotos()[barcode] || []).filter((p) => !studentId || p.studentId === studentId));
    onSaved?.(photo);
    setSnapped(null);
    setNote("");
  };

  const retake = () => setSnapped(null);

  const removePhoto = (id: string) => {
    if (!window.confirm("Delete this photo?")) return;
    StarStore.deletePhoto(barcode, id);
    setPhotos((StarStore.getPhotos()[barcode] || []).filter((p) => !studentId || p.studentId === studentId));
  };

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "rgba(99,102,241,0.08)",
      border: "1px solid rgba(99,102,241,0.30)",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a5b4fc" }}>
            📷 Capture Worksheet Photo
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            {studentName ? `For ${studentName}` : "Class-wide assignment"} · {photos.length} photo{photos.length === 1 ? "" : "s"} so far
          </div>
        </div>
        {onClose && (
          <button onClick={() => { stopStream(); onClose(); }} style={{
            padding: "4px 10px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)", color: "white",
            border: "1px solid rgba(255,255,255,0.15)",
            fontSize: 11, cursor: "pointer",
          }}>Hide</button>
        )}
      </div>

      {error && (
        <div style={{
          padding: "8px 10px", borderRadius: 8, marginBottom: 10,
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.40)",
          color: "#fca5a5", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {!snapped ? (
        <>
          <div style={{
            position: "relative",
            borderRadius: 10, overflow: "hidden",
            background: "rgba(0,0,0,0.50)",
            aspectRatio: "4 / 3",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: streaming ? "block" : "none" }}
            />
            {!streaming && !error && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 13, padding: 20 }}>
                <div style={{ fontSize: 38, marginBottom: 8 }}>📷</div>
                Camera starting…
                <div style={{ marginTop: 12 }}>
                  <button onClick={startStream} style={primary()}>Start camera</button>
                </div>
              </div>
            )}
            {!streaming && error && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13, padding: 20 }}>
                <div style={{ marginBottom: 10 }}>Live camera blocked or unavailable.</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileFallback}
                  style={{ display: "none" }}
                />
                <button onClick={() => fileRef.current?.click()} style={primary()}>📷 Open phone camera</button>
                <button onClick={startStream} style={{ ...ghost(), marginLeft: 8 }}>Try again</button>
              </div>
            )}
          </div>

          {streaming && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={snap} style={{ ...primary(), flex: 1, fontSize: 16, padding: "14px" }}>
                ⚪ SNAP
              </button>
              <button onClick={stopStream} style={ghost()}>Stop</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
            <img src={snapped} alt="" style={{ width: "100%", display: "block" }} />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (front side, partial work, etc)"
            style={{
              width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 8,
              background: "rgba(0,0,0,0.30)", color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={retake} style={ghost()}>↻ Retake</button>
            <button onClick={save} style={{ ...primary(), flex: 1 }}>✅ Save photo</button>
          </div>
        </>
      )}

      {photos.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 6 }}>
            Already attached ({photos.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 6 }}>
            {photos.map((p) => (
              <div key={p.id} style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
                <img src={p.dataUrl} alt="" style={{ width: "100%", display: "block" }} />
                <button
                  onClick={() => removePhoto(p.id)}
                  title="Delete"
                  style={{
                    position: "absolute", top: 4, right: 4,
                    width: 20, height: 20, borderRadius: 4,
                    background: "rgba(239,68,68,0.85)", color: "white",
                    border: "none", cursor: "pointer", fontSize: 11, lineHeight: 1,
                  }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

function primary(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none",
    fontWeight: 800, cursor: "pointer", fontSize: 14,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 13,
  };
}

function fileToDataUrl(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas unavailable")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image read failed")); };
    img.src = url;
  });
}
