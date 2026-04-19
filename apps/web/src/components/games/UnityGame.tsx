import React, { useState, useRef } from "react";

interface Props {
  /** Path to the Unity WebGL index.html, e.g. "/unity-games/my-game/index.html" */
  src: string;
  title?: string;
}

/**
 * UnityGame — embeds a Unity WebGL build via iframe.
 *
 * Unity's WebGL output is fully self-contained static HTML. Drop the build
 * output into /apps/web/public/unity-games/<name>/ and point `src` at the
 * generated index.html. No JS SDK wiring needed.
 *
 * How to add a new game:
 *   1. Unity → File → Build Settings → WebGL → Build
 *   2. Copy output to apps/web/public/unity-games/<name>/
 *   3. Add a card in ArcadePage.tsx with type:"unity" and embedUrl pointing here
 */
export default function UnityGame({ src, title = "Unity Game" }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: "#07071a", minHeight: 480 }}>
      {/* Loading overlay */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10" style={{ background: "#07071a" }}>
          <div className="text-4xl">🎮</div>
          <div className="text-white font-bold text-base">Loading Unity game…</div>
          <div className="w-48 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full bg-violet-500 animate-pulse" style={{ width: "60%" }} />
          </div>
          <div className="text-white/30 text-xs">This may take a moment for large builds</div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ background: "#07071a" }}>
          <div className="text-4xl">⚠️</div>
          <div className="text-white font-bold">Unity build not found</div>
          <div className="text-white/40 text-sm text-center max-w-xs">
            Drop your Unity WebGL output into<br />
            <code className="text-violet-400">/public/unity-games/&lt;name&gt;/</code><br />
            then register the card in ArcadePage.tsx
          </div>
          <a
            href="/unity-games/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-violet-400 underline underline-offset-2"
          >
            Read setup instructions →
          </a>
        </div>
      )}

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="w-full flex-1"
        style={{ height: "100%", minHeight: 480, border: "none", opacity: loaded ? 1 : 0, transition: "opacity 0.3s ease", display: "block" }}
        allow="autoplay; fullscreen; microphone; pointer-lock"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
