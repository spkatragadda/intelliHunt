// All API calls use relative paths — Next.js rewrites proxy them to the Django backend.
// This means no NEXT_PUBLIC_API_BASE env var is needed and the backend is never
// exposed directly to browsers.
export const API_BASE = "";

// ── Authenticated fetch ────────────────────────────────────────────────────────

/**
 * fetch() wrapper that injects Authorization header and handles 401 by
 * attempting a token refresh then retrying once. On second 401, clears auth
 * and redirects to /login.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { getAccessToken, getRefreshToken, setTokens, clearAuth } = await import("./auth");

  const token = getAccessToken();
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Attempt refresh
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        const refreshRes = await fetch(`/api/auth/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setTokens(refreshData.access, refresh);
          headers.set("Authorization", `Bearer ${refreshData.access}`);
          res = await fetch(url, { ...init, headers });
          if (res.status !== 401) return res;
        }
      } catch {
        // fall through to redirect
      }
    }
    // Could not refresh — clear and redirect
    clearAuth();
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

/** Hit an endpoint to automatically update all pages with the latest report markdown */
export async function updateReport(): Promise<{ message: string }> {
  const res = await authedFetch(`/api/update/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    let msg = `Report update failed: ${res.status}`;
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

  // Expect a successful JSON response with a message
  try {
    const data = await res.json();
    return { message: data.message || "Report updated successfully." };
  } catch {
    // Handle cases where the response is OK but not valid JSON (e.g., just an empty 200)
    return { message: "Report update request succeeded, but received an unexpected response." };
  }
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
  repoFile?: File
): Promise<{ taskId?: string; message: string }> {
  let res: Response;
  
  if (repoFile) {
    const formData = new FormData();
    formData.append('repo_file', repoFile);
    res = await authedFetch(`/api/scan/repo/`, {
      method: "POST",
      body: formData,
    });
  } else if (repoUrl) {
    res = await authedFetch(`/api/scan/repo/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl }),
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
  status: "running" | "completed" | "error";
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