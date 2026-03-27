"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { useEffect, useState } from "react";
import { getUser, clearAuth, type StoredUser } from "@/lib/auth";

/* ── Route metadata ── */
const PAGE_META: Record<string, { section: string; title: string }> = {
  "/dashboard":    { section: "INTEL",    title: "Threat Intelligence"    },
  "/repo-scanner": { section: "SCANNER",  title: "Repository Analysis"    },
  "/settings":     { section: "SETTINGS", title: "Configuration"          },
};

/* ── Route icons ── */
const ROUTE_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  "/repo-scanner": (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  "/settings": (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

/* ── Live UTC clock ── */
function UtcClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const h = String(d.getUTCHours()).padStart(2, "0");
      const m = String(d.getUTCMinutes()).padStart(2, "0");
      const s = String(d.getUTCSeconds()).padStart(2, "0");
      setTime(`${h}:${m}:${s}`);
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      fontSize: "11px", fontWeight: 600,
      letterSpacing: "0.05em",
      color: "var(--text-muted)",
      minWidth: "72px",
    }}>
      {time}
      <span style={{ marginLeft: "5px", opacity: 0.5, fontSize: "9px", letterSpacing: "0.12em" }}>UTC</span>
    </span>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const meta = PAGE_META[pathname] ?? PAGE_META["/dashboard"];
  const icon = ROUTE_ICONS[pathname] ?? ROUTE_ICONS["/dashboard"];
  const [user, setUser] = useState<StoredUser | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    function close(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) setShowUserMenu(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showUserMenu]);

  function handleLogout() {
    clearAuth();
    router.push("/login");
  }

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 30,
      height: "52px",
      display: "flex", alignItems: "center",
      padding: "0 20px",
      background: theme === "dark" ? "rgba(9,12,22,0.94)" : "rgba(255,255,255,0.88)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
    }}>
      {/* Top gradient accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent 0%, var(--accent-border) 20%, var(--accent) 50%, var(--accent-border) 80%, transparent 100%)",
        opacity: 0.9, pointerEvents: "none",
      }} />

      {/* LEFT: Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
        {/* Section badge */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          padding: "3px 8px 3px 7px", borderRadius: "5px",
          background: "var(--accent-subtle)", border: "1px solid var(--accent-border)",
          color: "var(--accent)", fontSize: "9.5px", fontWeight: 700,
          letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace",
          flexShrink: 0,
        }}>
          {icon}
          {meta.section}
        </span>

        {/* Chevron separator */}
        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={1.75}
          viewBox="0 0 24 24" style={{ color: "var(--border-hover)", flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        {/* Page title */}
        <span style={{
          fontSize: "13px", fontWeight: 600,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-display)", letterSpacing: "-0.015em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{meta.title}</span>
      </div>

      {/* RIGHT: Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>

        {/* UTC Clock */}
        <UtcClock />

        {/* Divider */}
        <div style={{ width: "1px", height: "16px", background: "var(--border)" }} />

        {/* System status */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "var(--success)", boxShadow: "0 0 5px var(--success)",
            display: "inline-block", animation: "dot-pulse 3s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
          }}>ONLINE</span>
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "16px", background: "var(--border)" }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          style={{
            width: "30px", height: "30px", borderRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            color: "var(--text-muted)", cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          {theme === "dark" ? (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>

        {/* User menu */}
        {user && (
          <>
            <div style={{ width: "1px", height: "16px", background: "var(--border)" }} />
            <div style={{ position: "relative" }} data-user-menu>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "4px 8px 4px 5px",
                  background: showUserMenu ? "var(--surface-hover)" : "transparent",
                  border: "1px solid",
                  borderColor: showUserMenu ? "var(--border-hover)" : "transparent",
                  borderRadius: "8px", cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!showUserMenu) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
                onMouseLeave={e => { if (!showUserMenu) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}
              >
                {/* Avatar */}
                <div style={{
                  width: "22px", height: "22px", borderRadius: "6px",
                  background: "linear-gradient(135deg, rgba(74,158,255,0.3), rgba(74,158,255,0.1))",
                  border: "1px solid var(--accent-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 700,
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono), monospace",
                  flexShrink: 0,
                }}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 600,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-display)",
                  }}>{user.username}</span>
                  <span style={{
                    fontSize: "9px", letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono), monospace",
                    maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{user.organization.name}</span>
                </div>
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.2}
                  viewBox="0 0 24 24" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  minWidth: "180px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  boxShadow: theme === "dark" ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
                  padding: "6px",
                  zIndex: 50,
                }}>
                  {/* User info block */}
                  <div style={{
                    padding: "8px 10px 10px",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: "6px",
                  }}>
                    <div style={{
                      fontSize: "12px", fontWeight: 600,
                      color: "var(--text-primary)",
                    }}>{user.username}</div>
                    <div style={{
                      fontSize: "11px", color: "var(--text-muted)",
                      marginTop: "1px",
                    }}>{user.email}</div>
                    <div style={{
                      marginTop: "5px", display: "inline-flex", alignItems: "center", gap: "4px",
                      padding: "2px 7px",
                      background: "var(--accent-subtle)", border: "1px solid var(--accent-border)",
                      borderRadius: "4px",
                    }}>
                      <svg width="9" height="9" fill="none" stroke="var(--accent)" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
                        color: "var(--accent)", fontFamily: "var(--font-mono), monospace",
                      }}>{user.organization.name}</span>
                    </div>
                  </div>

                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    style={{
                      width: "100%", padding: "7px 10px",
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "transparent", border: "none", borderRadius: "7px",
                      color: "#ef4444", cursor: "pointer",
                      fontSize: "12px", fontWeight: 600,
                      textAlign: "left", transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
