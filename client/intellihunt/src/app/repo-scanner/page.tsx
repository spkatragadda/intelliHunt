"use client";

import { useState, useEffect } from "react";
import Button from "@/components/Button";
import { scanRepo, checkTaskStatus } from "@/lib/api";

export default function RepoScanner() {
  const [repoUrl, setRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [scanResults, setScanResults] = useState<string | null>(null);

  // Polling effect for task status
  useEffect(() => {
    if (!taskId) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await checkTaskStatus(taskId);
        setProgress(status.progress);
        setProgressMessage(status.message);

        if (status.status === 'completed') {
          setSubmitting(false);
          setServerMsg("Repository scan completed successfully!");
          setScanResults(status.output || "Scan completed with no output.");
          setTaskId(null);
          clearInterval(pollInterval);
        } else if (status.status === 'error') {
          setSubmitting(false);
          setServerMsg(`Error: ${status.message}`);
          setTaskId(null);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error checking task status:', error);
        setSubmitting(false);
        setServerMsg("Error checking task status");
        setTaskId(null);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [taskId]);

  async function handleScan() {
    if (!repoUrl.trim()) {
      setServerMsg("Please enter a repository URL, local file path, or directory path.");
      return;
    }

    setSubmitting(true);
    setServerMsg(null);
    setProgress(0);
    setProgressMessage("Starting repository scan...");
    setScanResults(null);

    try {
      const res = await scanRepo(repoUrl.trim());

      if (res.taskId) {
        setTaskId(res.taskId);
        setServerMsg("Repository scan started. Please wait...");
      } else {
        setServerMsg(res.message || "Failed to start repository scan.");
        setSubmitting(false);
      }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed to submit scan request.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Repo Scanner</h1>
        <div className="text-sm text-slate-400">Scan repositories for vulnerabilities</div>
      </div>

      {/* Input Section */}
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <h2 className="font-medium text-slate-100 mb-2">Repository Input</h2>
          <p className="text-sm text-slate-300 mb-4">
            Enter a GitHub repository URL (e.g., https://github.com/user/repo), 
            a local directory path, or a local file path to scan for vulnerabilities.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo or /path/to/repo or /path/to/file"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  handleScan();
                }
              }}
            />
            <Button
              onClick={handleScan}
              className={submitting ? "opacity-70 cursor-not-allowed" : ""}
              disabled={submitting}
            >
              {submitting ? "Scanning…" : "Start Scan"}
            </Button>
          </div>
        </div>
      </section>

      {/* Progress Section */}
      {submitting && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-slate-100">Scan Progress</h3>
            <span className="text-sm text-slate-400">{progress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-slate-300">{progressMessage}</p>
        </div>
      )}

      {/* Status Message */}
      {serverMsg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            serverMsg.includes("Error") || serverMsg.includes("Failed")
              ? "border-red-900/60 bg-red-950/60 text-red-300"
              : serverMsg.includes("completed")
              ? "border-green-900/60 bg-green-950/60 text-green-300"
              : "border-blue-900/60 bg-blue-950/60 text-blue-300"
          }`}
        >
          {serverMsg}
        </div>
      )}

      {/* Scan Results */}
      {scanResults && (
        <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-100">Scan Results</h2>
            <Button
              onClick={() => {
                const blob = new Blob([scanResults], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `scan-results-${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              className="bg-slate-700 hover:bg-slate-600"
            >
              Download Results
            </Button>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-300 max-h-96 overflow-y-auto">
              {scanResults}
            </pre>
          </div>
        </section>
      )}

      {/* Info Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium text-slate-100 mb-2">About Repository Scanning</h2>
        <div className="text-sm text-slate-300 space-y-2">
          <p>
            The repository scanner performs comprehensive vulnerability analysis using:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>OSV-Scanner for dependency vulnerabilities</li>
            <li>Semgrep for static code analysis</li>
            <li>CISA Known Exploited Vulnerabilities (KEV) database</li>
            <li>National Vulnerability Database (NVD) searches</li>
            <li>GitHub Security Advisories</li>
          </ul>
          <p className="mt-2 text-slate-400">
            Scans may take several minutes depending on repository size and complexity.
          </p>
        </div>
      </section>
    </div>
  );
}

