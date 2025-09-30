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
): Promise<{ markdown?: string; message: string }> {
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
    // { 'status': 'success', 'message': 'Script ran successfully.', 'output': '## Markdown Report' }

    if (data.status === 'success' && data.output) {
        // 2. Return the report content, which is in the 'output' field
        return { 
            markdown: data.output, 
            message: data.message || "Report generated successfully."
        };
    } 
    
    // Handle success response that doesn't contain the expected output (e.g., script ran but returned nothing)
    return { message: data.message || "Script ran, but no report content was returned." };

  } catch {
    // This handles cases where the response is OK but not valid JSON
    return { message: "Report generated, but received an unexpected non-JSON response." };
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
