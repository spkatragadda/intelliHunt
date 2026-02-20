"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  fetchReportMarkdown,
  extractCVEs,
  PUBLIC_API_BASE,
  GenerateReportPayload,
  runReport,
  checkTaskStatus,
  downloadYamlTemplate,
  uploadYamlConfig,
  getCurrentYamlConfig,
} from "@/lib/api";
import Button from "@/components/Button";

type Tab = "report" | "generate" | "vulnerabilities";

/* ─── Shared styles ─── */
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "5px",
  padding: "8px 12px",
  fontSize: "15px",
  color: "var(--text-primary)",
  outline: "none",
  transition: "border-color 150ms",
};

/* ─── Sub-tab ─── */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-sm text-[15px] font-medium transition-colors duration-150"
      style={{
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        background: active ? "var(--surface-hover)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = active ? "var(--surface-hover)" : "transparent";
      }}
    >
      {children}
    </button>
  );
}

/* ─── Progress bar ─── */
function ProgressBar({ progress, message }: { progress: number; message: string }) {
  return (
    <div className="space-y-2 p-4" style={card}>
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>
          Progress
        </span>
        <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          {progress}%
        </span>
      </div>
      <div className="w-full h-1 rounded-full" style={{ background: "var(--border)" }}>
        <div
          className="h-1 rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: "var(--accent)" }}
        />
      </div>
      <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════
   REPORT VIEW
   ═══════════════════════════════════ */
function ReportView({
  md,
  err,
  loading,
  onRefresh,
}: {
  md: string;
  err: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const download = () => {
    const blob = new Blob([md || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intellihunt_report.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (err) {
    return (
      <div
        className="rounded-sm p-3 text-[15px]"
        style={{ background: "rgba(229, 83, 75, 0.08)", border: "1px solid rgba(229, 83, 75, 0.15)", color: "var(--danger)" }}
      >
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button onClick={loading ? undefined : onRefresh} variant="secondary" disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
        <Button onClick={download} variant="secondary">Download</Button>
        <Button href={`${PUBLIC_API_BASE}/api/markdown/`} target="_blank" variant="ghost">
          Raw
        </Button>
      </div>

      <div
        className="p-6 rounded-md text-[16px] leading-relaxed space-y-4
          [&_h1]:text-2xl [&_h1]:font-medium [&_h1]:mb-3
          [&_h2]:text-xl [&_h2]:font-medium [&_h2]:mb-2 [&_h2]:mt-6
          [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5
          [&_li]:text-[15px]
          [&_p]:mb-3"
        style={{
          ...card,
          color: "var(--text-secondary)",
        }}
      >
        {md ? (
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h1 style={{ color: "var(--text-primary)" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ color: "var(--text-primary)" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ color: "var(--text-primary)" }}>{children}</h3>,
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", padding: "12px", fontSize: "13px", overflow: "auto" }}>
                      <code>{children}</code>
                    </pre>
                  );
                }
                return (
                  <code style={{ background: "var(--surface-raised)", padding: "1px 5px", borderRadius: "3px", fontSize: "13px" }}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {md}
          </ReactMarkdown>
        ) : (
          <div className="text-[15px]" style={{ color: "var(--text-muted)" }}>
            {loading ? "Loading report..." : "No report available yet."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   GENERATE REPORT
   ═══════════════════════════════════ */
type KV = { vendor: string; product: string };
type AppVendorProducts = { vendor: string; products: string[] };
type Source = { name: string; fields: string[]; description: string };

function GenerateView({ onReportGenerated }: { onReportGenerated: (reportHint?: string) => void }) {
  const [os, setOs] = useState<KV[]>([]);
  const [apps, setApps] = useState<AppVendorProducts[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [yamlConfig, setYamlConfig] = useState<any>(null);
  const [yamlMsg, setYamlMsg] = useState<string | null>(null);
  const [yamlUploaded, setYamlUploaded] = useState(false);
  const [showEmptyPrompt, setShowEmptyPrompt] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(true);
  const [crewOutput, setCrewOutput] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentYamlConfig().then((c) => setYamlConfig(c.config)).catch(() => {});
  }, []);

  // Auto-scroll logs to bottom when new lines arrive
  useEffect(() => {
    if (logsOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsOpen]);

  useEffect(() => {
    if (!taskId) return;
    const id = setInterval(async () => {
      try {
        const s = await checkTaskStatus(taskId);
        setProgress(s.progress);
        setProgressMessage(s.message);
        if (s.logs) setLogs(s.logs);
        if (typeof s.output === "string") setCrewOutput(s.output);
        if (s.status === "completed") {
          setSubmitting(false); setServerMsg("Report generated!"); setTaskId(null); clearInterval(id);
          onReportGenerated(typeof s.output === "string" ? s.output : undefined);
        } else if (s.status === "error") {
          setSubmitting(false); setServerMsg(`Error: ${s.message}`); setTaskId(null); clearInterval(id);
        }
      } catch {
        setSubmitting(false); setServerMsg("Error checking status"); setTaskId(null); clearInterval(id);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [taskId, onReportGenerated]);

  // Computed counts for the stat badges
  const osCount = os.filter((r) => r.vendor || r.product).length;
  const appsCount = apps.filter((r) => r.vendor || r.products.length).length;
  const cloudCount = yamlConfig?.software_stack?.cloud_platforms?.length || 0;

  async function submit() {
    // Check if user has entered any configurations
    const hasOs = os.some((r) => r.vendor || r.product);
    const hasApps = apps.some((r) => r.vendor || r.products.length);
    const hasSources = sources.some((s) => s.name || s.fields.length || s.description);

    if (!hasOs && !hasApps && !hasSources && !yamlUploaded) {
      setShowEmptyPrompt(true);
      return;
    }

    setShowEmptyPrompt(false);
    setLogs([]); setLogsOpen(true); setCrewOutput(null);
    setSubmitting(true); setServerMsg(null); setProgress(0); setProgressMessage("Starting...");
    try {
      const osClean = os.filter((r) => r.vendor || r.product);
      const appsClean = apps.filter((r) => r.vendor || r.products.length).map((r) => ({ vendor: r.vendor, products: r.products.filter(Boolean) }));
      const sourcesClean = sources.filter((s) => s.name || s.fields.length || s.description);
      const payload: GenerateReportPayload = { os: osClean, applications: appsClean, sources: sourcesClean, yaml_uploaded: yamlUploaded };
      const res = await runReport(payload);
      if (res.taskId) { setTaskId(res.taskId); setServerMsg("Report generation started..."); }
      else { setServerMsg(res.message || "Failed."); setSubmitting(false); }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed."); setSubmitting(false);
    }
  }

  const SectionLabel = ({ children, onAdd }: { children: React.ReactNode; onAdd: () => void }) => (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>{children}</span>
      <button
        onClick={onAdd}
        className="text-[14px] rounded-sm px-2.5 py-1 transition-colors duration-150"
        style={{ color: "var(--accent)", background: "var(--accent-muted)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124, 90, 255, 0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; }}
      >
        + Add
      </button>
    </div>
  );

  const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="rounded-sm p-1 flex-shrink-0 transition-colors duration-150"
      style={{ color: "var(--text-muted)" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );

  return (
    <div className="space-y-6 w-full">
      {/* Stat badges at top */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ ...card, minWidth: 100 }}>
          <span className="text-[22px] font-semibold" style={{ color: "var(--accent)" }}>{osCount}</span>
          <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>OS</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ ...card, minWidth: 100 }}>
          <span className="text-[22px] font-semibold" style={{ color: "var(--accent)" }}>{appsCount}</span>
          <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>Apps</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ ...card, minWidth: 100 }}>
          <span className="text-[22px] font-semibold" style={{ color: "var(--accent)" }}>{cloudCount}</span>
          <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>Cloud</span>
        </div>
      </div>

      {/* OS */}
      <div className="p-4" style={card}>
        <SectionLabel onAdd={() => setOs((a) => [...a, { vendor: "", product: "" }])}>Operating Systems</SectionLabel>
        {os.length === 0 ? (
          <p className="text-[14px] py-2" style={{ color: "var(--text-muted)" }}>No operating systems added. Click + Add to begin.</p>
        ) : (
          <div className="space-y-3">
            {os.map((row, i) => (
              <div key={i} className="flex gap-4 items-center">
                <input
                  value={row.vendor} placeholder="Vendor"
                  onChange={(e) => setOs((a) => a.map((r, j) => (j === i ? { ...r, vendor: e.target.value } : r)))}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <input
                  value={row.product} placeholder="Product"
                  onChange={(e) => setOs((a) => a.map((r, j) => (j === i ? { ...r, product: e.target.value } : r)))}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <RemoveBtn onClick={() => setOs((a) => a.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className="p-4" style={card}>
        <SectionLabel onAdd={() => setApps((a) => [...a, { vendor: "", products: [] }])}>Applications</SectionLabel>
        {apps.length === 0 ? (
          <p className="text-[14px] py-2" style={{ color: "var(--text-muted)" }}>No applications added. Click + Add to begin.</p>
        ) : (
          <div className="space-y-3">
            {apps.map((row, i) => (
              <div key={i} className="flex gap-4 items-center">
                <input
                  value={row.vendor} placeholder="Vendor"
                  onChange={(e) => setApps((a) => a.map((r, j) => (j === i ? { ...r, vendor: e.target.value } : r)))}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <input
                  value={row.products.join(", ")} placeholder="Products (comma-separated)"
                  onChange={(e) => {
                    const products = e.target.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
                    setApps((a) => a.map((r, j) => (j === i ? { ...r, products } : r)));
                  }}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <RemoveBtn onClick={() => setApps((a) => a.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sources */}
      <div className="p-4" style={card}>
        <SectionLabel onAdd={() => setSources((a) => [...a, { name: "", fields: [], description: "" }])}>Source Types</SectionLabel>
        {sources.length === 0 ? (
          <p className="text-[14px] py-2" style={{ color: "var(--text-muted)" }}>No source types added. Click + Add to begin.</p>
        ) : (
          <div className="space-y-4">
            {sources.map((row, i) => (
              <div key={i} className="space-y-3 p-4 rounded-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <div className="flex gap-4 items-center">
                  <input
                    value={row.name} placeholder="Name (e.g. SIEM)"
                    onChange={(e) => setSources((a) => a.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  />
                  <input
                    value={row.fields.join(", ")} placeholder="Fields (comma-separated)"
                    onChange={(e) => {
                      const fields = e.target.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
                      setSources((a) => a.map((r, j) => (j === i ? { ...r, fields } : r)));
                    }}
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  />
                  <RemoveBtn onClick={() => setSources((a) => a.filter((_, j) => j !== i))} />
                </div>
                <textarea
                  value={row.description} placeholder="Description" rows={2}
                  onChange={(e) => setSources((a) => a.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress */}
      {submitting && <ProgressBar progress={progress} message={progressMessage} />}

      {/* Crew output (final or intermediate) */}
      {crewOutput && (
        <div className="p-4 space-y-3" style={card}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>Crew Output</span>
          </div>
          <div className="rounded-sm p-4 max-h-96 overflow-y-auto" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <ReactMarkdown>
              {crewOutput}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Log viewer - visible whenever there are logs (during or after run) */}
      {logs.length > 0 && (
        <div style={card} className="overflow-hidden">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors duration-150"
            style={{ background: "var(--surface)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
          >
            <span className="text-[15px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <svg
                className="w-3 h-3 transition-transform duration-150"
                style={{ transform: logsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Output Log
            </span>
            <span className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              {logs.length} line{logs.length !== 1 ? "s" : ""}
            </span>
          </button>
          {logsOpen && (
            <div
              className="px-4 py-3 overflow-y-auto font-mono text-[14px] leading-[1.6]"
              style={{
                maxHeight: "300px",
                background: "var(--bg)",
                borderTop: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all" style={{
                  color: line.startsWith("[error]") ? "var(--danger)"
                    : line.startsWith("[system]") ? "var(--info)"
                    : "var(--text-secondary)",
                }}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Empty prompt - shown when user clicks Run Report with no config */}
      {showEmptyPrompt && (
        <div className="p-4 rounded-md text-[15px]" style={{
          background: "rgba(229, 165, 36, 0.08)",
          border: "1px solid rgba(229, 165, 36, 0.2)",
          color: "var(--text-primary)",
        }}>
          <p className="font-medium mb-2" style={{ color: "rgb(229, 165, 36)" }}>No software configurations entered</p>
          <p style={{ color: "var(--text-muted)" }}>
            Please add at least one operating system, application, or source type above before generating a report.
            You can also upload a YAML configuration file below.
          </p>
        </div>
      )}

      {/* YAML */}
      <div className="p-4" style={card}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>YAML Configuration</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => downloadYamlTemplate().catch((e: any) => setYamlMsg(`Error: ${e.message}`))}>
              Template
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Upload</Button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".yaml,.yml" className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) { setYamlMsg("Select a YAML file."); return; }
            try { setYamlMsg("Uploading..."); const r = await uploadYamlConfig(file); setYamlConfig(r.config); setYamlMsg(r.message); setYamlUploaded(true); setShowEmptyPrompt(false); }
            catch (err: any) { setYamlMsg(`Failed: ${err.message}`); }
          }}
        />
        {yamlMsg && (
          <p className="text-[14px] mb-2 rounded-sm px-2 py-1" style={{
            color: yamlMsg.includes("Error") || yamlMsg.includes("Failed") ? "var(--danger)" : "var(--success)",
            background: yamlMsg.includes("Error") || yamlMsg.includes("Failed") ? "rgba(229,83,75,0.08)" : "rgba(69,212,131,0.08)",
          }}>{yamlMsg}</p>
        )}
        {yamlConfig && (
          <div className="text-[14px] space-y-0.5" style={{ color: "var(--text-muted)" }}>
            <p>Org: {yamlConfig.organization?.name || "N/A"}</p>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Generating..." : "Run Report"}
        </Button>
        {serverMsg && <span className="text-[15px]" style={{ color: "var(--text-muted)" }}>{serverMsg}</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   VULNERABILITIES VIEW
   ═══════════════════════════════════ */
function VulnerabilitiesView() {
  const [cves, setCves] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setCves(extractCVEs(await fetchReportMarkdown())); }
    catch (e: any) { setErr(e.message ?? "Unable to load."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cves.filter((c) => c.toLowerCase().includes(q)) : cves;
  }, [cves, query]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px]" style={{ color: "var(--text-muted)" }}>
          {filtered.length} CVE{filtered.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={load} disabled={loading} variant="secondary">
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {err && (
        <div className="rounded-sm p-3 text-[15px]" style={{ background: "rgba(229,83,75,0.08)", border: "1px solid rgba(229,83,75,0.15)", color: "var(--danger)" }}>
          {err}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-3.5 w-3.5" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search CVEs..."
          style={{
            ...inputStyle,
            paddingLeft: "32px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md" style={{ border: "1px solid var(--border)" }}>
        <table className="min-w-full text-[15px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
              <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                CVE
              </th>
              <th className="px-4 py-2.5 text-right text-[13px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                NVD
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-2.5"><div className="h-3.5 w-28 rounded skeleton" /></td>
                  <td className="px-4 py-2.5"><div className="h-3.5 w-16 rounded skeleton ml-auto" /></td>
                </tr>
              ))
            ) : filtered.length > 0 ? (
              filtered.map((cve) => (
                <tr
                  key={cve}
                  className="transition-colors duration-100 cursor-default"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-primary)" }}>
                    {cve}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      className="transition-colors duration-150 text-[14px]"
                      style={{ color: "var(--accent)" }}
                      href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                      target="_blank"
                      rel="noreferrer"
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-[15px]" style={{ color: "var(--text-muted)" }}>
                  No vulnerabilities found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   INTEL PAGE
   ═══════════════════════════════════ */
export default function IntelPage() {
  const [tab, setTab] = useState<Tab>("report");
  const [ready, setReady] = useState(false);
  const [reportMd, setReportMd] = useState("");
  const [reportErr, setReportErr] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadReport = useCallback(async (): Promise<boolean> => {
    setReportLoading(true);
    setReportErr(null);
    try {
      const md = await fetchReportMarkdown();
      setReportMd(md);
      return true;
    } catch (e: any) {
      setReportErr(e.message ?? "Unable to load report.");
      return false;
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport()
      .then((ok) => setTab(ok ? "report" : "generate"))
      .finally(() => setReady(true));
  }, [loadReport]);

  const handleReportGenerated = useCallback(async (reportHint?: string) => {
    const ok = await loadReport();
    if (!ok && reportHint) {
      setReportMd(reportHint);
      setReportErr(null);
    }
    setTab("report");
  }, [loadReport]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-sm w-full"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <TabButton active={tab === "report"} onClick={() => setTab("report")}>Report</TabButton>
        <TabButton active={tab === "generate"} onClick={() => setTab("generate")}>Generate</TabButton>
        <TabButton active={tab === "vulnerabilities"} onClick={() => setTab("vulnerabilities")}>Vulnerabilities</TabButton>
      </div>

      {tab === "report" && <ReportView key={reportKey} />}
      <div style={{ display: tab === "report" ? "block" : "none" }}>
        <ReportView md={reportMd} err={reportErr} loading={reportLoading} onRefresh={loadReport} />
      </div>
      <div style={{ display: tab === "generate" ? "block" : "none" }}>
        <GenerateView onReportGenerated={handleReportGenerated} />
      </div>
      <div style={{ display: tab === "vulnerabilities" ? "block" : "none" }}>
        <VulnerabilitiesView />
      </div>
    </div>
  );
}
