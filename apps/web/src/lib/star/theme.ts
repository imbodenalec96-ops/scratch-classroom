// Design tokens for the STAR program. One source of truth for colors,
// spacing, radii, shadows, and motion. Components should import these
// instead of inlining hex values / random magic numbers.
//
// Palette is anchored on a deep navy primary + warm amber for highlights
// (matches the rest of the editorial board's palette + serif vocabulary)
// with semantic green/red/blue for success/danger/info.

export const tokens = {
  // ── color ────────────────────────────────────────────────────────
  // Surfaces are layered: bg < surface < surfaceRaised. Borders are
  // subtle so they read as paper edges, not boxes.
  color: {
    // Page + surface
    bg:               "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
    surface:          "rgba(255,255,255,0.04)",
    surfaceRaised:    "rgba(255,255,255,0.06)",
    surfaceSunken:    "rgba(0,0,0,0.30)",
    border:           "rgba(255,255,255,0.10)",
    borderStrong:     "rgba(255,255,255,0.16)",
    // Text
    text:             "#f5f1e8",   // editorial cream
    textMuted:        "rgba(245,241,232,0.65)",
    textSubtle:       "rgba(245,241,232,0.45)",
    // Brand
    accent:           "#fbbf24",   // amber, the warm highlight
    accentSoft:       "rgba(251,191,36,0.18)",
    accentBorder:     "rgba(251,191,36,0.45)",
    primary:          "#6366f1",   // indigo
    primaryGradient:  "linear-gradient(135deg, #6366f1, #b23a48)",
    // Semantic
    success:          "#10b981",
    successSoft:      "rgba(16,185,129,0.10)",
    successBorder:    "rgba(16,185,129,0.40)",
    danger:           "#ef4444",
    dangerSoft:       "rgba(239,68,68,0.10)",
    dangerBorder:     "rgba(239,68,68,0.40)",
    warning:          "#f59e0b",
    warningSoft:      "rgba(245,158,11,0.10)",
    warningBorder:    "rgba(245,158,11,0.40)",
    info:             "#3b82f6",
    infoSoft:         "rgba(59,130,246,0.10)",
    infoBorder:       "rgba(59,130,246,0.40)",
    // Letter grade colors (used by gradebook + dashboards)
    letterA:          "#10b981",
    letterB:          "#3b82f6",
    letterC:          "#f59e0b",
    letterD:          "#f97316",
    letterF:          "#ef4444",
    letterNeutral:    "#94a3b8",
  },
  // ── spacing — strict 4/8 scale ──────────────────────────────────
  space: {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 48,
  },
  // ── radii ───────────────────────────────────────────────────────
  radius: {
    xs: 4, sm: 6, md: 8, lg: 12, xl: 14, "2xl": 18, pill: 999,
  },
  // ── shadows ─────────────────────────────────────────────────────
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.20)",
    md: "0 6px 18px rgba(0,0,0,0.28)",
    lg: "0 12px 32px rgba(0,0,0,0.40)",
    xl: "0 24px 64px rgba(0,0,0,0.50)",
    glow: "0 8px 22px rgba(99,102,241,0.35)",
    glowAmber: "0 8px 22px rgba(251,191,36,0.22)",
  },
  // ── typography scale ────────────────────────────────────────────
  font: {
    family: "'Inter', system-ui, sans-serif",
    serif:  "'Fraunces', 'Playfair Display', Georgia, serif",
    mono:   "'Menlo', 'Monaco', monospace",
    size: {
      xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18,
      "2xl": 22, "3xl": 28, "4xl": 38,
    },
    weight: {
      normal: 500, semibold: 700, bold: 800, black: 900,
    },
  },
  // ── motion — micro-interaction speed ────────────────────────────
  motion: {
    fast:     "120ms cubic-bezier(0.22, 1, 0.36, 1)",
    standard: "180ms cubic-bezier(0.22, 1, 0.36, 1)",
    slow:     "320ms cubic-bezier(0.22, 1, 0.36, 1)",
  },
  // ── focus ring — visible without overpowering ──────────────────
  focusRing: "0 0 0 3px rgba(99,102,241,0.45)",
} as const;

// Semantic color helpers for letter grades — keeps the existing
// letterGradeColor() in storage.ts in sync with the new tokens.
export function letterGradeColorToken(letter: string): string {
  return ({
    A: tokens.color.letterA,
    B: tokens.color.letterB,
    C: tokens.color.letterC,
    D: tokens.color.letterD,
    F: tokens.color.letterF,
  } as Record<string, string>)[letter] || tokens.color.letterNeutral;
}
