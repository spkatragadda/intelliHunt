"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAdminSummary, fetchAdminActivity, deleteAdminUser,
  fetchPendingUsers, approveUser, rejectUser,
  type AdminOrgRow, type AdminUserRow, type AdminActivityRow, type PendingUserRow,
} from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

/* ── helpers ── */
function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtAbsTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

const ACTION_COLORS: Record<string, string> = {
  login:       "#4a9eff",
  register:    "#22c55e",
  report_run:  "#a855f7",
  repo_scan:   "#f59e0b",
  cmdb_import: "#06b6d4",
  yaml_upload: "#64748b",
};
const ACTION_LABELS: Record<string, string> = {
  login:       "LOGIN",
  register:    "REGISTER",
  report_run:  "REPORT RUN",
  repo_scan:   "REPO SCAN",
  cmdb_import: "CMDB IMPORT",
  yaml_upload: "YAML UPLOAD",
};
const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  started:   "#f59e0b",
  error:     "#ef4444",
};

/* ── styles (standalone — no AppShell, no ThemeProvider) ── */
const S = {
  page: {
    minHeight: "100vh",
    background: "#0d0f14",
    color: "#e2e8f0",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column" as const,
  },
  topbar: {
    height: "48px",
    background: "#111318",
    borderBottom: "1px solid #1e2330",
    display: "flex",
    alignItems: "center",
    padding: "0 20px",
    gap: "12px",
    flexShrink: 0,
  },
  logo: {
    display: "flex", alignItems: "center", gap: "8px",
    fontFamily: "monospace", fontWeight: 700, fontSize: "13px",
    color: "#4a9eff", letterSpacing: "0.04em", textDecoration: "none",
  },
  divider: { width: "1px", height: "20px", background: "#1e2330" },
  breadcrumb: {
    fontFamily: "monospace", fontSize: "11px",
    color: "#475569", letterSpacing: "0.08em",
  },
  topbarRight: {
    marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px",
  },
  userChip: {
    display: "flex", alignItems: "center", gap: "7px",
    padding: "3px 10px 3px 4px",
    background: "#1a1f2e", border: "1px solid #1e2330",
    borderRadius: "999px", fontSize: "12px", color: "#94a3b8",
  },
  userAvatar: {
    width: "22px", height: "22px", borderRadius: "50%",
    background: "rgba(74,158,255,0.15)", border: "1px solid rgba(74,158,255,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "monospace", fontSize: "10px", fontWeight: 700, color: "#4a9eff",
    flexShrink: 0,
  },
  logoutBtn: {
    padding: "4px 10px", borderRadius: "5px",
    background: "transparent", border: "1px solid #1e2330",
    color: "#64748b", fontSize: "11px", cursor: "pointer",
    fontFamily: "monospace", letterSpacing: "0.06em",
    transition: "color 0.15s, border-color 0.15s",
  },
  backBtn: {
    padding: "4px 10px", borderRadius: "5px",
    background: "transparent", border: "1px solid #1e2330",
    color: "#64748b", fontSize: "11px", cursor: "pointer",
    fontFamily: "monospace", letterSpacing: "0.06em",
    textDecoration: "none", display: "flex", alignItems: "center", gap: "5px",
    transition: "color 0.15s, border-color 0.15s",
  },
  body: {
    flex: 1, display: "flex",
  },
  sidebar: {
    width: "200px", flexShrink: 0,
    background: "#111318", borderRight: "1px solid #1e2330",
    padding: "16px 0",
    display: "flex", flexDirection: "column" as const, gap: "2px",
  },
  sidebarSection: {
    padding: "6px 16px 4px",
    fontFamily: "monospace", fontSize: "9px", fontWeight: 700,
    letterSpacing: "0.12em", color: "#374151",
  },
  navLink: (active: boolean) => ({
    display: "flex", alignItems: "center", gap: "9px",
    padding: "8px 16px",
    background: active ? "rgba(74,158,255,0.08)" : "transparent",
    borderLeft: `2px solid ${active ? "#4a9eff" : "transparent"}`,
    color: active ? "#4a9eff" : "#64748b",
    fontSize: "13px", fontWeight: active ? 600 : 400,
    cursor: "pointer", transition: "all 0.12s",
    userSelect: "none" as const,
  }),
  main: {
    flex: 1, padding: "24px 28px", overflowX: "auto" as const,
  },
  pageTitle: {
    fontFamily: "monospace", fontSize: "18px", fontWeight: 700,
    color: "#e2e8f0", letterSpacing: "-0.01em", marginBottom: "4px",
  },
  pageSubtitle: {
    fontFamily: "monospace", fontSize: "11px", color: "#475569",
    letterSpacing: "0.06em", marginBottom: "20px",
  },
  statsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "10px", marginBottom: "24px",
  },
  statCard: {
    background: "#111318", border: "1px solid #1e2330",
    borderRadius: "8px", padding: "14px 18px",
  },
  statLabel: {
    fontFamily: "monospace", fontSize: "9px", fontWeight: 700,
    letterSpacing: "0.14em", color: "#374151", marginBottom: "6px",
  },
  statValue: {
    fontFamily: "monospace", fontSize: "26px", fontWeight: 700,
    color: "#e2e8f0", letterSpacing: "-0.02em",
  },
  card: {
    background: "#111318", border: "1px solid #1e2330",
    borderRadius: "8px", overflow: "hidden" as const,
  },
  cardHeader: {
    padding: "10px 16px", borderBottom: "1px solid #1e2330",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#0f1117",
  },
  cardTitle: {
    fontFamily: "monospace", fontSize: "10px", fontWeight: 700,
    letterSpacing: "0.14em", color: "#4a9eff",
  },
  th: {
    padding: "8px 14px", textAlign: "left" as const,
    fontFamily: "monospace", fontSize: "9px", fontWeight: 700,
    letterSpacing: "0.12em", color: "#374151",
    borderBottom: "1px solid #1e2330", whiteSpace: "nowrap" as const,
    background: "#0f1117",
  },
  td: {
    padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" as const,
  },
  tdMono: {
    padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontFamily: "monospace", fontSize: "11px", color: "#64748b",
    whiteSpace: "nowrap" as const,
  },
  filterBar: {
    padding: "10px 16px", borderBottom: "1px solid #1e2330",
    display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" as const,
    background: "#0f1117",
  },
  select: {
    background: "#0d0f14", border: "1px solid #1e2330",
    borderRadius: "5px", color: "#94a3b8",
    padding: "4px 10px", fontSize: "12px",
    fontFamily: "monospace", outline: "none", cursor: "pointer",
  },
  clearBtn: {
    padding: "3px 10px", borderRadius: "5px",
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    color: "#ef4444", fontSize: "10px", fontWeight: 700, cursor: "pointer",
    fontFamily: "monospace",
  },
  pageBtn: (disabled: boolean) => ({
    padding: "4px 12px", borderRadius: "5px",
    background: "#0d0f14", border: "1px solid #1e2330",
    color: disabled ? "#374151" : "#94a3b8",
    fontSize: "11px", cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "monospace",
  }),
  refreshBtn: {
    padding: "4px 12px", borderRadius: "5px",
    background: "rgba(74,158,255,0.08)", border: "1px solid rgba(74,158,255,0.2)",
    color: "#4a9eff", fontSize: "10px", fontWeight: 700, cursor: "pointer",
    fontFamily: "monospace", letterSpacing: "0.08em",
  },
  emptyRow: {
    padding: "36px", textAlign: "center" as const,
    color: "#374151", fontFamily: "monospace", fontSize: "12px",
  },
  errorBanner: {
    padding: "10px 16px", background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px",
    color: "#ef4444", fontFamily: "monospace", fontSize: "12px",
    marginBottom: "16px",
  },
  forbiddenWrap: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    flexDirection: "column" as const, gap: "14px", padding: "60px",
  },
};

