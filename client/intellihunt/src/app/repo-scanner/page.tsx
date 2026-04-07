"use client";

import { useState, useEffect, useRef } from "react";
import { scanRepo, checkTaskStatus, fetchScanHistory, fetchScanReport, deleteScan, cancelScan, ServerScanRecord } from "@/lib/api";
import ReactMarkdown from "react-markdown";

/* ── Types ── */
type InputMode = "url" | "file";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── ScanTerminal: dramatic animated scan visualization ── */
function ScanTerminal({ progress, message }: { progress: number; message: string }) {
  const FILES = [
    { name: "package.json",       group: "deps" },
    { name: "package-lock.json",  group: "deps" },
    { name: "requirements.txt",   group: "deps" },
    { name: "Gemfile.lock",       group: "deps" },
    { name: "Dockerfile",         group: "infra" },
    { name: "docker-compose.yml", group: "infra" },
    { name: ".env.example",       group: "secrets" },
    { name: "config.yaml",        group: "infra" },
    { name: "src/auth.ts",        group: "code" },
    { name: "src/db.ts",          group: "code" },
    { name: "src/api.ts",         group: "code" },
    { name: "lib/crypto.ts",      group: "code" },
    { name: "lib/session.ts",     group: "code" },
    { name: "src/index.ts",       group: "code" },
    { name: "README.md",          group: "docs" },
  ];
  const GROUP_COLORS: Record<string, string> = {
    deps:    "#f59e0b",
    infra:   "var(--accent)",
    secrets: "var(--danger)",
    code:    "var(--success)",
    docs:    "var(--text-muted)",
  };
  const LOGS = [
    { at: 0,  text: "$ initializing scan engine",   color: "var(--success)" },
    { at: 10, text: "→ cloning repository",          color: "var(--text-secondary)" },
    { at: 25, text: "→ indexing file tree",           color: "var(--text-secondary)" },
    { at: 40, text: "→ scanning dependencies",        color: "var(--text-secondary)" },
    { at: 55, text: "→ checking CVE database",        color: "#f59e0b" },
    { at: 70, text: "→ analyzing secrets exposure",   color: "#f59e0b" },
    { at: 85, text: "→ generating threat report",     color: "var(--text-secondary)" },
  ];

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderTop: "2px solid #f59e0b",
      borderRadius: "12px",
      overflow: "hidden",
    }}>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#f59e0b", boxShadow: "0 0 8px #f59e0b",
            display: "inline-block", animation: "dot-pulse 1.5s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em",
            color: "#f59e0b",
          }}>SCAN OPERATION IN PROGRESS</span>
        </div>
        <span style={{
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: "14px", fontWeight: 800, color: "#f59e0b", letterSpacing: "-0.02em",
        }}>{progress}%</span>
      </div>

      {/* Body: file grid + log */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px" }}>
        {/* File analysis grid */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px", marginBottom: "12px",
          }}>
            {FILES.map((file, i) => {
              const scanned = (i / FILES.length) * 100 < progress;
              const c = GROUP_COLORS[file.group];
              return (
                <div key={file.name} style={{
                  padding: "5px 7px", borderRadius: "5px",
                  background: scanned ? `${c}12` : "var(--surface)",
                  border: `1px solid ${scanned ? `${c}35` : "var(--border)"}`,
                  display: "flex", alignItems: "center", gap: "5px",
                  opacity: scanned ? 1 : 0.3,
                  transition: "all 0.4s ease",
                }}>
                  <span style={{
                    color: scanned ? c : "var(--text-muted)",
                    fontSize: "8px", flexShrink: 0,
                    fontFamily: "var(--font-mono), monospace", fontWeight: 700,
                  }}>{scanned ? "✓" : "○"}</span>
                  <span style={{
                    color: scanned ? "var(--text-secondary)" : "var(--text-muted)",
                    fontSize: "9.5px",
                    fontFamily: "var(--font-mono), ui-monospace, monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{file.name}</span>
                </div>
              );
            })}
          </div>
          {/* Progress bar */}
          <div style={{ height: "3px", background: "var(--surface-raised)", borderRadius: "99px", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
              borderRadius: "99px",
              transition: "width 0.5s ease",
              boxShadow: "0 0 8px rgba(245,158,11,0.5)",
            }} />
          </div>
        </div>

        {/* Terminal log */}
        <div style={{
          padding: "14px",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: "10.5px", lineHeight: "1.9",
          color: "var(--text-muted)",
          overflowY: "auto", maxHeight: "190px",
        }}>
          <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "var(--border-hover)", marginBottom: "8px" }}>— LIVE OUTPUT —</div>
          {LOGS.filter(l => l.at <= progress).map((l, i) => (
            <div key={i} style={{ color: l.color }}>{l.text}</div>
          ))}
          <div style={{ color: "var(--accent)", marginTop: "2px" }}>
            {">"} {message || "processing..."}<span style={{ animation: "dot-pulse 1s ease-in-out infinite", display: "inline-block" }}>█</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mode Toggle ── */
