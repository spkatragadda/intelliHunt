"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { fetchReportMarkdown, PUBLIC_API_BASE } from "@/lib/api";
import Button from "@/components/Button";

export default function Report() {
  const [md, setMd] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadReport = async () => {
    setLoading(true);
    setErr(null);
    try {
      const text = await fetchReportMarkdown();
      setMd(text);
    } catch (e: any) {
      setErr(e.message ?? "Unable to load the report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const download = () => {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
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
      <div className="rounded-lg border border-red-900/60 bg-red-950/60 p-3 text-sm text-red-300">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Report</h1>
        <div className="flex gap-2">
          <Button 
            onClick={loading ? undefined : loadReport} 
            className={loading ? "opacity-50 cursor-not-allowed" : ""}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button onClick={download}>Download</Button>
          <Button href={`${PUBLIC_API_BASE}/api/markdown/`} target="_blank">
            Open Raw
          </Button>
        </div>
      </div>

      <div className="max-w-none space-y-4 text-slate-300">
        <div
          className="[&_h1]:text-2xl [&_h1]:text-slate-100
                      [&_h2]:text-xl [&_h2]:text-slate-100
                      [&_h3]:text-lg [&_h3]:text-slate-100
                      [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:rounded-lg
                      [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded"
        >
          <ReactMarkdown>{md}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