/* ── nav icon ── */
const ICONS = {
  dashboard: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  orgs: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  ),
  users: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  activity: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  ),
  requests: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
};

/* ══════════════════════════════════════════════════════════ */

type View = "dashboard" | "orgs" | "users" | "activity" | "requests";

export default function AdminConsole() {
  const router = useRouter();
  const [view, setView]       = useState<View>("dashboard");
  const [orgs, setOrgs]       = useState<AdminOrgRow[]>([]);
  const [users, setUsers]     = useState<AdminUserRow[]>([]);
  const [activity, setActivity]   = useState<AdminActivityRow[]>([]);
  const [actTotal, setActTotal]   = useState(0);
  const [actOffset, setActOffset] = useState(0);
  const [orgFilter, setOrgFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actLoading, setActLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError]     = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [currentUser] = useState(() => typeof window !== "undefined" ? getUser() : null);
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pendingUsers, setPendingUsers] = useState<PendingUserRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [actioningUser, setActioningUser] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    setLoading(true);
    fetchAdminSummary()
      .then(({ orgs, users }) => { setOrgs(orgs); setUsers(users); setLastRefresh(new Date()); })
      .catch(e => {
        if (e.message === "403") setForbidden(true);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadActivity = useCallback(() => {
    setActLoading(true);
    fetchAdminActivity(orgFilter || undefined, actionFilter || undefined, 50, actOffset)
      .then(({ total, rows }) => { setActTotal(total); setActivity(rows); setLastRefresh(new Date()); })
      .catch(e => setError(e.message))
      .finally(() => setActLoading(false));
  }, [orgFilter, actionFilter, actOffset]);

  const loadPending = useCallback(() => {
    setPendingLoading(true);
    fetchPendingUsers()
      .then(rows => setPendingUsers(rows))
      .catch(e => setError(e.message))
      .finally(() => setPendingLoading(false));
  }, []);

  useEffect(() => { loadSummary(); loadPending(); }, [loadSummary, loadPending]);

  useEffect(() => {
    if (view === "activity") loadActivity();
    if (view === "requests") loadPending();
  }, [view, loadActivity, loadPending]);

  async function handleApprove(userId: string) {
    setActioningUser(userId);
    try {
      await approveUser(userId);
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e: any) {
      setError(e.message ?? "Approve failed.");
    } finally {
      setActioningUser(null);
    }
  }

  async function handleReject(userId: string) {
    setActioningUser(userId);
    try {
      await rejectUser(userId);
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e: any) {
      setError(e.message ?? "Reject failed.");
    } finally {
      setActioningUser(null);
    }
  }

  function handleLogout() {
    clearAuth();
    router.push("/login");
  }

  async function handleDeleteUser() {
    if (!confirmUser) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAdminUser(confirmUser.id);
      setUsers(prev => prev.filter(u => u.id !== confirmUser.id));
      setConfirmUser(null);
      loadSummary();
    } catch (e: any) {
      setDeleteError(e.message ?? "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  /* ── forbidden ── */
  if (forbidden) return (
    <div style={S.page}>
      <div style={S.topbar}>
        <a href="/dashboard" style={S.logo}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          IntelliHunt <span style={{ color: "#374151", fontWeight: 400 }}>/ admin</span>
        </a>
      </div>
      <div style={S.forbiddenWrap}>
        <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" fill="none" stroke="#ef4444" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "15px", color: "#e2e8f0", marginBottom: "6px" }}>403 — Access Denied</div>
          <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#475569" }}>Your account does not have staff privileges.</div>
          <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#374151", marginTop: "4px" }}>
            Promote via: <code style={{ background: "#111318", padding: "2px 6px", borderRadius: "4px", color: "#64748b" }}>manage.py shell -c "User.objects.filter(username=&apos;you&apos;).update(is_staff=True)"</code>
          </div>
        </div>
        <a href="/dashboard" style={{ ...S.backBtn, color: "#4a9eff", borderColor: "rgba(74,158,255,0.3)" }}>← Back to App</a>
      </div>
    </div>
  );

  const totalReports = orgs.reduce((s, o) => s + o.report_runs, 0);
  const totalScans   = orgs.reduce((s, o) => s + o.repo_scans,  0);
  const totalActions = orgs.reduce((s, o) => s + o.total_actions, 0);

  return (
    <div style={S.page}>

      {/* ── Top bar ── */}
      <div style={S.topbar}>
        <a href="/dashboard" style={S.logo}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          INTELLIHUNT
        </a>
        <div style={S.divider} />
        <span style={{ ...S.breadcrumb, color: "#4a9eff" }}>ADMIN CONSOLE</span>
        <div style={S.topbarRight}>
          {lastRefresh && (
            <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#374151" }}>
              refreshed {relTime(lastRefresh.toISOString())}
            </span>
          )}
          {currentUser && (
            <div style={S.userChip}>
              <div style={S.userAvatar}>{currentUser.username?.charAt(0).toUpperCase() ?? "A"}</div>
              <span>{currentUser.username}</span>
            </div>
          )}
          <a href="/dashboard" style={S.backBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2a3147"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#64748b"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1e2330"; }}>
            ← App
          </a>
          <button style={S.logoutBtn} onClick={handleLogout}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "#1e2330"; }}>
            LOGOUT
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={S.body}>

        {/* ── Sidebar ── */}
        <nav style={S.sidebar}>
          <div style={S.sidebarSection}>NAVIGATION</div>
          {([
            { id: "dashboard", label: "Dashboard",     icon: ICONS.dashboard },
            { id: "orgs",      label: "Organizations", icon: ICONS.orgs },
            { id: "users",     label: "Users",         icon: ICONS.users },
            { id: "activity",  label: "Activity Log",  icon: ICONS.activity },
            { id: "requests",  label: "Requests",      icon: ICONS.requests },
          ] as const).map(item => (
            <div key={item.id}
              style={S.navLink(view === item.id)}
              onClick={() => setView(item.id)}
              onMouseEnter={e => { if (view !== item.id) { (e.currentTarget as HTMLDivElement).style.color = "#94a3b8"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; } }}
              onMouseLeave={e => { if (view !== item.id) { (e.currentTarget as HTMLDivElement).style.color = "#64748b"; (e.currentTarget as HTMLDivElement).style.background = "transparent"; } }}
            >
              {item.icon}
              {item.label}
            </div>
          ))}

          {/* Quick counts */}
          {!loading && (
            <>
              <div style={{ ...S.sidebarSection, marginTop: "16px" }}>QUICK STATS</div>
              {[
                { label: "Orgs",    value: orgs.length },
                { label: "Users",   value: users.length },
                { label: "Pending", value: pendingUsers.length, highlight: pendingUsers.length > 0 },
                { label: "Reports", value: totalReports },
                { label: "Scans",   value: totalScans },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 16px", fontSize: "11px" }}>
                  <span style={{ color: "#374151", fontFamily: "monospace" }}>{s.label}</span>
                  <span style={{ color: (s as any).highlight ? "#f59e0b" : "#64748b", fontFamily: "monospace", fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </>
          )}
        </nav>

        {/* ── Main ── */}
        <main style={S.main}>
          {error && <div style={S.errorBanner}>Error: {error}</div>}

          {loading && view !== "activity" && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <div style={{ display: "inline-block", width: "20px", height: "20px", borderRadius: "50%", border: "2px solid rgba(74,158,255,0.15)", borderTopColor: "#4a9eff", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}

          {/* ─────────────────────────────────────────
              DASHBOARD
             ───────────────────────────────────────── */}
          {!loading && view === "dashboard" && (
            <>
              <div style={S.pageTitle}>Platform Overview</div>
              <div style={S.pageSubtitle}>SUMMARY — {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase()}</div>

              <div style={S.statsGrid}>
                {[
                  { label: "ORGANIZATIONS",    value: orgs.length,          color: "#4a9eff" },
                  { label: "ACTIVE USERS",     value: users.length,         color: "#22c55e" },
                  { label: "PENDING REQUESTS", value: pendingUsers.length,  color: "#f59e0b" },
                  { label: "REPORT RUNS",      value: totalReports,         color: "#a855f7" },
                  { label: "REPO SCANS",       value: totalScans,           color: "#f59e0b" },
                  { label: "TOTAL ACTIONS",    value: totalActions,         color: "#06b6d4" },
                ].map(s => (
                  <div key={s.label} style={S.statCard}>
                    <div style={{ ...S.statLabel, color: s.color + "99" }}>{s.label}</div>
                    <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Recent orgs summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={S.card}>
                  <div style={S.cardHeader}>
                    <span style={S.cardTitle}>MOST ACTIVE ORGANIZATIONS</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["ORG", "REPORTS", "SCANS", "LAST ACTIVE"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...orgs].sort((a, b) => b.total_actions - a.total_actions).slice(0, 6).map(o => (
                        <tr key={o.id}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(74,158,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                          onClick={() => { setOrgFilter(o.id); setView("activity"); }}
                        >
                          <td style={{ ...S.td, color: "#e2e8f0", fontWeight: 500 }}>{o.name}</td>
                          <td style={S.tdMono}>{o.report_runs}</td>
                          <td style={S.tdMono}>{o.repo_scans}</td>
                          <td style={S.tdMono}>{relTime(o.last_active)}</td>
                        </tr>
                      ))}
                      {orgs.length === 0 && <tr><td colSpan={4} style={S.emptyRow}>No organizations yet</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div style={S.card}>
                  <div style={S.cardHeader}>
                    <span style={S.cardTitle}>MOST ACTIVE USERS</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["USER", "ORG", "REPORTS", "SCANS"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...users].sort((a, b) => b.total_actions - a.total_actions).slice(0, 6).map(u => (
                        <tr key={u.id}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(74,158,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                        >
                          <td style={{ ...S.td, color: "#e2e8f0", fontWeight: 500 }}>{u.username}</td>
                          <td style={{ ...S.tdMono, color: "#4a9eff88", fontSize: "10px" }}>{u.org_name}</td>
                          <td style={S.tdMono}>{u.report_runs}</td>
                          <td style={S.tdMono}>{u.repo_scans}</td>
                        </tr>
                      ))}
                      {users.length === 0 && <tr><td colSpan={4} style={S.emptyRow}>No users yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ─────────────────────────────────────────
              ORGANIZATIONS
             ───────────────────────────────────────── */}
          {!loading && view === "orgs" && (
            <>
              <div style={S.pageTitle}>Organizations</div>
              <div style={S.pageSubtitle}>{orgs.length} TOTAL — CLICK ROW TO FILTER ACTIVITY</div>
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>ALL ORGANIZATIONS</span>
                  <button style={S.refreshBtn} onClick={loadSummary}>↻ REFRESH</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["ORGANIZATION", "CREATED", "MEMBERS", "REPORT RUNS", "REPO SCANS", "CMDB IMPORTS", "TOTAL ACTIONS", "LAST ACTIVE"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orgs.map(o => (
                        <tr key={o.id}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(74,158,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                          onClick={() => { setOrgFilter(o.id); setView("activity"); }}
                        >
                          <td style={{ ...S.td, color: "#e2e8f0", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "20px", height: "20px", borderRadius: "5px", background: "rgba(74,158,255,0.1)", border: "1px solid rgba(74,158,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: "9px", fontWeight: 700, color: "#4a9eff", flexShrink: 0 }}>
                                {o.name.charAt(0).toUpperCase()}
                              </div>
                              {o.name}
                            </div>
                          </td>
                          <td style={S.tdMono}>{fmtAbsTime(o.created_at)}</td>
                          <td style={S.tdMono}>{o.member_count}</td>
                          <td style={S.tdMono}>{o.report_runs}</td>
                          <td style={S.tdMono}>{o.repo_scans}</td>
                          <td style={S.tdMono}>{o.cmdb_imports}</td>
                          <td style={{ ...S.tdMono, color: "#94a3b8", fontWeight: 700 }}>{o.total_actions}</td>
                          <td style={S.tdMono}>{relTime(o.last_active)}</td>
                        </tr>
                      ))}
                      {orgs.length === 0 && <tr><td colSpan={8} style={S.emptyRow}>No organizations yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ─────────────────────────────────────────
              USERS
             ───────────────────────────────────────── */}
          {!loading && view === "users" && (
            <>
              <div style={S.pageTitle}>Users</div>
              <div style={S.pageSubtitle}>{users.length} REGISTERED ACCOUNTS</div>
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>ALL USERS</span>
                  <button style={S.refreshBtn} onClick={loadSummary}>↻ REFRESH</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["USER", "EMAIL", "ORGANIZATION", "REPORT RUNS", "REPO SCANS", "TOTAL ACTIONS", "LAST ACTIVE", ""].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(74,158,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                        >
                          <td style={{ ...S.td, color: "#e2e8f0", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "20px", height: "20px", borderRadius: "5px", background: "rgba(74,158,255,0.1)", border: "1px solid rgba(74,158,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: "9px", fontWeight: 700, color: "#4a9eff", flexShrink: 0 }}>
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                              {u.username}
                            </div>
                          </td>
                          <td style={S.td}>{u.email}</td>
                          <td style={S.td}>
                            <span style={{ padding: "2px 7px", borderRadius: "4px", background: "rgba(74,158,255,0.07)", border: "1px solid rgba(74,158,255,0.15)", color: "#4a9eff", fontFamily: "monospace", fontSize: "10px", fontWeight: 700 }}>
                              {u.org_name}
                            </span>
                          </td>
                          <td style={S.tdMono}>{u.report_runs}</td>
                          <td style={S.tdMono}>{u.repo_scans}</td>
                          <td style={{ ...S.tdMono, color: "#94a3b8", fontWeight: 700 }}>{u.total_actions}</td>
                          <td style={S.tdMono}>{relTime(u.last_active)}</td>
                          <td style={{ ...S.td, textAlign: "right" as const }}>
                            {u.email.toLowerCase() !== "admin@admin.com" && (
                              <button
                                title={`Delete ${u.username}`}
                                onClick={e => { e.stopPropagation(); setConfirmUser(u); setDeleteError(""); }}
                                style={{
                                  padding: "4px 8px", borderRadius: "5px",
                                  background: "transparent",
                                  border: "1px solid rgba(239,68,68,0.2)",
                                  color: "#ef444488", fontSize: "10px",
                                  cursor: "pointer", fontFamily: "monospace",
                                  letterSpacing: "0.06em", transition: "all 0.15s",
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.5)";
                                  e.currentTarget.style.color = "#ef4444";
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)";
                                  e.currentTarget.style.color = "#ef444488";
                                }}
                              >
                                DELETE
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && <tr><td colSpan={8} style={S.emptyRow}>No users yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ─────────────────────────────────────────
              ACTIVITY LOG
             ───────────────────────────────────────── */}
          {view === "activity" && (
            <>
              <div style={S.pageTitle}>Activity Log</div>
              <div style={S.pageSubtitle}>ALL USER TRANSACTIONS — REAL-TIME AUDIT TRAIL</div>
              <div style={S.card}>
                {/* Filter bar */}
                <div style={S.filterBar}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", color: "#374151" }}>ORG</span>
                    <select value={orgFilter} onChange={e => { setOrgFilter(e.target.value); setActOffset(0); }} style={S.select}>
                      <option value="">All organizations</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", color: "#374151" }}>ACTION</span>
                    <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setActOffset(0); }} style={S.select}>
                      <option value="">All actions</option>
                      {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {(orgFilter || actionFilter) && (
                    <button style={S.clearBtn} onClick={() => { setOrgFilter(""); setActionFilter(""); setActOffset(0); }}>
                      CLEAR FILTERS
                    </button>
                  )}
                  <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: "10px", color: "#374151" }}>
                    {actTotal} TOTAL
                  </span>
                  <button style={S.refreshBtn} onClick={loadActivity}>↻ REFRESH</button>
                </div>

                {actLoading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <div style={{ display: "inline-block", width: "18px", height: "18px", borderRadius: "50%", border: "2px solid rgba(74,158,255,0.15)", borderTopColor: "#4a9eff", animation: "spin 0.8s linear infinite" }} />
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["TIME", "ACTION", "USER", "ORGANIZATION", "DETAIL", "STATUS", "DURATION"].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activity.map(row => (
                          <tr key={row.id}
                            onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(74,158,255,0.04)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                          >
                            <td style={S.tdMono}>{fmtAbsTime(row.created_at)}</td>
                            <td style={S.td}>
                              <span style={{
                                display: "inline-block",
                                padding: "2px 7px", borderRadius: "4px",
                                background: `${ACTION_COLORS[row.action] ?? "#64748b"}14`,
                                border: `1px solid ${ACTION_COLORS[row.action] ?? "#64748b"}35`,
                                color: ACTION_COLORS[row.action] ?? "#64748b",
                                fontFamily: "monospace", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
                              }}>
                                {ACTION_LABELS[row.action] ?? row.action.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ ...S.tdMono, color: "#94a3b8" }}>{row.username}</td>
                            <td style={S.td}>{row.org_name}</td>
                            <td style={S.td}>
                              <span style={{ maxWidth: "260px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#475569", fontSize: "11px", fontFamily: "monospace" }} title={row.detail}>
                                {row.detail || "—"}
                              </span>
                            </td>
                            <td style={S.td}>
                              <span style={{ fontFamily: "monospace", fontSize: "9px", fontWeight: 700, color: STATUS_COLORS[row.status] ?? "#64748b" }}>
                                {row.status.toUpperCase()}
                              </span>
                            </td>
                            <td style={S.tdMono}>{fmtDuration(row.duration_ms)}</td>
                          </tr>
                        ))}
                        {activity.length === 0 && <tr><td colSpan={7} style={S.emptyRow}>No activity yet</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {actTotal > 50 && (
                  <div style={{ padding: "10px 16px", borderTop: "1px solid #1e2330", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", background: "#0f1117" }}>
                    <button disabled={actOffset === 0} onClick={() => setActOffset(Math.max(0, actOffset - 50))} style={S.pageBtn(actOffset === 0)}>← Prev</button>
                    <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#374151" }}>
                      {actOffset + 1}–{Math.min(actOffset + 50, actTotal)} of {actTotal}
                    </span>
                    <button disabled={actOffset + 50 >= actTotal} onClick={() => setActOffset(actOffset + 50)} style={S.pageBtn(actOffset + 50 >= actTotal)}>Next →</button>
                  </div>
                )}
              </div>
            </>
          )}
          {/* ─────────────────────────────────────────
              PENDING REQUESTS
             ───────────────────────────────────────── */}
          {view === "requests" && (
            <>
              <div style={S.pageTitle}>Access Requests</div>
              <div style={S.pageSubtitle}>
                {pendingUsers.length} PENDING — APPROVE TO GRANT ACCESS, REJECT TO REMOVE
              </div>
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>PENDING ACCOUNTS</span>
                  <button style={S.refreshBtn} onClick={loadPending}>↻ REFRESH</button>
                </div>
                {pendingLoading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <div style={{ display: "inline-block", width: "18px", height: "18px", borderRadius: "50%", border: "2px solid rgba(74,158,255,0.15)", borderTopColor: "#4a9eff", animation: "spin 0.8s linear infinite" }} />
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["USER", "EMAIL", "ORGANIZATION", "REQUESTED", ""].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUsers.map(u => {
                          const acting = actioningUser === u.id;
                          return (
                            <tr key={u.id}
                              onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(245,158,11,0.03)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                            >
                              <td style={{ ...S.td, color: "#e2e8f0", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div style={{ width: "20px", height: "20px", borderRadius: "5px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: "9px", fontWeight: 700, color: "#f59e0b", flexShrink: 0 }}>
                                    {u.username.charAt(0).toUpperCase()}
                                  </div>
                                  {u.username}
                                </div>
                              </td>
                              <td style={S.td}>{u.email}</td>
                              <td style={S.td}>
                                <span style={{ padding: "2px 7px", borderRadius: "4px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b", fontFamily: "monospace", fontSize: "10px", fontWeight: 700 }}>
                                  {u.org_name}
                                </span>
                              </td>
                              <td style={S.tdMono}>{relTime(u.joined_at)}</td>
                              <td style={{ ...S.td, textAlign: "right" as const }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                                  <button
                                    disabled={acting}
                                    onClick={() => handleApprove(u.id)}
                                    style={{
                                      padding: "4px 10px", borderRadius: "5px",
                                      background: acting ? "transparent" : "rgba(34,197,94,0.08)",
                                      border: "1px solid rgba(34,197,94,0.25)",
                                      color: acting ? "#374151" : "#22c55e",
                                      fontSize: "10px", fontWeight: 700,
                                      cursor: acting ? "not-allowed" : "pointer",
                                      fontFamily: "monospace", letterSpacing: "0.06em",
                                      transition: "all 0.15s",
                                    }}
                                    onMouseEnter={e => { if (!acting) { e.currentTarget.style.background = "rgba(34,197,94,0.15)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.5)"; } }}
                                    onMouseLeave={e => { if (!acting) { e.currentTarget.style.background = "rgba(34,197,94,0.08)"; e.currentTarget.style.borderColor = "rgba(34,197,94,0.25)"; } }}
                                  >
                                    {acting ? "…" : "APPROVE"}
                                  </button>
                                  <button
                                    disabled={acting}
                                    onClick={() => handleReject(u.id)}
                                    style={{
                                      padding: "4px 10px", borderRadius: "5px",
                                      background: "transparent",
                                      border: "1px solid rgba(239,68,68,0.2)",
                                      color: acting ? "#374151" : "#ef444488",
                                      fontSize: "10px", fontWeight: 700,
                                      cursor: acting ? "not-allowed" : "pointer",
                                      fontFamily: "monospace", letterSpacing: "0.06em",
                                      transition: "all 0.15s",
                                    }}
                                    onMouseEnter={e => { if (!acting) { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.5)"; e.currentTarget.style.color = "#ef4444"; } }}
                                    onMouseLeave={e => { if (!acting) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#ef444488"; } }}
                                  >
                                    REJECT
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {pendingUsers.length === 0 && (
                          <tr><td colSpan={5} style={S.emptyRow}>No pending access requests</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

        </main>
      </div>

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Delete confirmation modal ── */}
      {confirmUser && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => { if (!deleting) { setConfirmUser(null); setDeleteError(""); } }}>
          <div style={{
            background: "#111318", border: "1px solid #2a3147",
            borderTop: "2px solid #ef4444",
            borderRadius: "10px", padding: "24px 28px",
            width: "380px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>

            {/* Icon + title */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "13px", color: "#e2e8f0" }}>
                  Delete Account
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                  THIS ACTION CANNOT BE UNDONE
                </div>
              </div>
            </div>

            {/* User info */}
            <div style={{
              background: "#0d0f14", border: "1px solid #1e2330",
              borderRadius: "6px", padding: "10px 14px",
              marginBottom: "16px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#ef4444",
              }}>
                {confirmUser.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#e2e8f0" }}>
                  {confirmUser.username}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#475569" }}>
                  {confirmUser.email} · {confirmUser.org_name}
                </div>
              </div>
            </div>

            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#64748b", marginBottom: "18px", lineHeight: 1.6 }}>
              The user's account and profile will be permanently removed.
              Their activity log entries and scan records will be retained for auditing.
            </div>

            {deleteError && (
              <div style={{
                padding: "8px 12px", borderRadius: "6px", marginBottom: "14px",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                fontFamily: "monospace", fontSize: "11px", color: "#ef4444",
              }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                disabled={deleting}
                onClick={() => { setConfirmUser(null); setDeleteError(""); }}
                style={{
                  padding: "7px 16px", borderRadius: "6px",
                  background: "transparent", border: "1px solid #1e2330",
                  color: "#64748b", fontSize: "11px", fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "monospace", letterSpacing: "0.06em",
                }}
              >
                CANCEL
              </button>
              <button
                disabled={deleting}
                onClick={handleDeleteUser}
                style={{
                  padding: "7px 16px", borderRadius: "6px",
                  background: deleting ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#ef4444", fontSize: "11px", fontWeight: 700,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "monospace", letterSpacing: "0.06em",
                  display: "flex", alignItems: "center", gap: "6px",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting && (
                  <span style={{
                    display: "inline-block", width: "10px", height: "10px",
                    borderRadius: "50%", border: "2px solid rgba(239,68,68,0.3)",
                    borderTopColor: "#ef4444", animation: "spin 0.7s linear infinite",
                  }} />
                )}
                {deleting ? "DELETING…" : "DELETE USER"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
