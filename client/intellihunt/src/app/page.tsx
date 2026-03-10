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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Label } from "@/components/ui/label";

type Tab = "dashboard" | "generate" | "vulnerabilities";


/* ─── CVE / Dashboard Types ─── */
type CVESeverity = "critical" | "high" | "medium" | "low" | "unknown";

type CVEEntry = {
  id: string;
  score: number | null;
  severity: CVESeverity;
  context: string;
};

type SoftwareEntry = {
  name: string;
  cveCount: number;
  maxScore: number;
  severity: CVESeverity;
};

type DashboardData = {
  total: number;
  bySeverity: { critical: number; high: number; medium: number; low: number; unknown: number };
  topThreats: CVEEntry[];
  vulnerableSoftware: SoftwareEntry[];
  cves: CVEEntry[];
};

const SEV_COLORS: Record<CVESeverity, string> = {
  critical: "#f43f5e",   // rose-500 — vivid red, clearly distinct from high
  high:     "#f97316",   // orange-500 — warm orange, clearly distinct from critical
  medium:   "#3b82f6",   // blue-500
  low:      "#22c55e",   // green-500
  unknown:  "#64748b",   // slate-500
};

const SEV_BG: Record<CVESeverity, string> = {
  critical: "rgba(244,63,94,0.13)",
  high:     "rgba(249,115,22,0.13)",
  medium:   "rgba(59,130,246,0.13)",
  low:      "rgba(34,197,94,0.13)",
  unknown:  "rgba(100,116,139,0.10)",
};

/* ─── Markdown Parsing ─── */
function scoreToSeverity(score: number): CVESeverity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score > 0)    return "low";
  return "unknown";
}

function textToSeverity(text: string): CVESeverity | null {
  const t = text.toLowerCase();
  if (t.includes("critical"))                    return "critical";
  if (t.includes("high"))                        return "high";
  if (t.includes("medium") || t.includes("moderate")) return "medium";
  if (t.includes("low"))                         return "low";
  return null;
}

