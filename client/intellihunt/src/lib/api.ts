// All API calls use relative paths — Next.js rewrites proxy them to the Django backend.
// This means no NEXT_PUBLIC_API_BASE env var is needed and the backend is never
// exposed directly to browsers.
export const API_BASE = "";

// ── Authenticated fetch ────────────────────────────────────────────────────────

/**
 * fetch() wrapper that sends HttpOnly cookies automatically and handles 401 by
 * attempting a token refresh then retrying once. On second 401, clears auth
 * and redirects to /login.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { clearAuth, clearAuthLocal } = await import("./auth");

  let res = await fetch(url, { ...init, credentials: "same-origin" });

  if (res.status === 401) {
    // Attempt refresh — refresh token cookie is sent automatically
    try {
      const refreshRes = await fetch(`/api/auth/refresh/`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (refreshRes.ok) {
        // New access token cookie was set by the server — retry original request
        res = await fetch(url, { ...init, credentials: "same-origin" });
        if (res.status !== 401) return res;
      }
    } catch {
      // fall through to redirect
    }
    // Could not refresh — clear local state and redirect
    clearAuthLocal();
    if (typeof window !== "undefined") {
      window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  return res;
}

/** ===== Types for Generate Report payload ===== */
export type GenerateReportPayload = {
  os: { vendor: string; product: string }[];
  // Applications now support multiple products for the same vendor
  applications: { vendor: string; products: string[] }[];
  // Source types: arbitrary user-defined with name, fields, and description
  sources: { name: string; fields: string[]; description: string }[];
  // True when the user explicitly uploaded a YAML config this session
  yaml_uploaded?: boolean;
};

/** Get crew_report.md as text from Django */
export async function fetchReportMarkdown(): Promise<string> {
  const res = await authedFetch(`/api/markdown/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Report fetch failed: ${res.status}`);
  return await res.text();
}

/** Kick off a report run with custom inputs */
export async function runReport(
  payload: GenerateReportPayload
): Promise<{ taskId?: string; message: string }> {
  const res = await authedFetch(`/api/generate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // --- Error Handling (Handles 4xx/5xx status codes) ---
  if (!res.ok) {
    let msg = `Report generation failed: ${res.status}`;
    try {
      // Attempt to get a detailed error message from the response body
      const txt = await res.text();
      // If the Django view returned an 'error' JSON, we want that message
      const errorData = JSON.parse(txt);
      if (errorData.message) {
          msg = `Server Error: ${errorData.message}`;
      } else if (txt) {
          msg = txt;
      }
    } catch {
      // Ignore if parsing fails
    }
    // Return the error message
    return { message: msg };
  }

  // --- Success Handling (Handles 200 OK) ---
  try {
    // 1. Parse the JSON response from the Django view
    const data = await res.json(); 

    // The successful Django view returns data like: 
    // { 'status': 'started', 'message': 'Report generation started.', 'task_id': 'uuid' }

    if (data.status === 'started' && data.task_id) {
        // 2. Return the task ID for polling
        return { 
          taskId: data.task_id, 
          message: data.message || "Report generation started."
        };
    } 
    
    // Handle unexpected response
    return { message: data.message || "Unexpected response from server." };

  } catch {
    // This handles cases where the response is OK but not valid JSON
    return { message: "Report generation started, but received an unexpected response." };
  }
}

/** Check the status of a running task */
export async function checkTaskStatus(taskId: string): Promise<{
  status: string;
  progress: number;
  message: string;
  output?: string;
  report_markdown?: string;
  logs?: string[];
  duration?: number;
}> {
  const res = await authedFetch(`/api/task/${taskId}/`);
  
  if (!res.ok) {
    throw new Error(`Task status check failed: ${res.status}`);
  }
  
  return await res.json();
}

/** Extract CVE IDs from any text (CVE-YYYY-NNNN…) */
export function extractCVEs(md: string): string[] {
  const set = new Set<string>();
  const re = /\bCVE-\d{4}-\d{4,7}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) set.add(m[0]);
  return [...set].sort();
}

/** Try to infer a "last updated" timestamp from the markdown; fall back to now */
export function guessLastUpdated(md: string): string {
  const match =
    md.match(/(?:Generated|Report saved|Last Updated)[:\s]+([\w: \-\/]+)\b/i) ??
    md.match(/\b20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\b/);
  return match
    ? (Array.isArray(match) ? match[1] : match[0])
    : new Date().toLocaleString();
}

/** Download YAML template file */
export async function downloadYamlTemplate(): Promise<void> {
  const response = await authedFetch(`/api/yaml/template/`);
  if (!response.ok) {
    throw new Error(`Template download failed: ${response.status}`);
  }
  
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'organization_cmdb_template.yaml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Upload YAML configuration file */
export async function uploadYamlConfig(file: File): Promise<{ message: string; config: any }> {
  const formData = new FormData();
  formData.append('yaml_file', file);

  const response = await authedFetch(`/api/yaml/upload/`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Upload failed: ${response.status}`);
  }
  
  return await response.json();
}

