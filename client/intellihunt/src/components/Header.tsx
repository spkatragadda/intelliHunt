"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeContext";

const pageMeta: Record<string, { label: string; title: string }> = {
  "/":             { label: "Intel",            title: "Threat Intelligence" },
  "/repo-scanner": { label: "Repo Scanner",     title: "Repository Security Analysis" },
  "/settings":     { label: "Settings",         title: "Configuration" },
};

export default function Header() {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const meta = pageMeta[pathname] ?? pageMeta["/"];

  return (
    <header
      className="glass-surface relative flex items-center h-14 flex-shrink-0 px-5"
      style={{
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, var(--accent-border) 30%, var(--accent) 50%, var(--accent-border) 70%, transparent 100%)",
          opacity: 0.6,
        }}
      />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Section label */}
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded"
          style={{
            background: "var(--accent-subtle)",
            color: "var(--accent)",
            border: "1px solid var(--accent-border)",
            fontFamily: "var(--font-display)",
            letterSpacing: "0.12em",
          }}
        >
          {meta.label}
        </span>

        {/* Separator */}
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{ color: "var(--border-hover)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        {/* Page title */}
        <h1
          className="text-[14.5px] font-semibold truncate"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.01em",
          }}
        >
          {meta.title}
        </h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150"
          style={{ color: "var(--text-muted)", background: "transparent" }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "var(--surface-hover)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
