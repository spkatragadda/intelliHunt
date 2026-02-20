"use client";

import { useState, useEffect, useRef } from "react";
import Button from "@/components/Button";
import { scanRepo, checkTaskStatus } from "@/lib/api";
import ReactMarkdown from 'react-markdown';

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
  fontSize: "14px",
  color: "var(--text-primary)",
  outline: "none",
  transition: "border-color 150ms",
};

export default function RepoScanner() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoFile, setRepoFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [submitting, setSubmitting] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [scanResults, setScanResults] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!taskId) return;
    const id = setInterval(async () => {
      try {
        const s = await checkTaskStatus(taskId);
        setProgress(s.progress);
        setProgressMessage(s.message);
        if (s.status === "completed") {
          setSubmitting(false); setServerMsg("Scan completed!");
          setScanResults(s.output || "No output."); setTaskId(null); clearInterval(id);
        } else if (s.status === "error") {
          setSubmitting(false); setServerMsg(`Error: ${s.message}`); setTaskId(null); clearInterval(id);
        }
      } catch {
        setSubmitting(false); setServerMsg("Error checking status"); setTaskId(null); clearInterval(id);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [taskId]);

  async function handleScan() {
    if (inputMode === "url" && !repoUrl.trim()) { setServerMsg("Enter a repository URL."); return; }
    if (inputMode === "file" && !repoFile) { setServerMsg("Select a zip file."); return; }

    setSubmitting(true); setServerMsg(null); setProgress(0);
    setProgressMessage("Starting scan..."); setScanResults(null);

    try {
      const res = inputMode === "file" ? await scanRepo(undefined, repoFile!) : await scanRepo(repoUrl.trim());
      if (res.taskId) { setTaskId(res.taskId); setServerMsg("Scan started..."); }
      else { setServerMsg(res.message || "Failed."); setSubmitting(false); }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed."); setSubmitting(false);
    }
  }

  const ModeBtn = ({ mode, label }: { mode: "url" | "file"; label: string }) => (
    <button
      type="button"
      onClick={() => {
        setInputMode(mode);
        if (mode === "url") { setRepoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
        else setRepoUrl("");
      }}
      className="px-3 py-2 rounded-sm text-[14px] font-medium transition-colors duration-150"
      style={{
        color: inputMode === mode ? "var(--text-primary)" : "var(--text-muted)",
        background: inputMode === mode ? "var(--surface-hover)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (inputMode !== mode) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (inputMode !== mode) e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="p-4 space-y-4" style={card}>
        <div
          className="flex gap-1 p-1 rounded-sm w-fit"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          <ModeBtn mode="url" label="GitHub URL" />
          <ModeBtn mode="file" label="Upload Zip" />
        </div>

        {inputMode === "url" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              style={inputStyle}
              disabled={submitting}
              onKeyDown={(e) => { if (e.key === "Enter" && !submitting) handleScan(); }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <Button onClick={handleScan} disabled={submitting} className="!px-6 !py-2 !text-[14px]">
              {submitting ? "Scanning..." : "Scan"}
            </Button>
          </div>
        )}

        {inputMode === "file" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && !f.name.endsWith(".zip")) { setServerMsg("Select a .zip file."); return; }
                  if (f) { setRepoFile(f); setServerMsg(null); }
                }}
                className="hidden"
                id="repo-file-input"
                disabled={submitting}
              />
              <label
                htmlFor="repo-file-input"
                className="flex-1 cursor-pointer transition-colors duration-150"
                style={{
                  ...inputStyle,
                  display: "block",
                  color: repoFile ? "var(--text-primary)" : "var(--text-muted)",
                  opacity: submitting ? 0.4 : 1,
                }}
              >
                {repoFile ? repoFile.name : "Choose zip file..."}
              </label>
              <Button onClick={handleScan} disabled={submitting || !repoFile} className="!px-6 !py-2 !text-[14px]">
                {submitting ? "Scanning..." : "Scan"}
              </Button>
            </div>
            {repoFile && (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {repoFile.name} ({(repoFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      {submitting && (
        <div className="space-y-2 p-4" style={card}>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>Progress</span>
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{progress}%</span>
          </div>
          <div className="w-full h-1 rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "var(--accent)" }} />
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{progressMessage}</p>
        </div>
      )}

      {/* Status */}
      {serverMsg && (
        <div
          className="rounded-sm p-3 text-[14px]"
          style={{
            color: serverMsg.includes("Error") || serverMsg.includes("Failed") ? "var(--danger)"
              : serverMsg.includes("completed") || serverMsg.includes("Completed") ? "var(--success)"
                : "var(--info)",
            background: serverMsg.includes("Error") || serverMsg.includes("Failed") ? "rgba(229,83,75,0.08)"
              : serverMsg.includes("completed") || serverMsg.includes("Completed") ? "rgba(69,212,131,0.08)"
                : "rgba(83,155,245,0.08)",
            border: `1px solid ${serverMsg.includes("Error") || serverMsg.includes("Failed") ? "rgba(229,83,75,0.15)"
                : serverMsg.includes("completed") || serverMsg.includes("Completed") ? "rgba(69,212,131,0.15)"
                  : "rgba(83,155,245,0.15)"
              }`,
          }}
        >
          {serverMsg}
        </div>
      )}

      {/* Results */}
      {scanResults && (
        <div className="p-4 space-y-3" style={card}>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>Results</span>
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([scanResults], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `scan-results-${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              Download
            </Button>
          </div>
          <div className="rounded-sm p-4 max-h-96 overflow-y-auto" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            {/* <pre className="whitespace-pre-wrap break-words text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {scanResults}
            </pre> */}
            <ReactMarkdown>
              {scanResults}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
