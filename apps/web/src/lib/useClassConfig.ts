/**
 * useClassConfig — polls the student's first-enrolled class's free-time
 * config and exposes feature flags. Shared via module-level cache so
 * multiple components stay in sync without each firing their own request.
 *
 * Config shape (all optional — missing keys default to enabled):
 *   arcadeEnabled, projectsEnabled, unityEnabled, blockforgeEnabled,
 *   youtubeEnabled, dailyCapMinutes, allowedGameIds (string[])
 */
import { useEffect, useState } from "react";
import { api } from "./api.ts";

export interface ClassConfig {
  arcadeEnabled: boolean;
  projectsEnabled: boolean;
  unityEnabled: boolean;
  blockforgeEnabled: boolean;
  youtubeEnabled: boolean;
  dailyCapMinutes: number;
  allowedGameIds?: string[] | null;  // null/undefined = all games allowed
}

export const DEFAULT_CONFIG: ClassConfig = {
  arcadeEnabled: true,
  projectsEnabled: true,
  unityEnabled: true,
  blockforgeEnabled: true,
  youtubeEnabled: true,
  dailyCapMinutes: 0,
  allowedGameIds: null,
};

let _cached: ClassConfig = { ...DEFAULT_CONFIG };
let _cachedAt = 0;
let _inflight: Promise<ClassConfig> | null = null;

const listeners = new Set<(cfg: ClassConfig) => void>();
function emit() { for (const l of listeners) l(_cached); }

async function fetchFirstClassConfig(): Promise<ClassConfig> {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const classes = await api.getClasses();
      if (!Array.isArray(classes) || classes.length === 0) {
        _cached = { ...DEFAULT_CONFIG };
        _cachedAt = Date.now();
        emit();
        return _cached;
      }
      const cfg = await api.getClassConfig(classes[0].id).catch(() => ({}));
      _cached = { ...DEFAULT_CONFIG, ...(cfg && typeof cfg === "object" ? cfg : {}) };
      _cachedAt = Date.now();
      emit();
      return _cached;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function useClassConfig(): ClassConfig {
  const [cfg, setCfg] = useState<ClassConfig>(_cached);

  useEffect(() => {
    // Refresh on mount if stale
    const TTL = 30_000; // 30s
    if (Date.now() - _cachedAt > TTL) fetchFirstClassConfig();
    listeners.add(setCfg);
    // Poll every 30s so config changes propagate quickly
    const iv = setInterval(() => fetchFirstClassConfig(), 30_000);
    return () => { listeners.delete(setCfg); clearInterval(iv); };
  }, []);

  return cfg;
}

export function isGameAllowed(cfg: ClassConfig, gameId: string): boolean {
  if (!cfg.allowedGameIds || cfg.allowedGameIds.length === 0) return true;
  return cfg.allowedGameIds.includes(gameId);
}
