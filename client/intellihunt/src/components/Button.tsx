import { ReactNode } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export default function Button({
  children,
  onClick,
  href,
  target,
  className = "",
  disabled = false,
  variant = "primary",
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  target?: "_blank";
  className?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  icon?: ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-[14px] font-medium transition-colors duration-150 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer";

  const variants: Record<ButtonVariant, string> = {
    primary: "",
    secondary: "",
    ghost: "",
    danger: "",
  };

  // Using inline styles for CSS variable support
  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: "var(--accent)",
      color: "#fff",
      border: "1px solid rgba(94, 106, 210, 0.5)",
    },
    secondary: {
      background: "transparent",
      color: "var(--text-primary)",
      border: "1px solid var(--border)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)",
      border: "1px solid transparent",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "1px solid rgba(229, 83, 75, 0.35)",
    },
  };

  const hoverStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: "var(--accent-hover)" },
    secondary: { background: "var(--surface-hover)", borderColor: "var(--border-hover)" },
    ghost: { background: "var(--surface-hover)" },
    danger: { background: "rgba(229, 83, 75, 0.08)", borderColor: "rgba(229, 83, 75, 0.45)" },
  };

  const classes = `${base} ${variants[variant]} ${className}`;

  const content = (
    <>
      {icon && <span className="flex-shrink-0 [&_svg]:w-4 [&_svg]:h-4">{icon}</span>}
      <span>{children}</span>
    </>
  );

  const style = variantStyles[variant];

  if (href) {
    if (target === "_blank" || href.startsWith("http")) {
      return (
        <a
          className={classes}
          style={style}
          href={href}
          target={target}
          rel={target === "_blank" ? "noreferrer" : undefined}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyles[variant])}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, style)}
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        href={href}
        className={classes}
        style={style}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyles[variant])}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, style)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes}
      style={style}
      onMouseEnter={(e) => { if (!disabled) Object.assign(e.currentTarget.style, hoverStyles[variant]); }}
      onMouseLeave={(e) => { if (!disabled) Object.assign(e.currentTarget.style, style); }}
    >
      {content}
    </button>
  );
}
