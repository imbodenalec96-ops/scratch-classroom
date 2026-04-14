import React, { useState, useCallback } from "react";
import type { Sprite } from "@scratch/shared";

interface Keyframe { id: string; spriteId: string; time: number; x: number; y: number; rotation: number; scale: number; }
interface Props { sprites: Sprite[]; duration: number; onPlay: (keyframes: Keyframe[]) => void; }

export default function Timeline({ sprites, duration = 10, onPlay }: Props) {
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedSprite, setSelectedSprite] = useState<string>(sprites[0]?.id || "");

  const addKeyframe = useCallback(() => {
    const sprite = sprites.find((s) => s.id === selectedSprite);
    if (!sprite) return;
    const kf: Keyframe = { id: "kf_" + Math.random().toString(36).slice(2, 8), spriteId: sprite.id,
      time: currentTime, x: sprite.x, y: sprite.y, rotation: sprite.rotation, scale: sprite.scale };
    setKeyframes((prev) => [...prev.filter((k) => !(k.spriteId === sprite.id && k.time === currentTime)), kf]);
  }, [selectedSprite, currentTime, sprites]);

  const deleteKeyframe = useCallback((id: string) => { setKeyframes((prev) => prev.filter((k) => k.id !== id)); }, []);

  const handlePlay = () => { setPlaying(true); onPlay(keyframes); setTimeout(() => setPlaying(false), duration * 1000); };

  const spriteKeyframes = keyframes.filter((k) => k.spriteId === selectedSprite);
  const timeMarkers = Array.from({ length: duration + 1 }, (_, i) => i);

  return (
    <div className="bg-white/[0.04] rounded-xl border border-white/[0.06] p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Timeline</h3>
        <div className="flex gap-2">
          <select value={selectedSprite} onChange={(e) => setSelectedSprite(e.target.value)}
            className="text-xs py-1 w-28 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 text-white">
            {sprites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={addKeyframe} className="text-xs py-1 px-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors">+ Keyframe</button>
          <button onClick={handlePlay} disabled={playing}
            className="text-xs py-1 px-2 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] border border-white/[0.06] transition-colors disabled:opacity-40">
            {playing ? "▶ Playing..." : "▶ Play"}
          </button>
        </div>
      </div>
      <div className="relative bg-white/[0.02] rounded-lg overflow-hidden border border-white/[0.04]" style={{ height: 60 }}>
        <div className="absolute inset-0 flex">
          {timeMarkers.map((t) => (
            <div key={t} className="flex-1 border-r border-white/[0.04] text-[9px] text-white/20 pl-0.5 pt-0.5">{t}s</div>
          ))}
        </div>
        <div className="absolute top-0 bottom-0 w-0.5 bg-violet-500 z-10 transition-all" style={{ left: `${(currentTime / duration) * 100}%` }} />
        {spriteKeyframes.map((kf) => (
          <div key={kf.id} className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-violet-400 rotate-45 cursor-pointer hover:bg-violet-300 transition-colors z-20"
            style={{ left: `calc(${(kf.time / duration) * 100}% - 6px)` }} title={`t=${kf.time}s`} onClick={() => deleteKeyframe(kf.id)} />
        ))}
        <div className="absolute inset-0 z-5 cursor-pointer"
          onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; setCurrentTime(Math.round(pct * duration * 10) / 10); }} />
      </div>
      <input type="range" min={0} max={duration} step={0.1} value={currentTime}
        onChange={(e) => setCurrentTime(Number(e.target.value))} className="w-full mt-2 accent-violet-500" />
      <div className="text-xs text-white/30 text-center">{currentTime.toFixed(1)}s / {duration}s</div>
    </div>
  );
}
