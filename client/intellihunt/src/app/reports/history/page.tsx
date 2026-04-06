"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArtifactListRow, fetchReportHistory } from "@/lib/api";

const SOURCE_LABELS: Record<string, string> = {
  manual_report:    "Manual",
  scheduled_report: "Scheduled",
  repo_scan:        "Repo Scan",
};

const SOURCE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  manual_report:    { bg: "rgba(45,126,248,0.12)", border: "rgba(45,126,248,0.35)", text: "#2d7ef8" },
  scheduled_report: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", text: "#10b981" },
  repo_scan:        { bg: "rgba(240,128,32,0.12)",  border: "rgba(240,128,32,0.35)",  text: "#f08020" },
};

const SOURCES = ["all", "manual_report", "scheduled_report", "repo_scan"] as const;

const PAGE_SIZE = 25;

export default function ReportHistoryPage() {
  const [items, setItems]   = useState<ArtifactListRow[]>([]);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const [source, setSource] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReportHistory({
        source: source === "all" ? undefined : source,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [source, offset]);

  useEffect(() => { load(); }, [load]);

  const pageCount  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            Report Archive
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {total} archived report{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Source filter */}
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => { setSource(s); setOffset(0); }}
              className="px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: source === s ? "var(--accent-subtle)" : "transparent",
                color: source === s ? "var(--accent)" : "var(--text-muted)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {s === "all" ? "All" : SOURCE_LABELS[s]}
            </button>
          ))}
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

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <table className="w-full text-[13px]">
          <thead>
            <tr
              className="text-left text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
            >
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3 text-right">CVEs</th>
              <th className="px-4 py-3 text-right">Critical</th>
              <th className="px-4 py-3 text-right">High</th>
              <th className="px-4 py-3 text-right">New</th>
              <th className="px-4 py-3 text-right">Resolved</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center" style={{ color: "var(--text-muted)" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center" style={{ color: "var(--text-muted)" }}>
                  No reports found.
                </td>
              </tr>
            )}
            {items.map((a) => {
              const sc = SOURCE_COLORS[a.source] ?? SOURCE_COLORS.manual_report;
              const m  = a.metrics;
              return (
                <tr
                  key={a.id}
                  className="transition-colors"
                  style={{ borderTop: "1px solid var(--border)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}
                    >
                      {SOURCE_LABELS[a.source] ?? a.source}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {a.username || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {m?.total_cves ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#f04060" }}>
                    {m?.critical_count ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#f08020" }}>
                    {m?.high_count ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#10b981" }}>
                    {m?.new_cves_count != null ? `+${m.new_cves_count}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {m?.resolved_cves_count != null ? `-${m.resolved_cves_count}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        background:
                          a.metrics_status === "ok"
                            ? "rgba(16,185,129,0.12)"
                            : a.metrics_status === "failed"
                            ? "rgba(240,64,96,0.12)"
                            : "rgba(240,128,32,0.12)",
                        color:
                          a.metrics_status === "ok"
                            ? "#10b981"
                            : a.metrics_status === "failed"
                            ? "#f04060"
                            : "#f08020",
                      }}
                    >
                      {a.metrics_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/reports/history/${a.id}`}
                      className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                      style={{
                        background: "var(--accent-subtle)",
                        border: "1px solid var(--accent-border)",
                        color: "var(--accent)",
                      }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px]">
          <span style={{ color: "var(--text-muted)" }}>
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md px-3 py-1.5 font-medium transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: offset === 0 ? "var(--text-muted)" : "var(--text-primary)",
                opacity: offset === 0 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md px-3 py-1.5 font-medium transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: offset + PAGE_SIZE >= total ? "var(--text-muted)" : "var(--text-primary)",
                opacity: offset + PAGE_SIZE >= total ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
