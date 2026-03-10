import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "scanning"
  | "accent";

const badgeStyles: Record<BadgeVariant, React.CSSProperties> = {
  default:     { background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" },
  accent:      { background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" },
  secondary:   { background: "var(--surface-raised)", color: "var(--text-muted)", border: "1px solid var(--border)" },
  destructive: { background: "rgba(248,113,113,0.10)", color: "var(--danger)", border: "1px solid rgba(248,113,113,0.25)" },
  outline:     { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  success:     { background: "rgba(52,211,153,0.10)", color: "var(--success)", border: "1px solid rgba(52,211,153,0.25)" },
  warning:     { background: "rgba(251,191,36,0.10)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.25)" },
  critical:    { background: "rgba(244,63,94,0.13)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.30)" },
  high:        { background: "rgba(249,115,22,0.13)", color: "#f97316", border: "1px solid rgba(249,115,22,0.30)" },
  medium:      { background: "rgba(59,130,246,0.13)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.30)" },
  low:         { background: "rgba(34,197,94,0.13)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.30)" },
  scanning:    { background: "rgba(148,163,184,0.10)", color: "var(--info)", border: "1px solid rgba(148,163,184,0.25)" },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", style, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-[0.03em]",
        className
      )}
      style={{ ...badgeStyles[variant], ...style }}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
