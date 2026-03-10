"use client";

import { ReactNode, useState } from "react";

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
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        border: `1px solid ${hovered ? "var(--accent-border)" : "var(--border)"}`,
        borderTopColor: "rgba(255,255,255,0.06)",
        boxShadow: hovered
          ? "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--accent-border)"
          : "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.5)",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.13em]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
          >
            {title}
          </span>
          {icon && (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg [&_svg]:w-4 [&_svg]:h-4 transition-all duration-200"
              style={{
                background: hovered ? "var(--accent-tint)" : "var(--accent-muted)",
                color: "var(--accent)",
                border: "1px solid var(--accent-border)",
                boxShadow: hovered ? "0 0 12px rgba(255,255,255,0.15)" : "none",
              }}
            >
              {icon}
            </div>
          )}
        </div>
        <div
          className="text-2xl font-bold tabular-nums"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </div>
        {subtitle && (
          <div className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
