import type { GameProjectData } from "./types.ts";

function key(projectId?: string): string {
  return `blockforge:game:${projectId || "playground"}`;
}

export function saveGameProgress(projectId: string | undefined, data: GameProjectData): void {
  const payload = {
    savedAt: Date.now(),
    data,
  };
  localStorage.setItem(key(projectId), JSON.stringify(payload));
}

export function loadGameProgress(projectId: string | undefined): GameProjectData | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
}

export function clearGameProgress(projectId: string | undefined): void {
  localStorage.removeItem(key(projectId));
}
