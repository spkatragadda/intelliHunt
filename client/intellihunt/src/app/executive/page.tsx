"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/StatCard";
import {
  downloadCisoPdf,
  ExecutiveSummary,
  fetchExecutiveSummary,
} from "@/lib/api";

const RANGES: { label: string; days: number }[] = [
  { label: "7d",  days: 7   },
  { label: "30d", days: 30  },
  { label: "90d", days: 90  },
  { label: "1y",  days: 365 },
];

const SEV_COLORS = {
  critical: "#f04060",
  high:     "#f08020",
  medium:   "#2d7ef8",
  low:      "#10b981",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function formatBucket(t: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function deltaText(delta: number | null | undefined): string | undefined {
  if (delta == null || delta === 0) return undefined;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} vs previous`;
}

export default function ExecutivePage() {
  const [rangeDays, setRangeDays]     = useState<number>(90);
  const [summary, setSummary]         = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading]         = useState<boolean>(true);
  const [error, setError]             = useState<string | null>(null);
  const [exporting, setExporting]     = useState<boolean>(false);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const from = isoDaysAgo(days);
      const to   = new Date().toISOString();
      const data = await fetchExecutiveSummary(from, to);
      setSummary(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(rangeDays); }, [rangeDays, load]);

  const trendData = useMemo(
    () =>
      (summary?.trends || []).map((r) => ({
        ...r,
        label: formatBucket(r.t),
        drift: (r.new_cves || 0) - (r.resolved_cves || 0),
      })),
    [summary]
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCisoPdf(summary?.from, summary?.to);
    } catch (e: any) {
      setError(e?.message || "PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            Executive Summary
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            CISO-level posture trends for the selected window.
            {summary?.latest_snapshot_at && (
              <> Latest snapshot: {new Date(summary.latest_snapshot_at).toLocaleString()}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
          >
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRangeDays(r.days)}
                className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: rangeDays === r.days ? "var(--accent-subtle)" : "transparent",
                  color: rangeDays === r.days ? "var(--accent)" : "var(--text-muted)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
            style={{
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              opacity: exporting || loading ? 0.6 : 1,
            }}
          >
            {exporting ? "Exporting…" : "Export Board PDF"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: "rgba(240,64,96,0.1)",
            border: "1px solid rgba(240,64,96,0.35)",
            color: "#f04060",
          }}
        >
          {error}
        </div>
      )}

      {loading && !summary && (
        <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading…
        </div>
      )}

      {summary && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 mb-6">
            <StatCard
              title="Total CVEs"
              value={summary.kpis.total_cves?.value ?? 0}
              subtitle={deltaText(summary.kpis.total_cves?.delta)}
            />
            <StatCard
              title="Critical"
              value={summary.kpis.critical_count?.value ?? 0}
              subtitle={deltaText(summary.kpis.critical_count?.delta)}
            />
            <StatCard
              title="High"
              value={summary.kpis.high_count?.value ?? 0}
              subtitle={deltaText(summary.kpis.high_count?.delta)}
            />
            <StatCard
              title="CVSS Max"
              value={summary.kpis.cvss_max?.value ?? "—"}
            />
            <StatCard
              title="New CVEs"
              value={summary.kpis.new_cves?.value ?? 0}
              subtitle="since previous run"
            />
            <StatCard
              title="Resolved"
              value={summary.kpis.resolved_cves?.value ?? 0}
              subtitle="since previous run"
            />
          </div>

          {/* Total CVEs trend */}
          <ChartCard title="Total CVEs Over Time">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total_cves" name="Total" stroke="var(--accent)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="critical"   stroke={SEV_COLORS.critical} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="high"       stroke={SEV_COLORS.high}     strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Severity stack */}
          <ChartCard title="Severity Distribution">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="critical" stackId="s" fill={SEV_COLORS.critical} />
                <Bar dataKey="high"     stackId="s" fill={SEV_COLORS.high} />
                <Bar dataKey="medium"   stackId="s" fill={SEV_COLORS.medium} />
                <Bar dataKey="low"      stackId="s" fill={SEV_COLORS.low} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Drift */}
          <ChartCard title="Drift (New − Resolved) per Bucket">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} stroke="var(--border)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="new_cves"      name="New"      fill={SEV_COLORS.high} />
                <Bar dataKey="resolved_cves" name="Resolved" fill={SEV_COLORS.low} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Tables row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-2">
            <TablePanel title="Top Products">
              {summary.top_products.length === 0 ? (
                <EmptyRow />
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pb-2 text-left font-medium">Product</th>
                      <th className="pb-2 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.top_products.map((p, i) => (
                      <tr key={`${p.name}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2" style={{ color: "var(--text-primary)" }}>{p.name}</td>
                        <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {p.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TablePanel>

            <TablePanel title="Top CVEs (latest snapshot)">
              {summary.top_cves.length === 0 ? (
                <EmptyRow />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {summary.top_cves.map((cve) => (
                    <span
                      key={cve}
                      className="rounded-md px-2 py-1 text-[11px] font-mono"
                      style={{
                        background: "var(--accent-subtle)",
                        border: "1px solid var(--accent-border)",
                        color: "var(--accent)",
                      }}
                    >
                      {cve}
                    </span>
                  ))}
                </div>
              )}
            </TablePanel>
          </div>

          {/* MTTR placeholder */}
          <div className="mt-4">
            <TablePanel title="MTTR (Mean Time to Remediate)">
              <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {summary.mttr == null
                  ? "— (populated once CVE observation history is established)"
                  : `${summary.mttr} days`}
              </div>
            </TablePanel>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-4 rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function TablePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
      No data yet.
    </div>
  );
}
