// Shared UI primitives for the STAR program. Components everywhere
// should reach for these rather than inlining bespoke styles, so the
// design stays cohesive and one tokens.ts edit ripples everywhere.

import { CSSProperties, forwardRef, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { tokens } from "../../lib/star/theme.ts";

const T = tokens;

/* ── Button ──────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", fullWidth, icon, iconRight, loading, disabled, children, style, ...rest }, ref,
) {
  const sizeMap: Record<ButtonSize, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: T.font.size.sm,  borderRadius: T.radius.sm, gap: 6 },
    md: { padding: "9px 14px", fontSize: T.font.size.md,  borderRadius: T.radius.md, gap: 8 },
    lg: { padding: "12px 18px", fontSize: T.font.size.md, borderRadius: T.radius.md, gap: 10 },
  };
  const variantMap: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: T.color.primaryGradient, color: "white", border: "none",
      boxShadow: T.shadow.glow,
    },
    secondary: {
      background: T.color.surface, color: T.color.text,
      border: `1px solid ${T.color.border}`,
    },
    ghost: {
      background: "transparent", color: T.color.text,
      border: `1px solid ${T.color.border}`,
    },
    danger: {
      background: T.color.dangerSoft, color: "#fca5a5",
      border: `1px solid ${T.color.dangerBorder}`,
    },
    success: {
      background: T.color.successSoft, color: "#86efac",
      border: `1px solid ${T.color.successBorder}`,
    },
  };
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.font.family,
        fontWeight: T.font.weight.bold,
        cursor: isDisabled ? "not-allowed" : "pointer",
        transition: `transform ${T.motion.fast}, box-shadow ${T.motion.standard}, background ${T.motion.standard}, opacity ${T.motion.standard}`,
        opacity: isDisabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        userSelect: "none",
        outline: "none",
        width: fullWidth ? "100%" : undefined,
        ...sizeMap[size],
        ...variantMap[variant],
        ...style,
      }}
      onMouseDown={(e) => {
        if (!isDisabled) (e.currentTarget as HTMLElement).style.transform = "scale(0.97)";
        rest.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        rest.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        rest.onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = T.focusRing;
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = variant === "primary" ? T.shadow.glow : "";
        rest.onBlur?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

function Spinner() {
  return (
    <span aria-hidden style={{
      width: 14, height: 14, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.30)",
      borderTopColor: "white",
      animation: "spStarSpin 0.7s linear infinite",
      display: "inline-block",
    }}>
      <style>{`@keyframes spStarSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

/* ── Card ────────────────────────────────────────────────────────── */

interface CardProps {
  children: ReactNode;
  padding?: keyof typeof T.space;
  raised?: boolean;
  accent?: "default" | "success" | "danger" | "warning" | "info" | "primary";
  style?: CSSProperties;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, padding = "lg", raised, accent = "default", style, onClick, className }: CardProps) {
  const accentMap = {
    default: { background: raised ? T.color.surfaceRaised : T.color.surface, border: T.color.border },
    primary: { background: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.30)" },
    success: { background: T.color.successSoft, border: T.color.successBorder },
    danger:  { background: T.color.dangerSoft,  border: T.color.dangerBorder },
    warning: { background: T.color.warningSoft, border: T.color.warningBorder },
    info:    { background: T.color.infoSoft,    border: T.color.infoBorder },
  } as const;
  const a = accentMap[accent];
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        padding: T.space[padding],
        background: a.background,
        border: `1px solid ${a.border}`,
        borderRadius: T.radius.xl,
        color: T.color.text,
        cursor: onClick ? "pointer" : "default",
        transition: `transform ${T.motion.standard}, background ${T.motion.standard}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── Pill — small label / status chip ───────────────────────────── */

interface PillProps {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info" | "accent";
  size?: "sm" | "md";
}

export function Pill({ children, tone = "neutral", size = "sm" }: PillProps) {
  const toneMap = {
    neutral: { bg: T.color.surfaceSunken, fg: T.color.text, br: T.color.border },
    success: { bg: T.color.successSoft, fg: "#86efac", br: T.color.successBorder },
    danger:  { bg: T.color.dangerSoft,  fg: "#fca5a5", br: T.color.dangerBorder },
    warning: { bg: T.color.warningSoft, fg: "#fde68a", br: T.color.warningBorder },
    info:    { bg: T.color.infoSoft,    fg: "#93c5fd", br: T.color.infoBorder },
    accent:  { bg: T.color.accentSoft,  fg: T.color.accent, br: T.color.accentBorder },
  } as const;
  const c = toneMap[tone];
  const padX = size === "sm" ? 8 : 12;
  const padY = size === "sm" ? 3 : 5;
  const fs = size === "sm" ? T.font.size.xs : T.font.size.sm;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: `${padY}px ${padX}px`, borderRadius: T.radius.pill,
      background: c.bg, color: c.fg, border: `1px solid ${c.br}`,
      fontSize: fs, fontWeight: T.font.weight.semibold,
      letterSpacing: "0.02em", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

/* ── Section header ──────────────────────────────────────────────── */

export function SectionLabel({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: T.space.sm, gap: T.space.md,
    }}>
      <div style={{
        fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: T.color.textMuted,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {icon}{children}
      </div>
      {action}
    </div>
  );
}

/* ── Form inputs ─────────────────────────────────────────────────── */

const inputBase: CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: T.radius.md,
  background: T.color.surfaceSunken, color: T.color.text,
  border: `1px solid ${T.color.border}`,
  fontSize: T.font.size.md, fontFamily: T.font.family,
  outline: "none", boxSizing: "border-box",
  transition: `border-color ${T.motion.fast}, box-shadow ${T.motion.fast}`,
};

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.boxShadow = T.focusRing;
    (e.currentTarget as HTMLElement).style.borderColor = T.color.borderStrong;
  },
  onBlur: (e: React.FocusEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.boxShadow = "";
    (e.currentTarget as HTMLElement).style.borderColor = T.color.border;
  },
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  props, ref,
) {
  return <input ref={ref} {...props} style={{ ...inputBase, ...props.style }} onFocus={(e) => { focusHandlers.onFocus(e); props.onFocus?.(e); }} onBlur={(e) => { focusHandlers.onBlur(e); props.onBlur?.(e); }} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  props, ref,
) {
  return <select ref={ref} {...props} style={{ ...inputBase, appearance: "none" as any, paddingRight: 28, ...props.style }} onFocus={(e) => { focusHandlers.onFocus(e); props.onFocus?.(e); }} onBlur={(e) => { focusHandlers.onBlur(e); props.onBlur?.(e); }} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  props, ref,
) {
  return <textarea ref={ref} {...props} style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, ...props.style }} onFocus={(e) => { focusHandlers.onFocus(e); props.onFocus?.(e); }} onBlur={(e) => { focusHandlers.onBlur(e); props.onBlur?.(e); }} />;
});

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: T.space.md }}>
      <label style={{
        display: "block", marginBottom: 6,
        fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
        letterSpacing: "0.16em", textTransform: "uppercase",
        color: error ? "#fca5a5" : T.color.textMuted,
      }}>{label}</label>
      {children}
      {hint && !error && <div style={{ fontSize: T.font.size.xs, marginTop: 4, color: T.color.textSubtle }}>{hint}</div>}
      {error && <div style={{ fontSize: T.font.size.xs, marginTop: 4, color: "#fca5a5" }} role="alert">{error}</div>}
    </div>
  );
}

/* ── Stat tile — for dashboards ─────────────────────────────────── */

interface StatProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: "primary" | "success" | "danger" | "warning";
  subtle?: string;
  onClick?: () => void;
}

export function Stat({ icon, label, value, accent = "primary", subtle, onClick }: StatProps) {
  const tint = accent === "success" ? T.color.success
    : accent === "danger" ? T.color.danger
    : accent === "warning" ? T.color.warning
    : T.color.primary;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: "left", cursor: onClick ? "pointer" : "default",
        padding: T.space.lg, borderRadius: T.radius.xl,
        background: `linear-gradient(135deg, ${tint}22, ${tint}05)`,
        border: `1px solid ${tint}55`, color: T.color.text,
        display: "flex", flexDirection: "column", gap: T.space.xs,
        fontFamily: T.font.family,
        transition: `transform ${T.motion.fast}, box-shadow ${T.motion.standard}`,
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = T.focusRing; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: T.color.textMuted,
        }}>{label}</span>
        <span style={{ fontSize: T.font.size.xl }}>{icon}</span>
      </div>
      <div style={{ fontSize: T.font.size["4xl"], fontWeight: T.font.weight.black, color: tint, lineHeight: 1, marginTop: 4 }}>
        {value}
      </div>
      {subtle && <div style={{ fontSize: T.font.size.xs, color: T.color.textSubtle }}>{subtle}</div>}
    </button>
  );
}