/** Get current YAML configuration */
export async function getCurrentYamlConfig(): Promise<{ config: any; raw_content: string }> {
  const response = await authedFetch(`/api/yaml/config/`);
  if (!response.ok) {
    throw new Error(`Config fetch failed: ${response.status}`);
  }
  
  return await response.json();
}

// ── CMDB Integration Types & API ──────────────────────────────────────────────

export type CmdbIntegration = {
  type: string;
  // ServiceNow
  instance?: string;
  table?: string;
  // BMC Helix
  server?: string;
  tenant?: string;
  // Atlassian
  email?: string;
  api_token?: string;
  workspace_id?: string;
  // Custom
  name?: string;
  endpoint?: string;
  auth_type?: "none" | "basic" | "bearer" | "api_key";
  token?: string;
  key_header?: string;
  api_key?: string;
  // CrowdStrike
  client_id?: string;
  client_secret?: string;
  cloud?: string;
  // SentinelOne
  base_url?: string;
  // Defender
  tenant_id?: string;
  // Shared
  username?: string;
  password?: string;
  enabled?: boolean;
  last_synced?: string;
};

export async function getCmdbIntegrations(): Promise<Record<string, CmdbIntegration>> {
  const res = await authedFetch(`/api/cmdb/integrations/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch integrations: ${res.status}`);
  const data = await res.json();
  return data.integrations ?? {};
}

export async function saveCmdbIntegration(id: string, config: CmdbIntegration): Promise<{ message: string }> {
  const res = await authedFetch(`/api/cmdb/integrations/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, config }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

export async function deleteCmdbIntegration(id: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/cmdb/integrations/${id}/`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}

export async function testCmdbConnection(
  type: string,
  config: Record<string, string>
): Promise<{ status: "connected" | "error"; message: string }> {
  const res = await authedFetch(`/api/cmdb/test/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, config }),
  });
  return res.json();
}

export async function importCmdbData(
  id: string,
  type: string
): Promise<{ message?: string; error?: string; os_count?: number; app_count?: number }> {
  const res = await authedFetch(`/api/cmdb/import/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  });
  return res.json();
}

/** Scan a repository for vulnerabilities */
export async function scanRepo(
  repoUrl?: string,
  repoFile?: File,
  scanLevel: "speed" | "legend" = "speed"
): Promise<{ taskId?: string; message: string }> {
  let res: Response;

  if (repoFile) {
    const formData = new FormData();
    formData.append('repo_file', repoFile);
    formData.append('scan_level', scanLevel);
    res = await authedFetch(`/api/scan/repo/`, {
      method: "POST",
      body: formData,
    });
  } else if (repoUrl) {
    res = await authedFetch(`/api/scan/repo/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, scan_level: scanLevel }),
    });
  } else {
    return { message: "Either repoUrl or repoFile must be provided." };
  }

  // --- Error Handling (Handles 4xx/5xx status codes) ---
  if (!res.ok) {
    let msg = `Repository scan failed: ${res.status}`;
    try {
      const txt = await res.text();
      const errorData = JSON.parse(txt);
      if (errorData.message) {
        msg = `Server Error: ${errorData.message}`;
      } else if (txt) {
        msg = txt;
      }
    } catch {
      // Ignore if parsing fails
    }
    return { message: msg };
  }

  // --- Success Handling (Handles 200 OK) ---
  try {
    const data = await res.json();

    if (data.status === 'started' && data.task_id) {
      return {
        taskId: data.task_id,
        message: data.message || "Repository scan started."
      };
    }

    return { message: data.message || "Unexpected response from server." };

  } catch {
    return { message: "Repository scan started, but received an unexpected response." };
  }
}

// ── Scan history (per-tenant) ──────────────────────────────────────────────

export type ServerScanRecord = {
  id: string;
  task_id: string;
  username: string;
  target: string;
  input_type: "url" | "file";
  scan_level: "speed" | "legend";
  status: "running" | "completed" | "error" | "cancelled" | "cancelling";
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  has_report: boolean;
};

export async function fetchScanHistory(): Promise<ServerScanRecord[]> {
  const res = await authedFetch(`/api/scan/history/`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.scans ?? [];
}

export async function fetchScanReport(taskId: string): Promise<{ report_markdown: string; target: string }> {
  const res = await authedFetch(`/api/scan/history/${taskId}/report/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Delete a scan record and its artifacts */
export async function deleteScan(taskId: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/scan/history/${taskId}/`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error || `Delete failed: ${res.status}`);
  }
  return res.json();
}

/** Request cancellation of a running scan */
export async function cancelScan(taskId: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/scan/cancel/${taskId}/`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error || `Cancel failed: ${res.status}`);
  }
  return res.json();
}

// ── Admin API ──────────────────────────────────────────────────────────────

export type AdminOrgRow = {
  id: string; name: string; created_at: string; member_count: number;
  total_actions: number; report_runs: number; repo_scans: number;
  cmdb_imports: number; last_active: string | null;
};

export type AdminUserRow = {
  id: string; username: string; email: string;
  org_id: string; org_name: string;
  total_actions: number; report_runs: number; repo_scans: number;
  last_active: string | null;
};

export type AdminActivityRow = {
  id: string; username: string; org_id: string; org_name: string;
  action: string; status: string; detail: string;
  duration_ms: number | null; created_at: string;
};

export type PendingUserRow = {
  id: string; username: string; email: string;
  org_id: string; org_name: string; joined_at: string;
};

export async function fetchPendingUsers(): Promise<PendingUserRow[]> {
  const res = await authedFetch(`/api/admin/pending/`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.pending ?? [];
}

export async function approveUser(userId: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/admin/users/${userId}/approve/`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Approve failed: ${res.status}`);
  }
  return res.json();
}

