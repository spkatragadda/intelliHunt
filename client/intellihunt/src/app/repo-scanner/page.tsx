"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/Button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { scanRepo, checkTaskStatus } from "@/lib/api";
import ReactMarkdown from "react-markdown";

/* ── Types ── */
type InputMode = "url" | "file";

type ScanRecord = {
  id: string;
  type: InputMode;
  target: string;
  status: "scanning" | "completed" | "error";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};

/* ── localStorage helpers ── */
const SCANS_KEY = "intellihunt:recent-scans";

function loadScans(): ScanRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SCANS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveScans(scans: ScanRecord[]) {
  try { localStorage.setItem(SCANS_KEY, JSON.stringify(scans.slice(0, 20))); } catch {}
}

/* Shared styles removed — using Card component from ui/card */

/* ── Segmented Control ── */
function SegmentedControl({ mode, onChange, disabled }: {
  mode: InputMode;
  onChange: (m: InputMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex gap-1 p-1 rounded-lg w-full"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      {(["url", "file"] as const).map(m => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={active
              ? { background: "var(--surface)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }
              : { background: "transparent", color: "var(--text-muted)" }
            }
            onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {m === "url" ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                GitHub URL
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                Upload ZIP
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Status dot helper ── */
function statusStyle(msg: string): { color: string; bg: string; border: string } {
  const isErr = msg.includes("Error") || msg.includes("Failed") || msg.includes("error");
  const isOk  = msg.includes("completed") || msg.includes("Completed") || msg.includes("started");
  return {
    color:  isErr ? "var(--danger)"        : isOk ? "var(--success)"      : "var(--info)",
    bg:     isErr ? "rgba(248,113,113,0.08)" : isOk ? "var(--accent-subtle)" : "rgba(148,163,184,0.08)",
    border: isErr ? "rgba(248,113,113,0.25)" : isOk ? "var(--accent-border)" : "rgba(148,163,184,0.22)",
  };
}

/* ── Status badge for table ── */
function StatusBadge({ status }: { status: ScanRecord["status"] }) {
  const map: Record<ScanRecord["status"], { label: string; variant: "success" | "destructive" | "scanning" }> = {
    completed: { label: "Completed", variant: "success" },
    error:     { label: "Error",     variant: "destructive" },
    scanning:  { label: "Scanning",  variant: "scanning" },
  };
  const { label, variant } = map[status];
  return (
    <Badge variant={variant}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${status === "scanning" ? "animate-pulse" : ""}`}
        style={{ background: "currentColor" }} />
      {label}
    </Badge>
  );
}

/* ── Time formatter ── */
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

/* ═══════════════════════════════════════════════
   REPO SCANNER PAGE
   ═══════════════════════════════════════════════ */
export default function RepoScanner() {
  const [repoUrl, setRepoUrl]           = useState("");
  const [repoFile, setRepoFile]         = useState<File | null>(null);
  const [inputMode, setInputMode]       = useState<InputMode>("url");
  const [submitting, setSubmitting]     = useState(false);
  const [serverMsg, setServerMsg]       = useState<string | null>(null);
  const [taskId, setTaskId]             = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [scanResults, setScanResults]   = useState<string | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [dragActive, setDragActive]     = useState(false);
  const [recentScans, setRecentScans]   = useState<ScanRecord[]>([]);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Load recent scans from localStorage on mount */
  useEffect(() => {
    setRecentScans(loadScans());
  }, []);

  /* Poll task status */
  useEffect(() => {
    if (!taskId) return;
    const id = setInterval(async () => {
      try {
        const s = await checkTaskStatus(taskId);
        setProgress(s.progress);
        setProgressMessage(s.message);
        if (s.status === "completed") {
          const durationMs = scanStartTime ? Date.now() - scanStartTime : undefined;
          setSubmitting(false);
          setServerMsg("Scan completed!");
          setScanResults(s.output || "No output.");
          setReportMarkdown(s.report_markdown || null);
          setTaskId(null);
          clearInterval(id);
          // Update scan record
          setRecentScans(prev => {
            const updated = prev.map(r => r.id === currentScanId
              ? { ...r, status: "completed" as const, completedAt: new Date().toISOString(), durationMs }
              : r
            );
            saveScans(updated);
            return updated;
          });
        } else if (s.status === "error") {
          const durationMs = scanStartTime ? Date.now() - scanStartTime : undefined;
          setSubmitting(false);
          setServerMsg(`Error: ${s.message}`);
          setTaskId(null);
          clearInterval(id);
          setRecentScans(prev => {
            const updated = prev.map(r => r.id === currentScanId
              ? { ...r, status: "error" as const, completedAt: new Date().toISOString(), durationMs }
              : r
            );
            saveScans(updated);
            return updated;
          });
        }
      } catch {
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

    setSubmitting(true);
    setServerMsg(null);
    setProgress(0);
    setProgressMessage("Starting scan...");
    setScanResults(null);
    setReportMarkdown(null);

    // Create scan record
    const now = Date.now();
    const scanId = now.toString();
    const newRecord: ScanRecord = {
      id: scanId,
      type: inputMode,
      target: inputMode === "url" ? repoUrl.trim() : repoFile!.name,
      status: "scanning",
      startedAt: new Date(now).toISOString(),
    };
    setScanStartTime(now);
    setCurrentScanId(scanId);
    setRecentScans(prev => {
      const updated = [newRecord, ...prev];
      saveScans(updated);
      return updated;
    });

    try {
      const res = inputMode === "file"
        ? await scanRepo(undefined, repoFile!)
        : await scanRepo(repoUrl.trim());
      if (res.taskId) {
        setTaskId(res.taskId);
        setServerMsg("Scan started...");
      } else {
        setServerMsg(res.message || "Failed.");
        setSubmitting(false);
        setRecentScans(prev => {
          const updated = prev.map(r => r.id === scanId
            ? { ...r, status: "error" as const, completedAt: new Date().toISOString() }
            : r
          );
          saveScans(updated);
          return updated;
        });
      }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed.");
      setSubmitting(false);
      setRecentScans(prev => {
        const updated = prev.map(r => r.id === scanId
          ? { ...r, status: "error" as const, completedAt: new Date().toISOString() }
          : r
        );
        saveScans(updated);
        return updated;
      });
    }
  }

  function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".zip")) { setServerMsg("Please select a .zip archive."); return; }
    setRepoFile(file);
    setServerMsg(null);
  }

  function clearHistory() {
    saveScans([]);
    setRecentScans([]);
  }

  /* ─── JSX ─── */
  return (
    <div className="w-full space-y-6">

      {/* ── Page header ── */}
      <div>
        <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}>
          Repository Scanner
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Deep security analysis — vulnerabilities, secrets, and CVE exposure
        </p>
      </div>

      {/* ══════════════════════════════════
          HERO: Centered interaction card
         ══════════════════════════════════ */}
      <Card>
        <div className="p-6 space-y-5">

          {/* Card header */}
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--accent)", boxShadow: "0 0 16px rgba(255,255,255,0.12)" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                Scan Repository
              </h2>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Detect vulnerabilities, exposed secrets, and threat vectors in source code
              </p>
            </div>
          </div>

          {/* ── Segmented Control ── */}
          <SegmentedControl mode={inputMode} onChange={m => {
            setInputMode(m);
            setServerMsg(null);
            if (m === "url") { setRepoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
            else setRepoUrl("");
          }} disabled={submitting} />

          {/* ── URL mode ── */}
          {inputMode === "url" && (
            <div className="space-y-3">
              <label className="block text-[11px] uppercase tracking-widest font-medium" style={{ color: "var(--text-muted)" }}>
                Repository URL
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5" style={{ color: "var(--text-muted)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                  </div>
                  <Input
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    disabled={submitting}
                    onKeyDown={e => { if (e.key === "Enter" && !submitting) handleScan(); }}
                    style={{ background: "var(--bg)", padding: "10px 14px 10px 42px", fontSize: "14px" }}
                  />
                </div>
                <Button
                  onClick={handleScan}
                  disabled={submitting || !repoUrl.trim()}
                  icon={submitting
                    ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent-text)", borderTopColor: "transparent" }} />
                    : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    )
                  }
                >
                  {submitting ? "Scanning..." : "Scan"}
                </Button>
              </div>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Supports public GitHub, GitLab, and Bitbucket repositories
              </p>
            </div>
          )}

          {/* ── File / Drop zone mode ── */}
          {inputMode === "file" && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                disabled={submitting}
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />

              {/* Drop zone */}
              {!repoFile ? (
                <div
                  onClick={() => !submitting && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); if (!submitting) setDragActive(true); }}
                  onDragEnter={e => { e.preventDefault(); if (!submitting) setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragActive(false);
                    if (!submitting) handleFileSelect(e.dataTransfer.files?.[0]);
                  }}
                  className="cursor-pointer rounded-xl flex flex-col items-center justify-center gap-4 py-12 text-center transition-all duration-200 select-none"
                  style={{
                    background: dragActive ? "var(--accent-subtle)" : "var(--bg)",
                    border: `2px dashed ${dragActive ? "var(--accent)" : "var(--border-hover)"}`,
                    opacity: submitting ? 0.5 : 1,
                    pointerEvents: submitting ? "none" : "auto",
                  }}
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200"
                    style={{
                      background: dragActive ? "var(--accent-muted)" : "var(--surface-raised)",
                      border: `1px solid ${dragActive ? "var(--accent-border)" : "var(--border-hover)"}`,
                      color: dragActive ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[14px] font-medium" style={{ color: dragActive ? "var(--accent)" : "var(--text-secondary)" }}>
                      {dragActive ? "Release to upload" : (
                        <>Drop your archive here, or <span style={{ color: "var(--accent)" }}>browse</span></>
                      )}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Accepts{" "}
                      <code style={{ background: "var(--surface-raised)", padding: "1px 5px", borderRadius: "3px", fontSize: "11px" }}>.zip</code>
                      {" "}archives only
                    </p>
                  </div>
                </div>
              ) : (
                /* File selected state */
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{repoFile.name}</p>
                      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{(repoFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setRepoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    disabled={submitting}
                    className="flex-shrink-0 rounded-md p-1.5 transition-colors duration-150 disabled:opacity-40"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {repoFile && (
                <Button
                  onClick={handleScan}
                  disabled={submitting}
                  icon={submitting
                    ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent-text)", borderTopColor: "transparent" }} />
                    : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    )
                  }
                >
                  {submitting ? "Scanning..." : "Scan Archive"}
                </Button>
              )}
            </div>
          )}

          {/* ── Inline status message ── */}
          {serverMsg && (
            <div
              className="rounded-md px-4 py-2.5 text-[13px] flex items-center gap-2.5"
              style={{
                color: statusStyle(serverMsg).color,
                background: statusStyle(serverMsg).bg,
                border: `1px solid ${statusStyle(serverMsg).border}`,
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: statusStyle(serverMsg).color }} />
              {serverMsg}
            </div>
          )}
        </div>
      </Card>

      {/* ══════════════════════════════════
          PROGRESS (full-width)
         ══════════════════════════════════ */}
      {submitting && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>Scanning repository...</span>
              </div>
              <span className="text-[13px] font-semibold tabular-nums"
                style={{ color: "var(--accent)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                {progress}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <p className="text-[12px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
              {progressMessage}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════
          RESULTS (full-width)
         ══════════════════════════════════ */}
      {(reportMarkdown || scanResults) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>{reportMarkdown ? "Threat Detection Report" : "Scan Results"}</CardTitle>
                {reportMarkdown && <Badge variant="accent">Complete</Badge>}
              </div>
              <Button
                variant="secondary"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                }
                onClick={() => {
                  const content = reportMarkdown || scanResults || "";
                  const blob = new Blob([content], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `scan-report-${Date.now()}.md`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </Button>
            </div>
          </CardHeader>
          <div className="overflow-y-auto" style={{ maxHeight: "70vh", background: "var(--bg)" }}>
            <div className="p-6" style={{ color: "var(--text-secondary)", lineHeight: "1.75", fontSize: "15px" }}>
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 style={{ color: "var(--text-primary)", fontSize: "20px", fontWeight: 700, marginBottom: "12px", marginTop: "24px", paddingBottom: "8px", borderBottom: "1px solid var(--border)" }}>{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600, marginBottom: "10px", marginTop: "28px" }}>{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 style={{ color: "var(--accent)", fontSize: "11px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p style={{ color: "var(--text-secondary)", marginBottom: "10px", lineHeight: "1.7" }}>{children}</p>
                  ),
                  ul: ({ children }) => <ul style={{ paddingLeft: "20px", marginBottom: "10px" }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ paddingLeft: "20px", marginBottom: "10px" }}>{children}</ol>,
                  li: ({ children }) => <li style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                  code: ({ children }) => (
                    <code style={{ background: "var(--surface-raised)", color: "var(--accent)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{children}</code>
                  ),
                  pre: ({ children }) => (
                    <pre style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", overflowX: "auto", marginBottom: "12px", fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "12px" }}>{children}</pre>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)", textDecoration: "none" }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--accent)"; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.color = "var(--info)"; }}
                    >{children}</a>
                  ),
                  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />,
                }}
              >
                {reportMarkdown || scanResults || ""}
              </ReactMarkdown>
            </div>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════
          RECENT SCANS — DataTable
         ══════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Recent Scans</CardTitle>
              {recentScans.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">{recentScans.length}</Badge>
              )}
            </div>
            {recentScans.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory}
                style={{ color: "var(--text-muted)", fontSize: "12px" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                Clear history
              </Button>
            )}
          </div>
        </CardHeader>

        {recentScans.length === 0 ? (
          <div className="mx-5 my-5 flex flex-col items-center justify-center py-12 gap-5 rounded-xl text-center"
            style={{ border: "1px dashed var(--border-hover)", background: "var(--surface-raised)" }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", color: "var(--accent)", boxShadow: "0 0 20px rgba(255,255,255,0.08)" }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>No scans yet</p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Run your first scan above — history appears here automatically</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead className="px-4">Type</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Started</TableHead>
                <TableHead className="px-4 text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentScans.map(scan => (
                <TableRow key={scan.id}>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                        {scan.type === "url" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate font-medium" title={scan.target}
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: scan.type === "url" ? "var(--font-mono), ui-monospace, monospace" : "inherit",
                          fontSize: scan.type === "url" ? "12px" : "13px",
                          maxWidth: "320px", display: "block",
                        }}>
                        {scan.target}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4">
                    <Badge variant="secondary">{scan.type === "url" ? "URL" : "ZIP"}</Badge>
                  </TableCell>
                  <TableCell className="px-4">
                    <StatusBadge status={scan.status} />
                  </TableCell>
                  <TableCell className="px-4" style={{ color: "var(--text-muted)" }}>
                    {relativeTime(scan.startedAt)}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "12px" }}>
                    {formatDuration(scan.durationMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

    </div>
  );
}
