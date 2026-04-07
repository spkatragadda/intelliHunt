"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ArtifactDetail, fetchArtifactDetail } from "@/lib/api";

const SOURCE_LABELS: Record<string, string> = {
  manual_report:    "Manual Report",
  scheduled_report: "Scheduled Report",
  repo_scan:        "Repo Scan",
};

export default function ArtifactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchArtifactDetail(id)
      .then(setArtifact)
      .catch((e) => setError(e?.message || "Failed to load artifact"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  if (error || !artifact) {
    return (
      <div className="mx-auto max-w-[900px] px-6 py-12">
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: "rgba(240,64,96,0.1)",
            border: "1px solid rgba(240,64,96,0.35)",
            color: "#f04060",
          }}
        >
          {error || "Artifact not found"}
        </div>
        <button
          onClick={() => router.push("/reports/history")}
          className="mt-4 text-[12px] font-medium"
          style={{ color: "var(--accent)" }}
        >
          Back to archive
        </button>
      </div>
    );
  }

  const m = artifact.metrics;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/reports/history")}
            className="mb-2 text-[12px] font-medium"
            style={{ color: "var(--accent)" }}
          >
            &larr; Back to archive
          </button>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            {SOURCE_LABELS[artifact.source] ?? artifact.source}
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {new Date(artifact.created_at).toLocaleString()}
            {artifact.username ? ` by ${artifact.username}` : ""}
            {" · "}
            {(artifact.byte_size / 1024).toFixed(1)} KB
          </p>
        </div>
        <a
          href={`data:text/markdown;charset=utf-8,${encodeURIComponent(artifact.markdown)}`}
          download={`report-${artifact.id}.md`}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
          style={{
            background: "var(--accent-subtle)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
          }}
        >
          Download MD
        </a>
      </div>

      {/* Metrics status badge */}
      {artifact.metrics_status === "failed" && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-[13px]"
          style={{
            background: "rgba(240,64,96,0.1)",
            border: "1px solid rgba(240,64,96,0.35)",
            color: "#f04060",
          }}
        >
          Metrics extraction failed: {artifact.metrics_error || "unknown error"}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Markdown */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="report-md" style={{ padding: "24px 28px" }}>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1>{children}</h1>,
                h2: ({ children }) => <h2>{children}</h2>,
                h3: ({ children }) => <h3>{children}</h3>,
                h4: ({ children }) => <h4>{children}</h4>,
                p:  ({ children }) => <p>{children}</p>,
                ul: ({ children }) => <ul>{children}</ul>,
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                code: ({ children }) => <code>{children}</code>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
                hr: () => <hr />,
              }}
            >
              {artifact.markdown || "*(empty report)*"}
            </ReactMarkdown>
          </div>
        </div>

        {/* Metrics sidebar */}
        {m && (
          <div
            className="rounded-xl h-fit"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="p-5">
              <h3
                className="mb-4 text-[10px] font-semibold uppercase tracking-[0.13em]"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
              >
                Metrics
              </h3>
              <div className="space-y-3 text-[13px]">
                <MetricRow label="Total CVEs"  value={m.total_cves} />
                <MetricRow label="Unique CVEs" value={m.unique_cves} />
                <MetricRow label="Critical"    value={m.critical_count} color="#f04060" />
                <MetricRow label="High"        value={m.high_count}     color="#f08020" />
                <MetricRow label="Medium"      value={m.medium_count}   color="#2d7ef8" />
                <MetricRow label="Low"         value={m.low_count}      color="#10b981" />
                <MetricRow label="CVSS Max"    value={m.cvss_max ?? "—"} />
                <MetricRow label="CVSS Avg"    value={m.cvss_avg ?? "—"} />
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "12px" }}>
                  <MetricRow label="New CVEs"      value={`+${m.new_cves_count}`}      color="#10b981" />
                  <MetricRow label="Resolved"      value={`-${m.resolved_cves_count}`}  />
                  <MetricRow label="Carried Over"  value={m.carried_over_count} />
                </div>
                {m.affected_products_count > 0 && (
                  <MetricRow label="Products" value={m.affected_products_count} />
                )}
              </div>

              {/* Top CVEs */}
              {m.cve_ids && m.cve_ids.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                  <h4
                    className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    CVE IDs ({m.cve_ids.length})
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {m.cve_ids.slice(0, 30).map((cve: string) => (
                      <span
                        key={cve}
                        className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                        style={{
                          background: "var(--accent-subtle)",
                          border: "1px solid var(--accent-border)",
                          color: "var(--accent)",
                        }}
                      >
                        {cve}
                      </span>
                    ))}
                    {m.cve_ids.length > 30 && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        +{m.cve_ids.length - 30} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: color || "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