export async function rejectUser(userId: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/admin/users/${userId}/reject/`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Reject failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAdminSummary(): Promise<{ orgs: AdminOrgRow[]; users: AdminUserRow[] }> {
  const res = await authedFetch(`/api/admin/summary/`);
  if (res.status === 403) throw new Error("403");
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteAdminUser(
  userId: string
): Promise<{ message: string; org_now_empty: boolean }> {
  const res = await authedFetch(`/api/admin/users/${userId}/`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Delete failed: ${res.status}`);
  }
  return res.json();
}

// ── Historical trending / report archive / CISO executive summary ────────

export type ArtifactMetricSummary = {
  total_cves: number;
  unique_cves: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  cvss_max: number | null;
  cvss_avg: number | null;
  new_cves_count: number;
  resolved_cves_count: number;
  carried_over_count: number;
};

export type ArtifactListRow = {
  id: string;
  source: "manual_report" | "scheduled_report" | "repo_scan";
  username: string;
  task_id: string;
  byte_size: number;
  metrics_status: "ok" | "partial" | "failed";
  created_at: string;
  metrics: ArtifactMetricSummary | null;
};

export type ArtifactDetail = ArtifactListRow & {
  markdown: string;
  content_sha256: string;
  metrics_error: string;
  metrics:
    | (ArtifactMetricSummary & {
        cve_ids: string[];
        top_products: { name: string; count: number }[];
        severity_breakdown: Record<string, number>;
        affected_products_count: number;
        snapshot_at: string;
      })
    | null;
};

export type ReportHistoryPage = {
  total: number;
  limit: number;
  offset: number;
  items: ArtifactListRow[];
};

export type TrendPoint = { t: string | null; v: number | null; [k: string]: any };

export type ExecutiveSummary = {
  from: string;
  to: string;
  latest_snapshot_at: string | null;
  kpis: Record<string, { value: number | null; delta?: number | null }>;
  trends: {
    t: string | null;
    total_cves: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    new_cves: number;
    resolved_cves: number;
    cvss_max: number | null;
  }[];
  sources: { source: string; count: number }[];
  top_products: { name: string; count: number }[];
  top_cves: string[];
  mttr: number | null;
};

