"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";

const nav = [
  {
    href: "/",
    label: "Intel",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    href: "/repo-scanner",
    label: "Repo Scanner",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const path = usePathname();
  const { open, toggle } = useSidebar();

  return (
    <aside
      className="glass-surface flex h-full flex-col flex-shrink-0 transition-all duration-300 ease-out"
      style={{
        width: open ? "236px" : "60px",
        borderRight: "1px solid var(--border)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Subtle top gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, var(--accent-border), transparent)" }}
      />

      {/* Logo / Brand */}
      <div
        className="flex items-center gap-2.5 h-14 flex-shrink-0 px-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          {/* Shield icon — always visible */}
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, var(--accent-muted), var(--accent-subtle))",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              boxShadow: "0 0 20px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          {/* Wordmark — hidden when collapsed */}
          <span
            className="text-[15px] font-bold tracking-tight whitespace-nowrap transition-all duration-200 overflow-hidden"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
              maxWidth: open ? "120px" : "0px",
              opacity: open ? 1 : 0,
            }}
          >
            IntelliHunt
          </span>
        </Link>

        {/* Toggle button */}
        <button
          onClick={toggle}
          className="flex-shrink-0 flex items-center justify-center rounded-lg w-7 h-7 transition-all duration-150"
          style={{ color: "var(--text-muted)", background: "transparent" }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "var(--surface-hover)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          {open ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2.5 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5 px-1.5">
          {nav.map((item) => {
            const active = path === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!open ? item.label : undefined}
                className="group flex items-center rounded-xl transition-all duration-150 relative"
                style={{
                  gap: open ? "10px" : "0",
                  padding: open ? "9px 12px" : "9px",
                  justifyContent: open ? "flex-start" : "center",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  background: active
                    ? "var(--accent-subtle)"
                    : "transparent",
                  border: active
                    ? "1px solid var(--accent-border)"
                    : "1px solid transparent",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--surface-hover)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.borderColor = "transparent";
                  }
                }}
              >
                {/* Active indicator bar */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                    style={{
                      width: "3px",
                      height: "55%",
                      background: "var(--accent)",
                      boxShadow: "0 0 8px var(--accent)",
                    }}
                  />
                )}
                {/* Icon */}
                <span className="flex-shrink-0 transition-colors duration-150">
                  {item.icon}
                </span>
                {/* Label */}
                <span
                  className="text-[13.5px] font-medium whitespace-nowrap transition-all duration-200 overflow-hidden"
                  style={{
                    maxWidth: open ? "160px" : "0px",
                    opacity: open ? 1 : 0,
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer — status */}
      <div
        className="flex items-center flex-shrink-0 px-2 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center rounded-xl w-full overflow-hidden transition-colors duration-150"
          style={{
            gap: open ? "8px" : "0",
            padding: open ? "6px 10px" : "6px",
            justifyContent: open ? "flex-start" : "center",
          }}
        >
          <span
            className="animate-dot-pulse inline-block rounded-full flex-shrink-0"
            style={{
              width: "7px",
              height: "7px",
              background: "var(--success)",
              boxShadow: "0 0 6px var(--success)",
            }}
          />
          <span
            className="text-[11.5px] font-medium whitespace-nowrap transition-all duration-200 overflow-hidden"
            style={{
              color: "var(--text-muted)",
              maxWidth: open ? "160px" : "0px",
              opacity: open ? 1 : 0,
            }}
          >
            Connected
          </span>
        </div>
      </div>
    </aside>
  );
}
