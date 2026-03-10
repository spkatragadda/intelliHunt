"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive" | "danger" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  default:     { background: "var(--accent)", color: "var(--accent-text)", border: "1px solid var(--accent-border-hover)", fontWeight: 600, boxShadow: "0 0 16px rgba(255,255,255,0.18)" },
  primary:     { background: "var(--accent)", color: "var(--accent-text)", border: "1px solid var(--accent-border-hover)", fontWeight: 600, boxShadow: "0 0 16px rgba(255,255,255,0.18)" },
  secondary:   { background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border)" },
  outline:     { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" },
  ghost:       { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
  destructive: { background: "transparent", color: "var(--danger)", border: "1px solid rgba(248,113,113,0.35)" },
  danger:      { background: "transparent", color: "var(--danger)", border: "1px solid rgba(248,113,113,0.35)" },
  link:        { background: "transparent", color: "var(--accent)", border: "none", padding: 0, height: "auto" },
};

const variantHover: Record<ButtonVariant, React.CSSProperties> = {
  default:     { background: "var(--accent-hover)", boxShadow: "0 0 24px rgba(255,255,255,0.30)" },
  primary:     { background: "var(--accent-hover)", boxShadow: "0 0 24px rgba(255,255,255,0.30)" },
  secondary:   { background: "var(--surface-hover)", borderColor: "var(--border-hover)" },
  outline:     { background: "var(--surface-hover)", borderColor: "var(--border-hover)" },
  ghost:       { background: "var(--surface-hover)" },
  destructive: { background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.45)" },
  danger:      { background: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.45)" },
  link:        { textDecoration: "underline" },
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2 text-[13.5px]",
  sm:      "h-7 px-3 py-1 text-[12.5px]",
  lg:      "h-11 px-6 py-2.5 text-[14.5px]",
  icon:    "h-9 w-9 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  href?: string;
  target?: "_blank";
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", icon, href, target, disabled, children, onClick, ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 outline-none focus-visible:ring-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer flex-shrink-0";
    const classes = cn(base, sizeClasses[size], className);
    const style = variantStyles[variant];
    const hover = variantHover[variant];

    const inner = (
      <>
        {icon && <span className="flex-shrink-0 [&_svg]:w-4 [&_svg]:h-4">{icon}</span>}
        {children && <span>{children}</span>}
      </>
    );

    if (href) {
      const isExternal = target === "_blank" || href.startsWith("http");
      if (isExternal) {
        return (
          <a className={classes} style={style} href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined}
            onMouseEnter={e => Object.assign(e.currentTarget.style, hover)}
            onMouseLeave={e => Object.assign(e.currentTarget.style, style)}>
            {inner}
          </a>
        );
      }
      return (
        <Link href={href} className={classes} style={style}
          onMouseEnter={e => Object.assign(e.currentTarget.style, hover)}
          onMouseLeave={e => Object.assign(e.currentTarget.style, style)}>
          {inner}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={classes}
        style={style}
        onMouseEnter={e => { if (!disabled) Object.assign(e.currentTarget.style, hover); }}
        onMouseLeave={e => { if (!disabled) Object.assign(e.currentTarget.style, style); }}
        {...props}
      >
        {inner}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
export default Button;
