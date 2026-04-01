/**
 * Next.js App Router proxy for repository ZIP uploads.
 *
 * The general /api/:path* rewrite in next.config.ts uses `afterFiles`, so this
 * route file takes precedence for POST /api/scan/repo/.  It streams the request
 * body directly to Django without buffering, bypassing Next.js's internal body
 * size limits that caused 500 errors on large ZIP uploads.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DJANGO_BASE =
  process.env.API_BASE_INTERNAL ?? "http://django:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = `${DJANGO_BASE}/api/scan/repo/`;

  // Forward all client headers except hop-by-hop headers that must not be
  // re-sent.  Crucially this preserves Content-Type (with its multipart
  // boundary) so Django's multipart parser works correctly.
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "transfer-encoding" ||
      lower === "te" ||
      lower === "trailer" ||
      lower === "upgrade"
    ) {
      return;
    }
    forwardHeaders.set(key, value);
  });

  let djangoRes: Response;
  try {
    djangoRes = await fetch(target, {
      method: "POST",
      headers: forwardHeaders,
      // Stream the body directly — avoids loading the entire ZIP into memory.
      body: request.body,
      // duplex: 'half' is required by the Fetch spec when body is a ReadableStream.
      // @ts-ignore — TypeScript's lib doesn't expose duplex yet.
      duplex: "half",
    });
  } catch (err) {
    console.error("[scan/repo proxy] fetch to Django failed:", err);
    return NextResponse.json(
      { status: "error", message: "Failed to reach the scan service." },
      { status: 502 }
    );
  }

  const contentType =
    djangoRes.headers.get("Content-Type") ?? "application/json";
  const body = await djangoRes.text();

  return new NextResponse(body, {
    status: djangoRes.status,
    headers: { "Content-Type": contentType },
  });
}

// GET/other methods are not used; return 405 so mistakes are obvious.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
