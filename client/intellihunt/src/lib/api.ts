const isServer = typeof window === "undefined";

// Browser calls must hit localhost:8000; server code inside the container can use the service name.
export const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
export const INTERNAL_API_BASE =
  process.env.API_BASE_INTERNAL ?? "http://django:8000";

// Default base chosen depending on execution context
export const API_BASE = isServer ? INTERNAL_API_BASE : PUBLIC_API_BASE;

/** ===== Types for Generate Report payload ===== */
export type GenerateReportPayload = {
  os: { vendor: string; product: string }[];
  // Applications now support multiple products for the same vendor
  applications: { vendor: string; products: string[] }[];
  // Source types: arbitrary user-defined with name, fields, and description
  sources: { name: string; fields: string[]; description: string }[];
};

/** Get crew_report.md as text from Django */
export async function fetchReportMarkdown(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/markdown/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Report fetch failed: ${res.status}`);
  return await res.text();
}

/** Kick off a report run with custom inputs */
export async function runReport(
  payload: GenerateReportPayload
): Promise<{ taskId?: string; message: string }> {
  // POST to the PUBLIC base so it works from the browser
  const res = await fetch(`${PUBLIC_API_BASE}/api/generate/`, {
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
  duration?: number;
}> {
  const res = await fetch(`${PUBLIC_API_BASE}/api/task/${taskId}/`);
  
  if (!res.ok) {
    throw new Error(`Task status check failed: ${res.status}`);
  }
  
  return await res.json();
}

/** Hit an endpoint to automatically update all pages with the latest report markdown */
export async function updateReport(): Promise<{ message: string }> {
  // POST to the PUBLIC base so it works from the browser, hitting the new backend endpoint
  const res = await fetch(`${PUBLIC_API_BASE}/api/update/`, {
    method: "POST",
    // No body is sent, but we can set Content-Type if Django expects it
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
  const response = await fetch(`${PUBLIC_API_BASE}/api/yaml/template/`);
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
  
  const response = await fetch(`${PUBLIC_API_BASE}/api/yaml/upload/`, {
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
  const response = await fetch(`${PUBLIC_API_BASE}/api/yaml/config/`);
  if (!response.ok) {
    throw new Error(`Config fetch failed: ${response.status}`);
  }
  
  return await response.json();
}