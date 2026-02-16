import { ReactNode } from "react";

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-lg p-4 transition-colors duration-150"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {title}
          </div>
          <div className="mt-1 text-xl font-medium" style={{ color: "var(--text-primary)" }}>
            {value}
          </div>
        </div>
        {icon && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md [&_svg]:w-4 [&_svg]:h-4"
            style={{ background: "var(--accent-muted)", color: "var(--accent)" }}
          >
            {icon}
          </div>
        )}
      </div>
      {subtitle && (
        <div className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
