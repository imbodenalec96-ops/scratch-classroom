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
    // Page + surface — deep purple core with strong violet/pink radial glows
    bg:               "radial-gradient(1400px 900px at 0% 0%, rgba(168,85,247,0.20) 0%, transparent 55%), radial-gradient(1200px 800px at 100% 100%, rgba(236,72,153,0.18) 0%, transparent 55%), radial-gradient(900px 600px at 50% 0%, rgba(99,102,241,0.14) 0%, transparent 60%), radial-gradient(ellipse at center, #1a0f2e 0%, #0a0414 100%)",
    surface:          "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(99,102,241,0.03) 50%, rgba(15,15,28,0.20) 100%)",
    surfaceRaised:    "linear-gradient(180deg, rgba(168,85,247,0.12) 0%, rgba(99,102,241,0.06) 100%)",
    surfaceSunken:    "rgba(10,4,20,0.55)",
    border:           "rgba(168,85,247,0.18)",
    borderStrong:     "rgba(168,85,247,0.40)",
    // Text — slightly cooler off-white for that modern dashboard feel
    text:             "#f8fafc",
    textMuted:        "rgba(248,250,252,0.65)",
    textSubtle:       "rgba(196,181,253,0.55)",
    // Brand — violet → pink anchor pair
    accent:           "#a855f7",
    accentSoft:       "rgba(168,85,247,0.16)",
    accentBorder:     "rgba(168,85,247,0.50)",
    accentPink:       "#ec4899",
    accentPinkSoft:   "rgba(236,72,153,0.16)",
    primary:          "#6366f1",
    primaryGradient:  "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
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
    sm: "0 1px 3px rgba(0,0,0,0.30)",
    md: "0 4px 18px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
    lg: "0 16px 40px rgba(0,0,0,0.50), 0 0 24px rgba(168,85,247,0.10)",
    xl: "0 28px 72px rgba(0,0,0,0.60), 0 0 36px rgba(168,85,247,0.18)",
    glow: "0 12px 32px -10px rgba(168,85,247,0.55)",
    glowPink: "0 12px 32px -10px rgba(236,72,153,0.55)",
    inset: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
  focusRing: "0 0 0 3px rgba(168,85,247,0.55)",
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
