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
): Promise<{ run_id?: string; message: string }> {
  // POST to the PUBLIC base so it works from the browser
  const res = await fetch(`${PUBLIC_API_BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const txt = await res.text();
      if (txt) msg = txt;
    } catch {}
    return { message: msg };
  }

  try {
    return await res.json();
  } catch {
    return { message: "Report started." };
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
