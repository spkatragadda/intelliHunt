"use client";

import { useEffect, useState } from "react";
import { extractCVEs, fetchReportMarkdown, guessLastUpdated } from "@/lib/api";
import StatCard from "@/components/StatCard";
import Button from "@/components/Button";
import Link from "next/link";

export default function Dashboard() {
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [cveCount, setCveCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const md = await fetchReportMarkdown();
        setCveCount(extractCVEs(md).length);
        setLastUpdated(guessLastUpdated(md));
      } catch (e: any) {
        setErr(e.message ?? "Unable to load the latest report.");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Overview</h1>
        <div className="flex gap-2">
          <Button href="/report">Open Report</Button>
          <Button href="/vulnerabilities">Browse Vulnerabilities</Button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/60 p-3 text-sm text-red-300">
          {err} Check that the API is available at <code className="text-red-200">http://localhost:8000/api/markdown/</code>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Referenced CVEs" value={cveCount} />
        <StatCard title="Last Report" value={lastUpdated} />
        <StatCard
          title="Quick Access"
          value={<Link className="underline" href="/report">View current report</Link>}
        />
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-slate-100">Latest Intelligence</h2>
            <p className="mt-1 text-sm text-slate-300">
              Review the compiled vulnerability report and jump directly to affected identifiers.
            </p>
          </div>
          <div className="flex gap-2">
            <Button href="/report">Open Report</Button>
            <Button href="/vulnerabilities">Browse CVEs</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
