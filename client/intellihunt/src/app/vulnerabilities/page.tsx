"use client";

import { useEffect, useMemo, useState } from "react";
import { extractCVEs, fetchReportMarkdown } from "@/lib/api";

function NvdLink({ cve }: { cve: string }) {
  return (
    <a
      className="underline text-blue-300 hover:text-blue-200"
      href={`https://nvd.nist.gov/vuln/detail/${cve}`}
      target="_blank"
      rel="noreferrer"
    >
      Open on NVD
    </a>
  );
}

export default function Vulnerabilities() {
  const [cves, setCves] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const md = await fetchReportMarkdown();
        setCves(extractCVEs(md));
      } catch (e: any) {
        setErr(e.message ?? "Unable to load vulnerabilities.");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cves.filter((c) => c.toLowerCase().includes(q)) : cves;
  }, [cves, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Vulnerabilities</h1>
        <div className="text-sm text-slate-400">{filtered.length} item{filtered.length === 1 ? "" : "s"}</div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/60 p-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search CVE"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2
                     text-slate-100 placeholder:text-slate-500 md:w-80"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Identifier</th>
              <th className="px-3 py-2 text-left">Reference</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cve) => (
              <tr key={cve} className="border-t border-slate-800">
                <td className="px-3 py-2 font-mono text-slate-100">{cve}</td>
                <td className="px-3 py-2">
                  <NvdLink cve={cve} />
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-slate-400">
                  No entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