function parseDashboardData(md: string): DashboardData {
  const cveRe = /\bCVE-\d{4}-\d{4,7}\b/gi;
  const seen = new Set<string>();
  const entries: CVEEntry[] = [];

  for (const m of md.matchAll(cveRe)) {
    const id = m[0].toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const idx = m.index!;
    const context = md.slice(Math.max(0, idx - 120), idx + 600);

    let score: number | null = null;
    let severity: CVESeverity = "unknown";

    const scorePatterns = [
      /(?:CVSS(?:\s+(?:v\d)?(?:\s+Base)?\s+Score)?)[:\s]+(\d+(?:\.\d+)?)/i,
      /\bScore[:\s]+(\d+(?:\.\d+)?)/i,
      /\b(\d+\.\d)\s*(?:\/\s*10|\(Critical|\(High|\(Medium|\(Low)/i,
    ];
    for (const p of scorePatterns) {
      const sm = context.match(p);
      if (sm) {
        const n = parseFloat(sm[1]);
        if (n >= 0 && n <= 10) { score = n; severity = scoreToSeverity(n); break; }
      }
    }
    if (score === null) {
      const sev = textToSeverity(context);
      if (sev) severity = sev;
    }

    entries.push({ id, score, severity, context });
  }

  /* Software extraction */
  const softwareMap = new Map<string, { cveCount: number; maxScore: number; severity: CVESeverity }>();
  const swPatterns = [
    /(?:Affected\s+(?:Products?|Software|Systems?|Applications?))[:\s]+([^\n,;.]+)/gi,
    /(?:Product(?:s?)|Software|Application(?:s?))[:\s]+([^\n,;.]+)/gi,
    /(?:affects?|vulnerable\s+in|found\s+in)[:\s]+([^\n,;.]+)/gi,
  ];

  for (const entry of entries) {
    for (const p of swPatterns) {
      for (const m of entry.context.matchAll(p)) {
        const sw = m[1].trim().replace(/\*+/g, "").trim();
        if (sw.length > 2 && sw.length < 80 && !/^(CVE|CVSS|the|a|an|this|these)\b/i.test(sw)) {
          const ex = softwareMap.get(sw);
          if (ex) {
            ex.cveCount++;
            if ((entry.score ?? 0) > ex.maxScore) {
              ex.maxScore = entry.score ?? 0;
              ex.severity = entry.severity;
            }
          } else {
            softwareMap.set(sw, { cveCount: 1, maxScore: entry.score ?? 0, severity: entry.severity });
          }
        }
      }
    }
  }

  const vulnerableSoftware: SoftwareEntry[] = [...softwareMap.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.maxScore - a.maxScore || b.cveCount - a.cveCount)
    .slice(0, 10);

  const bySeverity = {
    critical: entries.filter(e => e.severity === "critical").length,
    high:     entries.filter(e => e.severity === "high").length,
    medium:   entries.filter(e => e.severity === "medium").length,
    low:      entries.filter(e => e.severity === "low").length,
    unknown:  entries.filter(e => e.severity === "unknown").length,
  };

  const topThreats = entries
    .filter(e => e.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 12);

  return { total: entries.length, bySeverity, topThreats, vulnerableSoftware, cves: entries };
}

/* ─── Sparkline ─── */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const vs = values.slice(-8);
  const max = Math.max(...vs, 0.01);
  const W = 44, H = 18;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      {vs.map((v, i) => {
        const barW = Math.floor(W / vs.length) - 1;
        const h = Math.max(2, Math.round((v / max) * (H - 2)));
        return (
          <rect key={i} x={i * (W / vs.length)} y={H - h} width={barW} height={h}
            fill={color} opacity={0.22 + 0.78 * ((i + 1) / vs.length)} rx="1" />
        );
      })}
    </svg>
  );
}

/* ─── Highlight CVEs in text ─── */
function HighlightCVEs({ text }: { text: string }) {
  const parts = text.split(/\b(CVE-\d{4}-\d{4,7})\b/gi);
  return (
    <>
      {parts.map((p, i) =>
        /^CVE-\d{4}-\d{4,7}$/i.test(p)
          ? <code key={i} className="font-mono text-[10px] px-1 py-0.5 rounded"
              style={{ color: "var(--accent)", background: "var(--accent-muted)" }}>{p.toUpperCase()}</code>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

/* ─── Split software name ─── */
function splitSoftwareName(name: string): { short: string; detail: string } {
  const clean = name.replace(/\*+/g, "").trim();
  const m = clean.search(/\s+(?:v\d|\d+\.\d+|versions?|prior|before|through|since|up to|and later|and earlier)\b/i);
  if (m > 0 && m <= 42) return { short: clean.slice(0, m).trim(), detail: clean.slice(m).trim() };
  if (clean.length > 36) {
    const sp = clean.lastIndexOf(" ", 36);
    return { short: clean.slice(0, sp > 6 ? sp : 36).trim(), detail: clean.slice(sp > 6 ? sp : 36).trim() };
  }
  return { short: clean, detail: "" };
}

/* ─── Formatted Report ─── */
function FormattedReport({ md }: { md: string }) {
  type Section = { heading: string; level: number; content: string[] };
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const line of md.split("\n")) {
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      if (cur) sections.push(cur);
      cur = { heading: hm[2].trim(), level: hm[1].length, content: [] };
    } else if (cur) {
      cur.content.push(line);
    }
  }
  if (cur) sections.push(cur);
  const visible = sections.filter(s => s.heading || s.content.some(l => l.trim()));
  if (!visible.length) return <p className="text-[13px] p-6" style={{ color: "var(--text-muted)" }}>No structured sections found.</p>;
  return (
    <div className="space-y-3 px-6 py-5 overflow-y-auto" style={{ maxHeight: 640, background: "var(--bg)" }}>
      {visible.map((s, i) => {
        const body = s.content.filter(l => l.trim());
        return (
          <div key={i} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: "var(--surface)", borderBottom: body.length ? "1px solid var(--border)" : "none" }}>
              {s.level === 1 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />}
              <span style={{
                fontSize: s.level === 1 ? "14px" : s.level === 2 ? "13px" : "12px",
                fontWeight: s.level <= 2 ? 600 : 500,
                color: s.level === 1 ? "var(--accent)" : "var(--text-primary)",
              }}>{s.heading}</span>
            </div>
            {body.length > 0 && (
              <div className="px-4 py-3 space-y-1.5" style={{ background: "var(--bg)" }}>
                {body.map((line, j) => {
                  const isBullet = /^\s*[-*•]\s/.test(line);
                  const kvMatch = !isBullet && line.match(/^([^:]{2,28}):\s*(.+)/);
                  if (isBullet) return (
                    <div key={j} className="flex items-start gap-2">
                      <span className="text-[11px] mt-[3px] flex-shrink-0" style={{ color: "var(--accent)" }}>▸</span>
                      <span className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        <HighlightCVEs text={line.replace(/^\s*[-*•]\s/, "")} />
                      </span>
                    </div>
                  );
                  if (kvMatch) return (
                    <div key={j} className="flex items-baseline gap-3 py-1.5 text-[12px]"
                      style={{ borderBottom: "1px solid var(--border)" }}>
                      <span className="font-semibold flex-shrink-0 uppercase tracking-wide text-[10px]"
                        style={{ width: "130px", color: "var(--text-muted)" }}>{kvMatch[1]}</span>
                      <span style={{ color: "var(--text-primary)" }}><HighlightCVEs text={kvMatch[2]} /></span>
                    </div>
                  );
                  return (
                    <p key={j} className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      <HighlightCVEs text={line} />
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Severity Donut ─── */
function SeverityDonut({ data, activeSeverity, onFilter }: {
  data: DashboardData["bySeverity"];
  activeSeverity: CVESeverity | null;
  onFilter: (s: CVESeverity | null) => void;
}) {
  const entries = (
    [
      { key: "critical" as CVESeverity, label: "Critical", value: data.critical },
      { key: "high"     as CVESeverity, label: "High",     value: data.high     },
      { key: "medium"   as CVESeverity, label: "Medium",   value: data.medium   },
      { key: "low"      as CVESeverity, label: "Low",      value: data.low      },
      { key: "unknown"  as CVESeverity, label: "Unknown",  value: data.unknown  },
    ] as { key: CVESeverity; label: string; value: number }[]
  ).filter(e => e.value > 0);

  const total = entries.reduce((s, e) => s + e.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-6">
        {/* Ghost donut ring */}
        <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
          <svg viewBox="0 0 160 160" style={{ width: 160, height: 160 }}>
            {/* Base ring */}
            <circle cx="80" cy="80" r="64" fill="none" stroke="var(--border)" strokeWidth={22} />
            <circle cx="80" cy="80" r="64" fill="none" stroke="var(--surface-raised)" strokeWidth={22}
              strokeDasharray="50 352" strokeLinecap="round"
              className="animate-spin-slow"
              style={{ transformOrigin: "80px 80px" }}
            />
            {/* Center */}
            <circle cx="80" cy="80" r="33" fill="var(--bg)" />
            <text x="80" y="76" textAnchor="middle" fill="var(--text-muted)" fontSize="10.5" letterSpacing="0.06em" fontWeight="600">NO DATA</text>
            <text x="80" y="91" textAnchor="middle" fill="var(--text-muted)" fontSize="8.5" letterSpacing="0.1em" opacity="0.6">RUN REPORT</text>
          </svg>
        </div>
        {/* Ghost legend */}
        <div className="flex-1 space-y-1.5">
          {[
            { label: "Critical", w: "55%" },
            { label: "High",     w: "40%" },
            { label: "Medium",   w: "65%" },
            { label: "Low",      w: "30%" },
          ].map(({ label, w }) => (
            <div key={label} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--border-hover)" }} />
              <span className="text-[13px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>{label}</span>
              <div className="flex-1 flex items-center gap-2 justify-end">
                <div className="h-1.5 rounded-full skeleton" style={{ width: w }} />
                <span className="text-[12px] tabular-nums opacity-30" style={{ color: "var(--text-muted)", minWidth: "18px", textAlign: "right" }}>—</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cx = 80, cy = 80, r = 64, inner = 42;
  let angle = -Math.PI / 2;
  const slices = entries.map(e => {
    const frac = e.value / total;
    const a0 = angle, a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const lg = frac > 0.5 ? 1 : 0;
    const cos0 = Math.cos(a0), sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
    return {
      ...e,
      color: SEV_COLORS[e.key],
      path: [
        `M ${cx + r * cos0} ${cy + r * sin0}`,
        `A ${r} ${r} 0 ${lg} 1 ${cx + r * cos1} ${cy + r * sin1}`,
        `L ${cx + inner * cos1} ${cy + inner * sin1}`,
        `A ${inner} ${inner} 0 ${lg} 0 ${cx + inner * cos0} ${cy + inner * sin0}`,
        "Z",
      ].join(" "),
    };
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
        <svg viewBox="0 0 160 160" style={{ width: 160, height: 160 }}>
          {slices.map(s => {
            const isActive = activeSeverity === s.key;
            const isDimmed = activeSeverity !== null && !isActive;
            return (
              <path
                key={s.key}
                d={s.path}
                fill={s.color}
                style={{
                  opacity: isDimmed ? 0.15 : 1,
                  cursor: "pointer",
                  transition: "opacity 200ms, transform 150ms",
                  transformOrigin: `${cx}px ${cy}px`,
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                }}
                onClick={() => onFilter(isActive ? null : s.key)}
              />
            );
          })}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)" fontSize="26" fontWeight="700">{total}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-muted)" fontSize="9" letterSpacing="0.1em">TOTAL CVEs</text>
        </svg>
      </div>
      <div className="flex-1 space-y-1.5">
        {entries.map(e => {
          const isActive = activeSeverity === e.key;
          const isDimmed = activeSeverity !== null && !isActive;
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => onFilter(isActive ? null : e.key)}
              className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 transition-all duration-150 text-left"
              style={{
                opacity: isDimmed ? 0.32 : 1,
                background: isActive ? `${SEV_COLORS[e.key]}12` : "transparent",
                border: isActive ? `1px solid ${SEV_COLORS[e.key]}35` : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEV_COLORS[e.key] }} />
                <span className="text-[13px] capitalize" style={{ color: "var(--text-secondary)" }}>{e.label}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-1 rounded-full" style={{
                  width: `${Math.round((e.value / total) * 52)}px`,
                  background: SEV_COLORS[e.key],
                  opacity: 0.4,
                }} />
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: SEV_COLORS[e.key], minWidth: "18px", textAlign: "right" }}>{e.value}</span>
              </div>
            </button>
          );
        })}
        {activeSeverity && (
          <button type="button" onClick={() => onFilter(null)}
            className="text-[11px] w-full text-center py-1 rounded-md mt-1 transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--surface-hover)" }}>
            Clear filter ×
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Threat Bar Chart ─── */
function ThreatBarChart({ threats, activeSeverity }: { threats: CVEEntry[]; activeSeverity: CVESeverity | null }) {
  const filtered = activeSeverity ? threats.filter(t => t.severity === activeSeverity) : threats;

  if (threats.length === 0) {
    return (
      <div className="space-y-2">
        {/* Ghost skeleton bars */}
        {[88, 73, 61, 52, 42, 34, 24].map((w, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.1 }}>
            <div className="skeleton h-3 rounded flex-shrink-0" style={{ width: "148px", opacity: 0.35 }} />
            <div className="relative flex-1 rounded-sm overflow-hidden" style={{ height: 22, background: "var(--bg)" }}>
              <div className="absolute inset-y-0 left-0 rounded-sm skeleton" style={{ width: `${w}%`, opacity: 0.4 }} />
            </div>
            <div className="skeleton h-3 rounded flex-shrink-0" style={{ width: "32px", opacity: 0.35 }} />
          </div>
        ))}
        <p className="text-center text-[12px] pt-2" style={{ color: "var(--text-muted)" }}>
          No ranked threats — generate a report first
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[13px]" style={{ color: "var(--text-muted)" }}>
        No {activeSeverity} severity threats found
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 340 }}>
      {filtered.map(t => (
        <div key={t.id} className="flex items-center gap-3">
          <span
            className="text-[11px] flex-shrink-0 text-right"
            style={{ width: 148, color: "var(--text-muted)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}
          >
            {t.id}
          </span>
          <div className="relative flex-1 rounded-sm overflow-hidden" style={{ height: 22, background: "var(--bg)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${((t.score ?? 0) / 10) * 100}%`,
                background: `linear-gradient(90deg, ${SEV_COLORS[t.severity]}80, ${SEV_COLORS[t.severity]})`,
                transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </div>
          <span
            className="text-[13px] font-bold tabular-nums flex-shrink-0"
            style={{ width: 32, textAlign: "right", color: SEV_COLORS[t.severity] }}
          >
            {t.score?.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({
  label, value, color, sub, icon, active, onClick, sparkValues = [],
}: {
  label: string; value: number | string; color: string; sub?: string;
  icon: React.ReactNode; active?: boolean; onClick?: () => void; sparkValues?: number[];
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex-1 min-w-0 p-5 rounded-xl relative overflow-hidden text-left"
      style={{
        background: active ? `${color}0d` : "var(--surface)",
        border: `1px solid ${active ? `${color}55` : hov && onClick ? "var(--border-hover)" : "var(--border)"}`,
        borderTopColor: active ? `${color}55` : "rgba(255,255,255,0.06)",
        cursor: onClick ? "pointer" : "default",
        transform: hov && onClick ? "translateY(-2px)" : "none",
        transition: "all 200ms ease",
        boxShadow: active
          ? `0 0 0 1px ${color}25, 0 8px 28px ${color}18, 0 1px 0 rgba(255,255,255,0.04) inset`
          : hov
          ? "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.5)"
          : "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.13em] font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
          {label}
        </span>
        <div className="flex items-center justify-center rounded-lg w-7 h-7 flex-shrink-0" style={{
          background: `${color}18`,
          border: `1px solid ${color}38`,
        }}>
          <span style={{ color, display: "flex" }}>{icon}</span>
        </div>
      </div>
      <div className="text-[38px] font-bold tabular-nums leading-none mb-2" style={{ color, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>{value}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
        <Sparkline values={sparkValues} color={color} />
      </div>
      {active && (
        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      )}
      <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${color}44, transparent)` }} />
    </button>
  );
}

/* ═══════════════════════════════════
   DASHBOARD VIEW
   ═══════════════════════════════════ */
function DashboardView({
  md, loading, err, onRefresh,
}: {
  md: string; loading: boolean; err: string | null; onRefresh: () => void;
}) {
  const data = useMemo(() => parseDashboardData(md), [md]);
  const [activeSeverity, setActiveSeverity] = useState<CVESeverity | null>(null);
  const [swSearch, setSwSearch] = useState("");
  const [reportView, setReportView] = useState<"markdown" | "formatted">("markdown");
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleFilter = useCallback((s: CVESeverity | null) => {
    setActiveSeverity(prev => prev === s ? null : s);
  }, []);

  const handleCardClick = (s: CVESeverity | "total") => {
    if (s === "total") { setActiveSeverity(null); return; }
    setActiveSeverity(prev => prev === s ? null : s);
  };

  const filteredSoftware = useMemo(() => {
    let sw = data.vulnerableSoftware;
    if (activeSeverity) sw = sw.filter(s => s.severity === activeSeverity);
    if (swSearch.trim()) {
      const q = swSearch.toLowerCase();
      sw = sw.filter(s => s.name.toLowerCase().includes(q));
    }
    return sw;
  }, [data.vulnerableSoftware, activeSeverity, swSearch]);

  const copyReport = () => {
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }).catch(() => {});
  };

  const downloadReport = () => {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "intellihunt_report.md";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading && !md) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (err && !md) {
    return (
      <div className="space-y-4 py-8 text-center">
        <div className="rounded-md p-4 text-[15px] inline-block" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.15)", color: "var(--danger)" }}>
          {err}
        </div>
        <p className="text-[15px]" style={{ color: "var(--text-muted)" }}>
          No report available. Use the <strong style={{ color: "var(--text-primary)" }}>Generate</strong> tab to create one.
        </p>
      </div>
    );
  }

  const sparkBySev = (sev: CVESeverity) =>
    data.cves.filter(c => c.severity === sev && c.score !== null).map(c => c.score as number);
  const sparkAll = [...sparkBySev("critical"), ...sparkBySev("high"), ...sparkBySev("medium"), ...sparkBySev("low")];

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}>
              Threat Dashboard
            </h2>
            {md && (
              <button
                type="button"
                onClick={() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition-opacity hover:opacity-70"
                style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
              >
                View Report ↓
              </button>
            )}
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            NVD vulnerability analysis{activeSeverity ? (
              <> · <span className="font-medium capitalize" style={{ color: SEV_COLORS[activeSeverity] }}>{activeSeverity} filter active</span>
              <button type="button" onClick={() => setActiveSeverity(null)} className="ml-1.5 opacity-60 hover:opacity-100" style={{ color: "var(--text-muted)" }}>✕</button></>
            ) : ""}
          </p>
        </div>
        {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 mt-1 flex-shrink-0" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />}
      </div>

      {/* ── Stat row ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard
          label="Total CVEs"
          value={data.total}
          color="var(--accent)"
          sub="All severities"
          active={activeSeverity === null && data.total > 0}
          onClick={() => handleCardClick("total")}
          sparkValues={sparkAll}
          icon={
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          }
        />
        <StatCard
          label="Critical"
          value={data.bySeverity.critical}
          color={SEV_COLORS.critical}
          sub="CVSS 9.0–10.0"
          active={activeSeverity === "critical"}
          onClick={() => handleCardClick("critical")}
          sparkValues={sparkBySev("critical")}
          icon={
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 5a1 1 0 011 1v4a1 1 0 11-2 0V8a1 1 0 011-1zm0 9a1.25 1.25 0 110-2.5A1.25 1.25 0 0112 16z" />
            </svg>
          }
        />
        <StatCard
          label="High"
          value={data.bySeverity.high}
          color={SEV_COLORS.high}
          sub="CVSS 7.0–8.9"
          active={activeSeverity === "high"}
          onClick={() => handleCardClick("high")}
          sparkValues={sparkBySev("high")}
          icon={
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
          }
        />
        <StatCard
          label="Med / Low"
          value={data.bySeverity.medium + data.bySeverity.low}
          color={SEV_COLORS.medium}
          sub="CVSS < 7.0"
          active={activeSeverity === "medium" || activeSeverity === "low"}
          onClick={() => {
            if (activeSeverity === "medium" || activeSeverity === "low") setActiveSeverity(null);
            else setActiveSeverity("medium");
          }}
          sparkValues={[...sparkBySev("medium"), ...sparkBySev("low")]}
          icon={
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          }
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Severity Distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Severity Distribution</CardTitle>
              {activeSeverity && (
                <button type="button" onClick={() => setActiveSeverity(null)}
                  className="text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{ color: "var(--text-muted)", background: "var(--surface-hover)" }}>
                  Clear filter
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <SeverityDonut data={data.bySeverity} activeSeverity={activeSeverity} onFilter={handleFilter} />
          </CardContent>
        </Card>

        {/* Top Threats */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Threats Ranked by Score</CardTitle>
              {activeSeverity && (
                <span className="text-[11px] px-2 py-0.5 rounded capitalize font-medium"
                  style={{ background: SEV_BG[activeSeverity], color: SEV_COLORS[activeSeverity] }}>
                  {activeSeverity}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ThreatBarChart threats={data.topThreats} activeSeverity={activeSeverity} />
          </CardContent>
        </Card>
      </div>

      {/* ── Vulnerable Software ── */}
      {(data.vulnerableSoftware.length > 0 || swSearch) && (
        <Card>
          <div className="flex flex-col gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                Particularly Vulnerable Software
              </h3>
              {activeSeverity && (
                <span className="text-[11px] capitalize px-2 py-0.5 rounded font-medium"
                  style={{ background: SEV_BG[activeSeverity], color: SEV_COLORS[activeSeverity] }}>
                  Filtered: {activeSeverity}
                </span>
              )}
            </div>
            {/* Inline search */}
            <div className="relative" style={{ maxWidth: "320px" }}>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-3.5 w-3.5" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <Input
                value={swSearch}
                onChange={e => setSwSearch(e.target.value)}
                placeholder="Search software or CVE..."
                style={{ paddingLeft: "32px", fontSize: "13px", padding: "7px 12px 7px 32px" }}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>Software / Product</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>Detection Context</th>
                  <th className="px-5 py-3 text-center text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>CVEs</th>
                  <th className="px-5 py-3 text-center text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>Score</th>
                  <th className="px-5 py-3 text-center text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>Severity</th>
                </tr>
              </thead>
              <tbody>
                {filteredSoftware.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                      No matching software found
                    </td>
                  </tr>
                ) : (
                  filteredSoftware.map((sw, i) => {
                    const { short, detail } = splitSoftwareName(sw.name);
                    return (
                      <tr
                        key={sw.name}
                        style={{ borderBottom: i < filteredSoftware.length - 1 ? "1px solid var(--border)" : "none" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td className="px-5 py-3 font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{short}</td>
                        <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontSize: "12px", maxWidth: "260px" }}>
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap" title={detail}>{detail || "—"}</span>
                        </td>
                        <td className="px-5 py-3 text-center tabular-nums" style={{ color: "var(--text-secondary)" }}>{sw.cveCount}</td>
                        <td className="px-5 py-3 text-center tabular-nums font-semibold"
                          style={{ color: sw.maxScore > 0 ? SEV_COLORS[sw.severity] : "var(--text-muted)" }}>
                          {sw.maxScore > 0 ? sw.maxScore.toFixed(1) : "—"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold capitalize tracking-wide whitespace-nowrap"
                            style={{
                              background: SEV_BG[sw.severity],
                              color: SEV_COLORS[sw.severity],
                              border: `1px solid ${SEV_COLORS[sw.severity]}30`,
                            }}
                          >
                            {sw.severity}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Full Report ── */}
      <Card ref={reportRef}>
        <div className="flex items-center justify-between gap-4 px-6 py-3.5 flex-wrap"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            Full Report
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-md overflow-hidden text-[12px] font-medium"
              style={{ border: "1px solid var(--border)", background: "var(--bg)" }}>
              {(["markdown", "formatted"] as const).map(v => (
                <button key={v} type="button"
                  onClick={() => setReportView(v)}
                  className="px-3 py-1.5 transition-all duration-150"
                  style={{
                    background: reportView === v ? "var(--accent)" : "transparent",
                    color: reportView === v ? "var(--accent-text)" : "var(--text-muted)",
                  }}>
                  {v === "markdown" ? "Raw" : "Structured"}
                </button>
              ))}
            </div>
            {/* Copy */}
            {md && (
              <button
                onClick={copyReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-150"
                style={{
                  background: "var(--surface-hover)",
                  color: copied ? "var(--success)" : "var(--text-muted)",
                  border: `1px solid ${copied ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
                }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = copied ? "var(--success)" : "var(--text-muted)"; }}
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            )}
            {/* Refresh */}
            <button
              onClick={loading ? undefined : onRefresh}
              disabled={loading}
              className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-150"
              style={{ background: "var(--surface-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            {/* Download */}
            {md && (
              <button
                onClick={downloadReport}
                className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-150"
                style={{ background: "var(--surface-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                Download
              </button>
            )}
          </div>
        </div>

        {md ? (
          reportView === "markdown" ? (
            <div className="overflow-y-auto px-8 py-6 report-md" style={{ maxHeight: "640px", background: "var(--bg)" }}>
              <ReactMarkdown>{md}</ReactMarkdown>
            </div>
          ) : (
            <FormattedReport md={md} />
          )
        ) : (
          <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            {loading ? "Loading report..." : "No report available. Use the Generate tab to create one."}
          </div>
        )}
      </Card>

    </div>
  );
}

/* TabButton replaced by shadcn Tabs (see IntelPage) */

/* ─── Progress bar ─── */
function ProgressBar({ progress, message }: { progress: number; message: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
            <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>Generating report...</span>
          </div>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--accent)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{progress}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress} />
        <p className="text-[12px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{message}</p>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════
   GENERATE REPORT
   ═══════════════════════════════════ */
type KV = { vendor: string; product: string };
type AppVendorProducts = { vendor: string; products: string[] };
type Source = { name: string; fields: string[]; description: string };

type GenTab = "builder" | "yaml";

/* ── Shared sub-components ── */
function GenTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-4 py-2 text-[13px] font-medium rounded-md transition-all duration-150"
      style={active
        ? { background: "var(--surface-raised)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }
        : { background: "transparent", color: "var(--text-muted)" }
      }
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title, description, action, count }: { title: string; description: string; action?: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-[3px] rounded-full self-stretch mt-0.5" style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{title}</h3>
            {count !== undefined && count > 0 && (
              <span className="text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)", fontFamily: "var(--font-display)" }}>
                {count}
              </span>
            )}
          </div>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function AddBtn({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[13px] rounded-md px-3 py-1.5 font-medium transition-all duration-150 flex-shrink-0"
      style={{ color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-muted-hover)"; e.currentTarget.style.borderColor = "var(--accent-border-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
    >
      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label}
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-1.5 flex-shrink-0 transition-all duration-150"
      style={{ color: "var(--text-muted)", background: "transparent", border: "1px solid transparent" }}
      onMouseEnter={e => {
        e.currentTarget.style.color = "var(--danger)";
        e.currentTarget.style.background = "rgba(248,113,113,0.08)";
        e.currentTarget.style.borderColor = "rgba(248,113,113,0.25)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = "var(--text-muted)";
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function EmptyState({ icon, title, description, onAdd, addLabel }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onAdd: () => void;
  addLabel?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-10 gap-5 rounded-xl text-center transition-colors duration-200"
      style={{ border: "1px dashed var(--border-hover)", background: "var(--surface-raised)" }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: "var(--accent-subtle)",
          border: "1px solid var(--accent-border)",
          color: "var(--accent)",
          boxShadow: "0 0 20px rgba(255,255,255,0.08)",
        }}
      >
        {icon}
      </div>
      <div className="space-y-1.5 px-4">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{title}</p>
        <p className="text-[12.5px] max-w-[260px] mx-auto leading-relaxed" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-150"
        style={{ background: "var(--accent)", color: "var(--accent-text)", border: "1px solid var(--accent-border-hover)", boxShadow: "0 0 14px rgba(255,255,255,0.16)" }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-hover)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(255,255,255,0.28)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 14px rgba(255,255,255,0.16)"; }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {addLabel ?? "Add Entry"}
      </button>
    </div>
  );
}

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
  const [genTab, setGenTab] = useState<GenTab>("builder");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentYamlConfig().then(c => setYamlConfig(c.config)).catch(() => {});
  }, []);

  useEffect(() => {
    if (logsOpen && logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
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

  const osCount = os.filter(r => r.vendor || r.product).length;
  const appsCount = apps.filter(r => r.vendor || r.products.length).length;
  const cloudCount = yamlConfig?.software_stack?.cloud_platforms?.length || 0;
  async function submit() {
    const hasOs = os.some(r => r.vendor || r.product);
    const hasApps = apps.some(r => r.vendor || r.products.length);
    const hasSources = sources.some(s => s.name || s.fields.length || s.description);
    if (!hasOs && !hasApps && !hasSources && !yamlUploaded) { setShowEmptyPrompt(true); return; }
    setShowEmptyPrompt(false);
    setLogs([]); setLogsOpen(true); setCrewOutput(null);
    setSubmitting(true); setServerMsg(null); setProgress(0); setProgressMessage("Starting...");
    try {
      const osClean = os.filter(r => r.vendor || r.product);
      const appsClean = apps.filter(r => r.vendor || r.products.length).map(r => ({ vendor: r.vendor, products: r.products.filter(Boolean) }));
      const sourcesClean = sources.filter(s => s.name || s.fields.length || s.description);
      const payload: GenerateReportPayload = { os: osClean, applications: appsClean, sources: sourcesClean, yaml_uploaded: yamlUploaded };
      const res = await runReport(payload);
      if (res.taskId) { setTaskId(res.taskId); setServerMsg("Report generation started..."); }
      else { setServerMsg(res.message || "Failed."); setSubmitting(false); }
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed."); setSubmitting(false);
    }
  }

  async function handleYamlFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) { setYamlMsg("Select a YAML file."); return; }
    try {
      setYamlMsg("Uploading...");
      const r = await uploadYamlConfig(file);
      setYamlConfig(r.config); setYamlMsg(r.message); setYamlUploaded(true); setShowEmptyPrompt(false);
    } catch (err: any) { setYamlMsg(`Failed: ${err.message}`); }
  }

  return (
    <div className="space-y-5 w-full">

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}>
          Generate Report
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Configure your tech stack and run an automated NVD vulnerability analysis
        </p>
      </div>

      {/* ── Sticky Page Sub-Header: Run Report + stats ── */}
      <div
        className="sticky top-0 z-20 -mx-8 lg:-mx-10 px-8 lg:px-10 py-4"
        style={{
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Summary stat pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "OS", count: osCount },
              { label: "Apps", count: appsCount },
              { label: "Cloud", count: cloudCount },
            ].map(b => (
              <div
                key={b.label}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl"
                style={{
                  background: b.count > 0 ? "var(--accent-muted)" : "var(--surface-raised)",
                  border: `1px solid ${b.count > 0 ? "var(--accent-border)" : "var(--border)"}`,
                  color: b.count > 0 ? "var(--accent)" : "var(--text-muted)",
                  boxShadow: b.count > 0 ? "0 0 10px rgba(255,255,255,0.10)" : "none",
                }}
              >
                <span className="font-bold tabular-nums text-[20px] leading-none" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>{b.count}</span>
                <span className="font-semibold text-[11px] uppercase tracking-[0.08em]">{b.label}</span>
              </div>
            ))}
            {yamlUploaded && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px]"
                style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="font-medium">YAML</span>
              </div>
            )}
          </div>

          {/* Run Report CTA */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {serverMsg && (
              <span className="text-[13px] hidden sm:block" style={{ color: serverMsg.toLowerCase().includes("error") ? "var(--danger)" : "var(--text-muted)" }}>
                {serverMsg}
              </span>
            )}
            <Button
              onClick={submit}
              disabled={submitting}
              icon={submitting
                ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent-text)", borderTopColor: "transparent" }} />
                : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                )
              }
            >
              {submitting ? "Generating..." : "Run Report"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Inner tab switcher ── */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", maxWidth: "380px" }}
      >
        <GenTabBtn active={genTab === "builder"} onClick={() => setGenTab("builder")}>
          <span className="flex items-center justify-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.63-4.179l.813-.814a2.25 2.25 0 013.182 3.182l-.814.813" />
            </svg>
            Manual Builder
          </span>
        </GenTabBtn>
        <GenTabBtn active={genTab === "yaml"} onClick={() => setGenTab("yaml")}>
          <span className="flex items-center justify-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            YAML Config
          </span>
        </GenTabBtn>
      </div>

      {/* ══════════════════════════
          TAB 1 — Manual Builder
         ══════════════════════════ */}
      {genTab === "builder" && (
        <div className="space-y-4">

          {/* Operating Systems */}
          <Card><CardContent className="p-6">
            <SectionHeader
              title="Operating Systems"
              description="Specify OS targets to scan for known CVEs"
              count={os.filter(r => r.vendor || r.product).length}
              action={os.length > 0 ? <AddBtn onClick={() => setOs(a => [...a, { vendor: "", product: "" }])} /> : undefined}
            />
            {os.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                }
                title="No operating systems added"
                description="Add vendor and product pairs to include OS-level CVEs in your threat report."
                onAdd={() => setOs(a => [...a, { vendor: "", product: "" }])}
                addLabel="Add Operating System"
              />
            ) : (
              <div className="space-y-3">
                {os.map((row, i) => (
                  <div key={i} className="flex gap-3 items-end p-4 rounded-md" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex-1 space-y-1.5">
                      <Label>Vendor</Label>
                      <Input value={row.vendor} placeholder="e.g. Microsoft" onChange={e => setOs(a => a.map((r, j) => j === i ? { ...r, vendor: e.target.value } : r))} />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label>Product</Label>
                      <Input value={row.product} placeholder="e.g. Windows Server 2022" onChange={e => setOs(a => a.map((r, j) => j === i ? { ...r, product: e.target.value } : r))} />
                    </div>
                    <div className="mb-0.5">
                      <RemoveBtn onClick={() => setOs(a => a.filter((_, j) => j !== i))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>

          {/* Applications */}
          <Card><CardContent className="p-6">
            <SectionHeader
              title="Applications"
              description="Software applications to include in vulnerability scanning"
              count={apps.filter(r => r.vendor || r.products.length).length}
              action={apps.length > 0 ? <AddBtn onClick={() => setApps(a => [...a, { vendor: "", products: [] }])} /> : undefined}
            />
            {apps.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                }
                title="No applications added"
                description="Add application vendors and products to detect known software vulnerabilities."
                onAdd={() => setApps(a => [...a, { vendor: "", products: [] }])}
                addLabel="Add Application"
              />
            ) : (
              <div className="space-y-3">
                {apps.map((row, i) => (
                  <div key={i} className="flex gap-3 items-end p-4 rounded-md" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex-1 space-y-1.5">
                      <Label>Vendor</Label>
                      <Input value={row.vendor} placeholder="e.g. Adobe" onChange={e => setApps(a => a.map((r, j) => j === i ? { ...r, vendor: e.target.value } : r))} />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label>Products <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(comma-separated)</span></Label>
                      <Input value={row.products.join(", ")} placeholder="e.g. Acrobat, Photoshop"
                        onChange={e => { const products = e.target.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean); setApps(a => a.map((r, j) => j === i ? { ...r, products } : r)); }} />
                    </div>
                    <div className="mb-0.5">
                      <RemoveBtn onClick={() => setApps(a => a.filter((_, j) => j !== i))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>

          {/* Source Types */}
          <Card><CardContent className="p-6">
            <SectionHeader
              title="Source Types"
              description="Data sources for threat intelligence correlation"
              count={sources.filter(s => s.name || s.fields.length || s.description).length}
              action={sources.length > 0 ? <AddBtn onClick={() => setSources(a => [...a, { name: "", fields: [], description: "" }])} /> : undefined}
            />
            {sources.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                }
                title="No source types added"
                description="Define your SIEM, firewall, EDR, or other log sources for deeper correlation."
                onAdd={() => setSources(a => [...a, { name: "", fields: [], description: "" }])}
                addLabel="Add Source Type"
              />
            ) : (
              <div className="space-y-3">
                {sources.map((row, i) => (
                  <div key={i} className="space-y-4 p-4 rounded-md" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1 space-y-1.5">
                        <Label>Source Name</Label>
                        <Input value={row.name} placeholder="e.g. SIEM, Firewall, EDR"
                          onChange={e => setSources(a => a.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label>Fields <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(comma-separated)</span></Label>
                        <Input value={row.fields.join(", ")} placeholder="e.g. source_ip, event_id, hostname"
                          onChange={e => { const fields = e.target.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean); setSources(a => a.map((r, j) => j === i ? { ...r, fields } : r)); }} />
                      </div>
                      <div className="mb-0.5">
                        <RemoveBtn onClick={() => setSources(a => a.filter((_, j) => j !== i))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <textarea value={row.description} placeholder="Describe the data source and what events it captures..." rows={2}
                        onChange={e => setSources(a => a.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                        className="input-base"
                        style={{ resize: "vertical" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

      {/* ══════════════════════════
          TAB 2 — YAML Config
         ══════════════════════════ */}
      {genTab === "yaml" && (
        <div className="space-y-4">

          {/* Drop zone */}
          <Card><CardContent className="p-6">
            <SectionHeader
              title="YAML Configuration"
              description="Upload a CMDB YAML to override manual builder entries"
              action={
                <Button variant="secondary" onClick={() => downloadYamlTemplate().catch((e: any) => setYamlMsg(`Error: ${e.message}`))}>
                  Download Template
                </Button>
              }
            />

            <input ref={fileInputRef} type="file" accept=".yaml,.yml" className="hidden"
              onChange={async e => { await handleYamlFile(e.target.files?.[0]); e.target.value = ""; }}
            />

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={async e => { e.preventDefault(); setDragActive(false); await handleYamlFile(e.dataTransfer.files?.[0]); }}
              className="cursor-pointer rounded-xl flex flex-col items-center justify-center gap-4 py-12 px-6 text-center transition-all duration-200"
              style={{
                background: dragActive ? "var(--accent-subtle)" : "var(--bg)",
                border: `2px dashed ${dragActive ? "var(--accent)" : "var(--border-hover)"}`,
                boxShadow: dragActive ? "inset 0 0 0 1px var(--accent-border)" : "none",
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  Drop your YAML file here, or{" "}
                  <span style={{ color: "var(--accent)" }}>browse to upload</span>
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Accepts <code style={{ background: "var(--surface-raised)", padding: "1px 5px", borderRadius: "3px" }}>.yaml</code> and{" "}
                  <code style={{ background: "var(--surface-raised)", padding: "1px 5px", borderRadius: "3px" }}>.yml</code> files
                </p>
              </div>
            </div>

            {/* Status messages */}
            {yamlMsg && (
              <div className="mt-4 text-[14px] rounded-md px-4 py-2.5" style={{
                color: yamlMsg.includes("Error") || yamlMsg.includes("Failed") ? "var(--danger)" : "var(--success)",
                background: yamlMsg.includes("Error") || yamlMsg.includes("Failed") ? "rgba(248,113,113,0.08)" : "var(--accent-subtle)",
                border: `1px solid ${yamlMsg.includes("Error") || yamlMsg.includes("Failed") ? "rgba(248,113,113,0.25)" : "var(--accent-border)"}`,
              }}>{yamlMsg}</div>
            )}
          </CardContent></Card>

          {/* Loaded config status */}
          <Card><CardContent className="p-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Loaded Configuration</h3>
            {yamlConfig ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{yamlConfig.organization?.name || "Custom Configuration"}</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {yamlConfig.software_stack?.operating_systems?.length || 0} OS ·{" "}
                      {yamlConfig.software_stack?.applications?.length || 0} apps ·{" "}
                      {yamlConfig.software_stack?.cloud_platforms?.length || 0} cloud platforms
                    </p>
                  </div>
                  <span className="badge-accent text-[11px]">Active</span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                }
                title="No configuration loaded"
                description="Upload a YAML file above or download the template to create your CMDB config."
                onAdd={() => fileInputRef.current?.click()}
                addLabel="Upload YAML"
              />
            )}
          </CardContent></Card>
        </div>
      )}

      {/* ── Validation warning ── */}
      {showEmptyPrompt && (
        <div className="p-5 rounded-lg text-[14px]" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="font-semibold mb-1" style={{ color: "#fbbf24" }}>No configuration entries found</p>
          <p style={{ color: "var(--text-muted)" }}>
            Add at least one OS, application, or source type in the Manual Builder — or upload a YAML config.
          </p>
        </div>
      )}

      {/* ── Progress ── */}
      {submitting && <ProgressBar progress={progress} message={progressMessage} />}

      {/* ── Crew Output ── */}
      {crewOutput && (
        <Card><CardContent className="p-6 space-y-4">
          <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Crew Output</span>
          <div className="rounded-md p-5 max-h-96 overflow-y-auto" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <ReactMarkdown>{crewOutput}</ReactMarkdown>
          </div>
        </CardContent></Card>
      )}

      {/* ── Output Log ── */}
      {logs.length > 0 && (
        <Card className="overflow-hidden">
          <button type="button" onClick={() => setLogsOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors duration-150"
            style={{ background: "transparent" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span className="text-[14px] font-medium flex items-center gap-2.5" style={{ color: "var(--text-primary)" }}>
              <svg className="w-3.5 h-3.5 transition-transform duration-150" style={{ transform: logsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Output Log
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{logs.length} line{logs.length !== 1 ? "s" : ""}</span>
          </button>
          {logsOpen && (
            <div className="px-5 py-4 overflow-y-auto text-[13px] leading-[1.7]"
              style={{ maxHeight: "300px", background: "var(--bg)", borderTop: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
              {logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all" style={{
                  color: line.startsWith("[error]") ? "var(--danger)" : line.startsWith("[system]") ? "var(--info)" : "var(--text-secondary)",
                }}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </Card>
      )}
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
    return q ? cves.filter(c => c.toLowerCase().includes(q)) : cves;
  }, [cves, query]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}>
          Vulnerability Index
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          All CVEs extracted from the latest threat report
        </p>
      </div>

      {err && (
        <div className="rounded-xl px-4 py-3 text-[13.5px]" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)", color: "var(--danger)" }}>{err}</div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CardTitle>CVE Index</CardTitle>
              {!loading && (
                <Badge variant="accent" className="tabular-nums">{filtered.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search CVEs..."
                  className="pl-8"
                  style={{ width: "220px", fontSize: "14px", padding: "7px 12px 7px 32px" }}
                />
              </div>
              <Button onClick={load} disabled={loading} variant="secondary">
                {loading ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CVE ID</TableHead>
              <TableHead className="text-right">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-3.5 w-36 rounded skeleton" /></TableCell>
                  <TableCell><div className="h-3.5 w-12 rounded skeleton ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length > 0 ? (
              filtered.map(cve => (
                <TableRow key={cve}>
                  <TableCell
                    style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "13px" }}
                  >
                    {cve}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      className="text-[13px] font-medium transition-colors duration-150"
                      style={{ color: "var(--accent)" }}
                      href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                      target="_blank"
                      rel="noreferrer"
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--accent-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--accent)"; }}
                    >
                      View ↗
                    </a>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <>
                {/* Ghost skeleton rows */}
                {[120, 92, 108, 85, 100, 75].map((w, i) => (
                  <TableRow key={i} style={{ opacity: 1 - i * 0.12 }}>
                    <TableCell>
                      <div className="skeleton h-3.5 rounded" style={{ width: `${w}px` }} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="skeleton h-3.5 w-12 rounded ml-auto" />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center border-none">
                    <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      No vulnerabilities — generate a report first
                    </span>
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════
   INTEL PAGE
   ═══════════════════════════════════ */
export default function IntelPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
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
      .then(ok => setTab(ok ? "dashboard" : "generate"))
      .finally(() => setReady(true));
  }, [loadReport]);

  const handleReportGenerated = useCallback(async (reportHint?: string) => {
    const ok = await loadReport();
    if (!ok && reportHint) { setReportMd(reportHint); setReportErr(null); }
    setTab("dashboard");
  }, [loadReport]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="space-y-8">
      <TabsList>
        <TabsTrigger value="dashboard">
          <svg className="w-3.5 h-3.5 mr-1.5 inline-block" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm9.75-9.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v16.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V3.375zm-9.75 9c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v7.5C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 015.25 19.875v-7.5z" />
          </svg>
          Dashboard
        </TabsTrigger>
        <TabsTrigger value="generate">
          <svg className="w-3.5 h-3.5 mr-1.5 inline-block" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
          Generate
        </TabsTrigger>
        <TabsTrigger value="vulnerabilities">
          <svg className="w-3.5 h-3.5 mr-1.5 inline-block" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286z" />
          </svg>
          Vulnerabilities
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" forceMount>
        <DashboardView md={reportMd} err={reportErr} loading={reportLoading} onRefresh={loadReport} />
      </TabsContent>
      <TabsContent value="generate" forceMount>
        <GenerateView onReportGenerated={handleReportGenerated} />
      </TabsContent>
      <TabsContent value="vulnerabilities" forceMount>
        <VulnerabilitiesView />
      </TabsContent>
    </Tabs>
  );
}
