"use client";

import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Intel", subtitle: "Reports and vulnerability data" },
  "/repo-scanner": { title: "Repository Scanner", subtitle: "Security analysis for repositories" },
};

export default function Header() {
  const pathname = usePathname();
  const { open, toggle } = useSidebar();

  const pageInfo = pageTitles[pathname] || pageTitles["/"];

  return (
    <header
      className="flex items-center h-12 flex-shrink-0 px-4"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!open && (
          <button
            onClick={toggle}
            className="rounded-md p-1 transition-colors duration-150 hover:bg-[var(--surface-hover)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Open sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {pageInfo.title}
          </h1>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span className="text-sm truncate" style={{ color: "var(--text-muted)" }}>
            {pageInfo.subtitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
          style={{
            color: "var(--success)",
            background: "rgba(69, 212, 131, 0.08)",
            border: "1px solid rgba(69, 212, 131, 0.15)",
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
              style={{ background: "var(--success)" }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--success)" }}
            />
          </span>
          Live
        </div>
      </div>
    </header>
  );
}
