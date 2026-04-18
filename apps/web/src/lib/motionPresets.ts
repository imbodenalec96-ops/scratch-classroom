/**
 * motionPresets.ts — centralized motion vocabulary for BlockForge Student
 *
 * Covers iPad (touch-first) + Chromebook (keyboard + trackpad).
 * All animations respect `prefers-reduced-motion`.
 */

export const motion = {
  // Spring curve tokens — use with transition / animation-timing-function
  spring: {
    /** Gentle entrance. Slight overshoot feels natural, not jarring. */
    soft: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    /** Energetic — celebrations, mascot, success bursts. */
    bouncy: "cubic-bezier(0.34, 1.8, 0.64, 1)",
    /** Smooth decelerate — exits, page cross-fades. */
    smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
    /** Crisp standard — hover, micro-interactions. */
    quick: "cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Duration tokens in ms
  duration: {
    micro: 100,
    fast: 160,
    standard: 250,
    enter: 380,
    slow: 500,
  },

  // Pre-built transition strings (for inline style={{ transition: ... }})
  transition: {
    card: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease",
    press: "transform 0.12s cubic-bezier(0.4,0,0.2,1)",
    fade: "opacity 0.2s ease",
    standard: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
  },

  /**
   * stagger(index) → CSS animation-delay string for list item.
   * @param index 0-based item position
   * @param base  ms between items (default 65ms)
   */
  stagger: (index: number, base = 65) => `${index * base}ms`,

  // Pre-built CSS animation strings (assign to style={{ animation: ... }})
  animation: {
    springIn: (delay = 0) => `spring-in 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms both`,
    popIn:    (delay = 0) => `pop-in 0.42s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms both`,
    slideUp:  (delay = 0) => `slide-up 0.35s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
    fadeIn:   (delay = 0) => `fade-in 0.3s ease-out ${delay}ms both`,
    mascotBop:   () => "mascot-bop 3.5s ease-in-out infinite",
    mascotCheer: () => "mascot-cheer 0.7s cubic-bezier(0.34,1.56,0.64,1)",
  },
};

/** Returns true when the user has requested reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Subject palette — pastel tones for claymorphism cards. */
export const subjectPalette: Record<string, { bg: string; border: string; accent: string; emoji: string; label: string }> = {
  math:    { bg: "#fef9ee", border: "#fde68a", accent: "#D97757", emoji: "🔢", label: "Math"    },
  reading: { bg: "#f0fdf4", border: "#bbf7d0", accent: "#059669", emoji: "📚", label: "Reading" },
  writing: { bg: "#fdf4ff", border: "#e9d5ff", accent: "#7c3aed", emoji: "✏️", label: "Writing" },
  social:  { bg: "#fdf2f8", border: "#fbcfe8", accent: "#db2777", emoji: "💖", label: "Social"  },
  science: { bg: "#eff6ff", border: "#bfdbfe", accent: "#2563eb", emoji: "🔬", label: "Science" },
  default: { bg: "#f8f7ff", border: "#ddd6fe", accent: "#7c3aed", emoji: "📝", label: "Work"    },
};

export function getSubjectPalette(subject?: string) {
  const key = (subject || "").toLowerCase();
  for (const [k, v] of Object.entries(subjectPalette)) {
    if (key.includes(k)) return v;
  }
  return subjectPalette.default;
}
