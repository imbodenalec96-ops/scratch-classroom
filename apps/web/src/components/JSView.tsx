import React from "react";
import type { Sprite } from "@scratch/shared";
import { projectToJS } from "../lib/blockToJS.ts";
import { useTheme } from "../lib/theme.tsx";

interface Props { sprites: Sprite[]; }

export default function JSView({ sprites }: Props) {
  const code = projectToJS(sprites);
  return (
    <div className="h-full rounded-xl border overflow-hidden flex flex-col" style={{ background: "#0d0d1a", borderColor: "var(--border-md)" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="text-sm font-medium text-violet-400">JavaScript View</span>
        <button onClick={() => navigator.clipboard.writeText(code)}
          className="text-xs text-white/40 hover:text-white transition-colors cursor-pointer">Copy</button>
      </div>
      <pre className="flex-1 p-4 overflow-auto text-sm font-mono leading-relaxed text-emerald-300/90 scrollbar-thin">
        <code>{code || "// No blocks yet — start dragging blocks to see JavaScript here"}</code>
      </pre>
    </div>
  );
}