function ModeToggle({ mode, onChange, disabled }: {
  mode: InputMode; onChange: (m: InputMode) => void; disabled: boolean;
}) {
  return (
    <div style={{
      display: "inline-flex",
      background: "var(--bg)", border: "1px solid var(--border)",
      borderRadius: "8px", padding: "3px", gap: "2px",
    }}>
      {(["url", "file"] as const).map(m => {
        const active = mode === m;
        return (
          <button key={m} type="button" disabled={disabled} onClick={() => onChange(m)} style={{
            padding: "5px 14px", borderRadius: "6px",
            fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            background: active ? "var(--surface)" : "transparent",
            color: active ? "var(--accent)" : "var(--text-muted)",
            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,158,255,0.15)" : "none",
            transition: "all 0.15s ease",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}>
            {m === "url" ? "GitHub URL" : "Upload ZIP"}
          </button>
        );
      })}
    </div>
  );
}

/* ── Status Badge ── */
function StatusPill({ status }: { status: ServerScanRecord["status"] | "scanning" }) {
  const cfg = {
    completed:  { label: "COMPLETE",    color: "var(--success)",  bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.22)"  },
    error:      { label: "FAILED",      color: "var(--danger)",   bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)" },
    running:    { label: "SCANNING",    color: "#f59e0b",         bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
    scanning:   { label: "SCANNING",    color: "#f59e0b",         bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
    cancelled:  { label: "CANCELLED",   color: "var(--text-muted)", bg: "rgba(150,150,150,0.08)", border: "rgba(150,150,150,0.22)" },
    cancelling: { label: "CANCELLING",  color: "#f59e0b",         bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "2px 7px", borderRadius: "4px",
      fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
    }}>
      <span style={{
        width: "5px", height: "5px", borderRadius: "50%",
        background: "currentColor", flexShrink: 0, display: "inline-block",
        ...(status === "scanning" || status === "running" || status === "cancelling" ? { animation: "dot-pulse 1s ease-in-out infinite" } : {}),
      }} />
      {cfg.label}
    </span>
  );
}

/* ── Inline status message style ── */
function statusStyle(msg: string) {
  const isErr = msg.includes("Error") || msg.includes("Failed") || msg.includes("error") || msg.includes("cancelled");
  const isOk  = msg.includes("completed") || msg.includes("Completed") || msg.includes("started");
  return {
    color:  isErr ? "var(--danger)"          : isOk ? "var(--success)"       : "var(--info)",
    bg:     isErr ? "rgba(248,113,113,0.08)" : isOk ? "var(--accent-subtle)" : "rgba(74,100,160,0.08)",
    border: isErr ? "rgba(248,113,113,0.25)" : isOk ? "var(--accent-border)" : "rgba(74,158,255,0.20)",
  };
}

/* ── Section divider label ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
      <span style={{
        fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em",
        color: "var(--text-muted)", fontFamily: "var(--font-mono), ui-monospace, monospace",
        textTransform: "uppercase" as const, whiteSpace: "nowrap",
      }}>{children}</span>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
    </div>
  );
}

/* ══════════════════════════════════════════
   REPO SCANNER PAGE
   ══════════════════════════════════════════ */
export default function RepoScanner() {
  const [repoUrl, setRepoUrl]                     = useState("");
  const [repoFile, setRepoFile]                   = useState<File | null>(null);
  const [inputMode, setInputMode]                 = useState<InputMode>("url");
  const [submitting, setSubmitting]               = useState(false);
  const [serverMsg, setServerMsg]                 = useState<string | null>(null);
  const [taskId, setTaskId]                       = useState<string | null>(null);
  const [progress, setProgress]                   = useState(0);
  const [progressMessage, setProgressMessage]     = useState("");
  const [scanResults, setScanResults]             = useState<string | null>(null);
  const [reportMarkdown, setReportMarkdown]       = useState<string | null>(null);
  const [dragActive, setDragActive]               = useState(false);
  const [recentScans, setRecentScans]             = useState<ServerScanRecord[]>([]);
  const [currentScanId, setCurrentScanId]         = useState<string | null>(null);
  const [scanStartTime, setScanStartTime]         = useState<number | null>(null);
  const [selectedScan, setSelectedScan]           = useState<ServerScanRecord | null>(null);
  const [selectedScanMarkdown, setSelectedScanMarkdown] = useState<string | null>(null);
  const [loadingReport, setLoadingReport]         = useState(false);
  const [scanLevel, setScanLevel]                 = useState<"speed" | "legend">("speed");
  const [deletingTaskId, setDeletingTaskId]       = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load scan history on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchScanHistory().then(setRecentScans).catch(() => {});
  }, []);

  // ── Recover an active scan from localStorage after page navigation ────────
  useEffect(() => {
    const saved = localStorage.getItem("intellihunt_scan_active");
    if (!saved) return;
    let parsed: { taskId: string; target: string; startedAt: number };
    try { parsed = JSON.parse(saved); } catch {
      localStorage.removeItem("intellihunt_scan_active");
      return;
    }
    checkTaskStatus(parsed.taskId)
      .then(s => {
        if (s.status === "running") {
          setSubmitting(true);
          setTaskId(parsed.taskId);
          setProgress(s.progress ?? 0);
          setProgressMessage(s.message ?? "Scan in progress…");
          setServerMsg("Scan in progress…");
        } else if (s.status === "completed") {
          localStorage.removeItem("intellihunt_scan_active");
          setScanResults(s.output ?? "");
          setReportMarkdown(s.report_markdown ?? null);
          setServerMsg("Scan completed!");
          fetchScanHistory().then(setRecentScans).catch(() => {});
        } else {
          localStorage.removeItem("intellihunt_scan_active");
          fetchScanHistory().then(setRecentScans).catch(() => {});
        }
      })
      .catch(() => {
        // Task not found (temp file expired and not in DB) — discard
        localStorage.removeItem("intellihunt_scan_active");
        fetchScanHistory().then(setRecentScans).catch(() => {});
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poll for task status while a scan is running ─────────────────────────
  useEffect(() => {
    if (!taskId) return;
    const id = setInterval(async () => {
      try {
        const s = await checkTaskStatus(taskId);
        setProgress(s.progress);
        setProgressMessage(s.message);
        if (s.status === "completed") {
          localStorage.removeItem("intellihunt_scan_active");
          setSubmitting(false);
          setServerMsg("Scan completed!");
          setScanResults(s.output || "No output.");
          setReportMarkdown(s.report_markdown || null);
          setSelectedScan(null);
          setSelectedScanMarkdown(null);
          setTaskId(null);
          clearInterval(id);
          fetchScanHistory().then(setRecentScans).catch(() => {});
        } else if (s.status === "error") {
          localStorage.removeItem("intellihunt_scan_active");
          setSubmitting(false);
          setServerMsg(`Error: ${s.message}`);
          setTaskId(null);
          clearInterval(id);
          fetchScanHistory().then(setRecentScans).catch(() => {});
        } else if (s.status === "cancelled") {
          localStorage.removeItem("intellihunt_scan_active");
          setSubmitting(false);
          setServerMsg("Scan cancelled.");
          setTaskId(null);
          clearInterval(id);
          fetchScanHistory().then(setRecentScans).catch(() => {});
        }
      } catch {
        localStorage.removeItem("intellihunt_scan_active");
        setSubmitting(false);
        setServerMsg("Error checking status");
        setTaskId(null);
        clearInterval(id);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [taskId, currentScanId, scanStartTime]);

  async function handleScan() {
    if (inputMode === "url" && !repoUrl.trim()) { setServerMsg("Enter a repository URL."); return; }
    if (inputMode === "file" && !repoFile) { setServerMsg("Select a .zip file."); return; }
    setSubmitting(true); setServerMsg(null); setProgress(0);
    setProgressMessage("Starting scan..."); setScanResults(null); setReportMarkdown(null);
    const now = Date.now();
    setScanStartTime(now);
    const optimisticId = `optimistic-${now}`;
    const newRecord: ServerScanRecord = {
      id: optimisticId, task_id: "", username: "",
      target: inputMode === "url" ? repoUrl.trim() : repoFile!.name,
      input_type: inputMode,
      scan_level: scanLevel,
      status: "running", duration_ms: null,
      created_at: new Date(now).toISOString(), completed_at: null, has_report: false,
    };
    setCurrentScanId(optimisticId);
    setRecentScans(prev => [newRecord, ...prev]);
    try {
      const res = inputMode === "file" ? await scanRepo(undefined, repoFile!, scanLevel) : await scanRepo(repoUrl.trim(), undefined, scanLevel);
      if (res.taskId) {
        setTaskId(res.taskId);
        setServerMsg("Scan started...");
        localStorage.setItem("intellihunt_scan_active", JSON.stringify({
          taskId: res.taskId,
          target: inputMode === "url" ? repoUrl.trim() : repoFile!.name,
          startedAt: now,
        }));
        setRecentScans(prev => prev.map(r => r.id === optimisticId ? { ...r, task_id: res.taskId! } : r));
      } else {
        setServerMsg(res.message || "Failed."); setSubmitting(false);
        setRecentScans(prev => prev.map(r => r.id === optimisticId ? { ...r, status: "error" as const } : r));
      }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed."); setSubmitting(false);
      setRecentScans(prev => prev.map(r => r.id === optimisticId ? { ...r, status: "error" as const } : r));
    }
  }

  function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".zip")) { setServerMsg("Please select a .zip archive."); return; }
    setRepoFile(file); setServerMsg(null);
  }

  const displayContent = selectedScanMarkdown || reportMarkdown || scanResults || "";
  const hasReport = !!displayContent;

  /* ─── Shared button styles ─── */
  const btnPrimary = {
    padding: "9px 20px", borderRadius: "8px",
    background: "var(--accent)", border: "none",
    color: "var(--accent-text)", fontSize: "12px", fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
    fontFamily: "var(--font-mono), monospace", letterSpacing: "0.08em",
    textTransform: "uppercase" as const, transition: "all 0.15s ease", flexShrink: 0,
  };
  const btnSecondary = {
    padding: "8px 16px", borderRadius: "8px",
    background: "transparent", border: "1px solid var(--border)",
    color: "var(--text-muted)", fontSize: "11px", fontWeight: 600,
    cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
    fontFamily: "var(--font-mono), monospace", letterSpacing: "0.06em",
    textTransform: "uppercase" as const, transition: "all 0.15s ease",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", width: "100%", animation: "fade-up 0.3s ease both" }}>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <h1 style={{
              fontSize: "22px", fontWeight: 800, letterSpacing: "-0.03em",
              color: "var(--text-primary)", fontFamily: "var(--font-display)", lineHeight: 1.2, margin: 0,
            }}>Repository Scanner</h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "2px 8px", background: "rgba(74,222,128,0.07)",
              border: "1px solid rgba(74,222,128,0.18)", borderRadius: "4px",
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
              color: "var(--success)", fontFamily: "var(--font-mono), monospace",
            }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", display: "inline-block", animation: "dot-pulse 2s ease-in-out infinite" }} />
              SYSTEM READY
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
            Deep security analysis — vulnerabilities, secrets, and CVE exposure
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RESULTS MODE: two-column layout
         ══════════════════════════════════════════ */}
      {hasReport ? (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "24px", alignItems: "start" }}>

          {/* Left: scan summary + controls */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderTop: "2px solid var(--success)", borderRadius: "12px", padding: "18px",
            display: "flex", flexDirection: "column", gap: "14px",
          }}>
            <SectionLabel>Scan Complete</SectionLabel>

            {/* Target */}
            <div>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "5px", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>Target</div>
              <div style={{
                fontSize: "11px", color: "var(--text-primary)", fontFamily: "var(--font-mono), monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px",
              }} title={selectedScan ? selectedScan.target : (inputMode === "url" ? repoUrl : repoFile?.name)}>
                {selectedScan ? selectedScan.target : (inputMode === "url" ? repoUrl : repoFile?.name || "—")}
              </div>
            </div>

            {/* Metadata grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { label: "Status",   value: <StatusPill status={selectedScan ? selectedScan.status : "completed"} /> },
                { label: "Duration", value: <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>{formatDuration(selectedScan?.duration_ms ?? undefined)}</span> },
                { label: "Type",     value: <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{selectedScan ? selectedScan.input_type.toUpperCase() : inputMode.toUpperCase()}</span> },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>{row.label}</span>
                  {row.value}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <button
                style={{ ...btnPrimary, justifyContent: "center", width: "100%", background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
                onClick={() => { setScanResults(null); setReportMarkdown(null); setSelectedScan(null); setSelectedScanMarkdown(null); setServerMsg(null); setRepoUrl(""); setRepoFile(null); }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-muted)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
              >↩ New Scan</button>
              <button
                style={{ ...btnSecondary, justifyContent: "center", width: "100%" }}
                onClick={() => {
                  const blob = new Blob([displayContent], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `scan-report-${Date.now()}.md`;
                  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >↓ Download .md</button>
            </div>
          </div>

          {/* Right: report viewer */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{
              padding: "11px 16px", background: "var(--surface-raised)", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>
                  {selectedScan ? `Report — ${selectedScan.target.split("/").pop()}` : "Threat Detection Report"}
                </span>
                {!selectedScan && (
                  <span style={{ padding: "1px 6px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "3px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--success)", fontFamily: "var(--font-mono), monospace" }}>NEW</span>
                )}
              </div>
              {selectedScan && (
                <button onClick={() => setSelectedScan(null)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <div style={{ overflowY: "auto", maxHeight: "70vh" }}>
              {loadingReport ? (
                <div style={{ padding: "48px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", color: "var(--text-muted)", fontSize: "13px" }}>
                  <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin-slow 0.6s linear infinite", display: "inline-block" }} />
                  Loading report...
                </div>
              ) : (
              <div className="report-md" style={{ padding: "24px 28px" }}>
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1>{children}</h1>,
                    h2: ({ children }) => <h2>{children}</h2>,
                    h3: ({ children }) => <h3>{children}</h3>,
                    p: ({ children }) => <p>{children}</p>,
                    ul: ({ children }) => <ul>{children}</ul>,
                    ol: ({ children }) => <ol>{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    strong: ({ children }) => <strong>{children}</strong>,
                    code: ({ children }) => <code>{children}</code>,
                    pre: ({ children }) => <pre>{children}</pre>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
                    hr: () => <hr />,
                  }}
                >{displayContent}</ReactMarkdown>
              </div>
              )}
            </div>
          </div>
        </div>

      ) : (
        /* ══════════════════════════════════════════
            IDLE / SCANNING MODE: focused single column
           ══════════════════════════════════════════ */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "740px" }}>

          {/* ── Input panel ── */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "14px", overflow: "hidden",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "9px",
                  background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--accent)", flexShrink: 0, boxShadow: "0 0 14px rgba(74,158,255,0.14)",
                }}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>Analyze Repository</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "1px" }}>Detect vulnerabilities, secrets, and CVE exposure</div>
                </div>
              </div>
              <ModeToggle mode={inputMode} onChange={m => {
                setInputMode(m); setServerMsg(null);
                if (m === "url") { setRepoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
                else setRepoUrl("");
              }} disabled={submitting} />
            </div>

            {/* Panel body */}
            <div style={{ padding: "20px" }}>

              {/* ── Scan Level Toggle ── */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, marginBottom: "8px" }}>
                  Scan Level
                </div>
                <div style={{ display: "inline-flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "3px", gap: "2px" }}>
                  {([
                    { key: "speed" as const, label: "Speed", desc: "Fast scan" },
                    { key: "legend" as const, label: "Legend", desc: "Deep scan" },
                  ]).map(tier => {
                    const active = scanLevel === tier.key;
                    return (
                      <button
                        key={tier.key}
                        type="button"
                        disabled={submitting}
                        onClick={() => setScanLevel(tier.key)}
                        style={{
                          padding: "6px 16px", borderRadius: "6px",
                          fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
                          textTransform: "uppercase" as const,
                          border: "none",
                          cursor: submitting ? "not-allowed" : "pointer",
                          background: active
                            ? tier.key === "legend" ? "rgba(245,158,11,0.12)" : "var(--surface)"
                            : "transparent",
                          color: active
                            ? tier.key === "legend" ? "#f59e0b" : "var(--accent)"
                            : "var(--text-muted)",
                          boxShadow: active
                            ? tier.key === "legend"
                              ? "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,158,11,0.2)"
                              : "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,158,255,0.15)"
                            : "none",
                          transition: "all 0.15s ease",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        {tier.key === "speed"
                          ? <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                          : <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                        }
                        {tier.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                  {scanLevel === "speed" ? "Quick analysis with a lightweight model" : "Comprehensive analysis with a more capable model"}
                </div>
              </div>

              {inputMode === "url" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", marginBottom: "2px" }}>
                    Repository URL
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={{
                        position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                        color: "var(--text-muted)", pointerEvents: "none",
                        fontFamily: "var(--font-mono), monospace", fontSize: "13px", fontWeight: 600,
                      }}>$</span>
                      <input
                        value={repoUrl}
                        onChange={e => setRepoUrl(e.target.value)}
                        placeholder="github.com/owner/repository"
                        disabled={submitting}
                        onKeyDown={e => { if (e.key === "Enter" && !submitting) handleScan(); }}
                        style={{
                          width: "100%", padding: "10px 14px 10px 28px",
                          background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px",
                          color: "var(--text-primary)", fontSize: "13px",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                          outline: "none", letterSpacing: "0.01em", colorScheme: "dark",
                          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(74,158,255,0.12)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </div>
                    <button
                      onClick={handleScan}
                      disabled={submitting || !repoUrl.trim()}
                      style={{
                        ...btnPrimary,
                        opacity: submitting || !repoUrl.trim() ? 0.5 : 1,
                        cursor: submitting || !repoUrl.trim() ? "not-allowed" : "pointer",
                      }}
                      onMouseEnter={e => { if (!submitting && repoUrl.trim()) { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(74,158,255,0.3)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {submitting ? (
                        <><span style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin-slow 0.6s linear infinite", display: "inline-block" }} />Scanning</>
                      ) : (
                        <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>Scan</>
                      )}
                    </button>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Supports public GitHub, GitLab, and Bitbucket repositories</p>
                </div>
              ) : (
                /* File mode */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }} disabled={submitting} onChange={e => handleFileSelect(e.target.files?.[0])} />
                  {!repoFile ? (
                    <div
                      onClick={() => !submitting && fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); if (!submitting) setDragActive(true); }}
                      onDragEnter={e => { e.preventDefault(); if (!submitting) setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={e => { e.preventDefault(); setDragActive(false); if (!submitting) handleFileSelect(e.dataTransfer.files?.[0]); }}
                      style={{
                        cursor: submitting ? "not-allowed" : "pointer",
                        borderRadius: "10px",
                        border: `2px dashed ${dragActive ? "var(--accent)" : "var(--border-hover)"}`,
                        background: dragActive ? "var(--accent-subtle)" : "var(--bg)",
                        padding: "36px 24px", display: "flex", flexDirection: "column" as const,
                        alignItems: "center", gap: "12px", textAlign: "center" as const,
                        opacity: submitting ? 0.5 : 1, transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{
                        width: "46px", height: "46px", borderRadius: "12px",
                        background: dragActive ? "var(--accent-muted)" : "var(--surface-raised)",
                        border: `1px solid ${dragActive ? "var(--accent-border)" : "var(--border-hover)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: dragActive ? "var(--accent)" : "var(--text-muted)", transition: "all 0.2s ease",
                      }}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" /></svg>
                      </div>
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 500, color: dragActive ? "var(--accent)" : "var(--text-secondary)", margin: "0 0 4px" }}>
                          {dragActive ? "Release to upload" : <span>Drop your archive here, or <span style={{ color: "var(--accent)" }}>browse</span></span>}
                        </p>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                          Accepts <code style={{ background: "var(--surface-raised)", padding: "1px 5px", borderRadius: "3px", fontSize: "11px", fontFamily: "var(--font-mono), monospace" }}>.zip</code> archives only
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                      padding: "12px 16px", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", borderRadius: "10px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "var(--accent-muted)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repoFile.name}</p>
                          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{(repoFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button onClick={() => { setRepoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} disabled={submitting} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "6px", borderRadius: "6px", flexShrink: 0, display: "flex", alignItems: "center" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}>
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                  {repoFile && (
                    <button onClick={handleScan} disabled={submitting} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: submitting ? 0.5 : 1 }}>
                      {submitting ? "Scanning..." : "Scan Archive"}
                    </button>
                  )}
                </div>
              )}

              {/* Inline status message */}
              {serverMsg && (
                <div style={{
                  marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
                  fontSize: "13px", display: "flex", alignItems: "center", gap: "8px",
                  color: statusStyle(serverMsg).color, background: statusStyle(serverMsg).bg,
                  border: `1px solid ${statusStyle(serverMsg).border}`,
                }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor", flexShrink: 0, display: "inline-block" }} />
                  {serverMsg}
                </div>
              )}
            </div>
          </div>

          {/* ── Scanning animation ── */}
          {submitting && (
            <div style={{ animation: "fade-up 0.25s ease both", display: "flex", flexDirection: "column", gap: "12px" }}>
              <ScanTerminal progress={progress} message={progressMessage} />
              {taskId && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={async () => {
                      if (!window.confirm("Stop the current scan?")) return;
                      try { await cancelScan(taskId); setProgressMessage("Cancelling..."); }
                      catch { setServerMsg("Failed to cancel scan."); }
                    }}
                    style={{
                      padding: "7px 16px", borderRadius: "8px",
                      background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)",
                      color: "var(--danger)", fontSize: "11px", fontWeight: 700,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                      fontFamily: "var(--font-mono), monospace", letterSpacing: "0.06em",
                      textTransform: "uppercase" as const, transition: "all 0.15s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(248,113,113,0.08)"; }}
                  >
                    <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                    Stop Scan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          RECENT OPERATIONS TABLE
         ══════════════════════════════════════════ */}
      <div style={{ animation: "fade-up 0.4s ease both" }}>
        <SectionLabel>
          Recent Operations
          {recentScans.length > 0 && (
            <span style={{
              marginLeft: "8px", padding: "1px 6px",
              background: "var(--surface-raised)", border: "1px solid var(--border)",
              borderRadius: "4px", fontSize: "9px", fontWeight: 700,
              color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
            }}>{recentScans.length}</span>
          )}
        </SectionLabel>

        {recentScans.length === 0 ? (
          <div style={{
            padding: "48px 24px", display: "flex", flexDirection: "column" as const,
            alignItems: "center", gap: "16px", textAlign: "center" as const,
            border: "1px dashed var(--border-hover)", borderRadius: "12px", background: "var(--surface-raised)",
          }}>
            <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px", fontFamily: "var(--font-display)" }}>No scans yet</p>
              <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: 0 }}>Run your first scan above — history appears here automatically</p>
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 72px 108px 96px 76px 86px",
              padding: "8px 16px", background: "var(--surface-raised)", borderBottom: "1px solid var(--border)",
            }}>
              {["Target", "Type", "Status", "Started", "Duration", ""].map(h => (
                <span key={h} style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, textAlign: h === "" || h === "Duration" ? "right" as const : "left" as const }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {recentScans.map(scan => {
              const isSelected = selectedScan?.id === scan.id;
              const isClickable = scan.status === "completed" && scan.has_report;
              return (
                <div key={scan.id}
                  onClick={async () => {
                    if (!isClickable) return;
                    if (isSelected) { setSelectedScan(null); setSelectedScanMarkdown(null); return; }
                    setSelectedScan(scan);
                    setScanResults(null); setReportMarkdown(null); setSelectedScanMarkdown(null);
                    setLoadingReport(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    try {
                      const data = await fetchScanReport(scan.task_id);
                      setSelectedScanMarkdown(data.report_markdown);
                    } catch { setSelectedScanMarkdown("Failed to load report."); }
                    finally { setLoadingReport(false); }
                  }}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 72px 108px 96px 76px 86px",
                    padding: "10px 16px", borderBottom: "1px solid var(--border)",
                    cursor: isClickable ? "pointer" : "default",
                    background: isSelected ? "var(--accent-subtle)" : "transparent",
                    borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => { if (isClickable && !isSelected) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Target */}
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                      {scan.input_type === "url"
                        ? <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                        : <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                      }
                    </span>
                    <span style={{ fontSize: scan.input_type === "url" ? "11px" : "12px", fontFamily: scan.input_type === "url" ? "var(--font-mono), monospace" : "inherit", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={scan.target}>{scan.target}</span>
                  </div>
                  {/* Type */}
                  <div><span style={{ display: "inline-block", padding: "1px 6px", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "3px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{scan.input_type === "url" ? "URL" : "ZIP"}</span></div>
                  {/* Status */}
                  <div><StatusPill status={scan.status} /></div>
                  {/* Started */}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{relativeTime(scan.created_at)}</div>
                  {/* Duration */}
                  <div style={{ textAlign: "right", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{formatDuration(scan.duration_ms ?? undefined)}</div>
                  {/* Action */}
                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                    {isSelected && loadingReport
                      ? <span style={{ fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>…</span>
                      : isClickable && <span style={{ fontSize: "11px", fontWeight: 600, color: isSelected ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{isSelected ? "●" : "View →"}</span>
                    }
                    {scan.status !== "running" && scan.status !== "cancelling" && (
                      <button
                        title="Delete scan"
                        disabled={deletingTaskId === scan.task_id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm("Delete this scan and its report? This cannot be undone.")) return;
                          setDeletingTaskId(scan.task_id);
                          try {
                            await deleteScan(scan.task_id);
                            if (selectedScan?.task_id === scan.task_id) {
                              setSelectedScan(null); setSelectedScanMarkdown(null);
                              setScanResults(null); setReportMarkdown(null);
                            }
                            fetchScanHistory().then(setRecentScans).catch(() => {});
                          } catch { /* ignore */ }
                          finally { setDeletingTaskId(null); }
                        }}
                        style={{
                          background: "transparent", border: "none",
                          color: deletingTaskId === scan.task_id ? "var(--border)" : "var(--text-muted)",
                          cursor: deletingTaskId === scan.task_id ? "not-allowed" : "pointer",
                          padding: "2px", borderRadius: "4px", display: "flex", alignItems: "center",
                          transition: "color 0.15s ease", flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (deletingTaskId !== scan.task_id) e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { if (deletingTaskId !== scan.task_id) e.currentTarget.style.color = "var(--text-muted)"; }}
                      >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div style={{ padding: "8px 16px", display: "flex", justifyContent: "flex-end", background: "var(--surface-raised)", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => fetchScanHistory().then(setRecentScans).catch(() => {})} style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "10px", cursor: "pointer", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 6px", borderRadius: "4px", transition: "color 0.15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}>
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