export async function fetchReportHistory(
  params: { source?: string; from?: string; to?: string; limit?: number; offset?: number } = {}
): Promise<ReportHistoryPage> {
  const qs = new URLSearchParams();
  if (params.source) qs.set("source", params.source);
  if (params.from)   qs.set("from",   params.from);
  if (params.to)     qs.set("to",     params.to);
  if (params.limit  != null) qs.set("limit",  String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const res = await authedFetch(`/api/reports/history/${qs.toString() ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchArtifactDetail(artifactId: string): Promise<ArtifactDetail> {
  const res = await authedFetch(`/api/reports/history/${encodeURIComponent(artifactId)}/`);
  if (!res.ok) throw new Error(`Artifact fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchTrends(
  metric: string,
  params: { from?: string; to?: string; bucket?: "day" | "week" | "month"; source?: string } = {}
): Promise<{ metric: string; bucket: string; series: TrendPoint[] }> {
  const qs = new URLSearchParams({ metric });
  if (params.bucket) qs.set("bucket", params.bucket);
  if (params.source) qs.set("source", params.source);
  if (params.from)   qs.set("from",   params.from);
  if (params.to)     qs.set("to",     params.to);
  const res = await authedFetch(`/api/trends/?${qs}`);
  if (!res.ok) throw new Error(`Trends fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchExecutiveSummary(
  from?: string,
  to?: string
): Promise<ExecutiveSummary> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to)   qs.set("to",   to);
  const res = await authedFetch(
    `/api/trends/executive-summary/${qs.toString() ? `?${qs}` : ""}`
  );
  if (!res.ok) throw new Error(`Executive summary fetch failed: ${res.status}`);
  return res.json();
}

export async function downloadCisoPdf(from?: string, to?: string): Promise<void> {
  const res = await authedFetch(`/api/reports/export/ciso/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `PDF export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ciso-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchAdminActivity(
  orgId?: string, action?: string, limit = 50, offset = 0
): Promise<{ total: number; rows: AdminActivityRow[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (orgId)  params.set("org_id", orgId);
  if (action) params.set("action", action);
  const res = await authedFetch(`/api/admin/activity/?${params}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ══════════════════════════════════════════
   Knowledge Wiki + Graph API
   ══════════════════════════════════════════ */

export type WikiPageSummary = {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  last_refreshed: string;
};

export type WikiPageDetail = WikiPageSummary & {
  content_markdown: string;
  links_to: string[];
};

export type WikiLogEntry = {
  operation: string;
  title: string;
  detail: string;
  pages_affected: string[];
  created_at: string;
};

export type GraphStats = {
  graph: Record<string, number>;
  wiki_pages: number;
  wiki_by_type: Record<string, number>;
  connected: boolean;
};

export type GraphSoftware = {
  vendor: string;
  product: string;
  version: string;
};

export type GraphSyncStatusEntry = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  nodes_created: number;
  relationships_created: number;
  pages_updated: number;
  errors: string;
};

export async function fetchWikiIndex(entityType?: string): Promise<{ pages: WikiPageSummary[] }> {
  const url = entityType ? `/api/wiki/${entityType}/` : `/api/wiki/`;
  const res = await authedFetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchWikiPage(entityType: string, entityId: string): Promise<WikiPageDetail> {
  const res = await authedFetch(`/api/wiki/${entityType}/${entityId}/`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.page;
}

export async function searchWiki(query: string): Promise<{ results: WikiPageSummary[] }> {
  const res = await authedFetch(`/api/wiki/search/?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchWikiLog(): Promise<{ entries: WikiLogEntry[] }> {
  const res = await authedFetch(`/api/wiki/log/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function refreshWikiPage(entityType: string, entityId: string): Promise<{ message: string }> {
  const res = await authedFetch(`/api/wiki/refresh/${entityType}/${entityId}/`, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function queryWiki(question: string): Promise<{ answer: string; sources: WikiPageSummary[] }> {
  const res = await authedFetch(`/api/wiki/query/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchGraphStats(): Promise<GraphStats> {
  const res = await authedFetch(`/api/graph/stats/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchGraphSoftware(): Promise<{ software: GraphSoftware[] }> {
  const res = await authedFetch(`/api/graph/software/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchGraphNeighbors(
  nodeType: string, nodeId: string, depth = 1
): Promise<{ nodes: any[]; edges: any[] }> {
  const res = await authedFetch(`/api/graph/neighbors/${nodeType}/${nodeId}/?depth=${depth}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchGraphSyncStatus(): Promise<{ statuses: GraphSyncStatusEntry[] }> {
  const res = await authedFetch(`/api/graph/sync/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function triggerGraphSync(): Promise<{ sync_id: string; status: string; message: string }> {
  const res = await authedFetch(`/api/graph/sync/trigger/`, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export type GraphResearchConfigPayload = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "biweekly";
  day_of_week: number;   // 0=Mon … 6=Sun
  hour: number;          // UTC, 0-23
  expand_depth: number;  // 1-5
};

export async function fetchGraphResearchConfig(): Promise<GraphResearchConfigPayload> {
  const res = await authedFetch(`/api/graph/research-config/`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function saveGraphResearchConfig(
  patch: Partial<GraphResearchConfigPayload>,
): Promise<GraphResearchConfigPayload & { status: string }> {
  const res = await authedFetch(`/api/graph/research-config/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Save failed: ${res.status}`);
  }
  return res.json();
}