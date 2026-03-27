import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that are always public (no auth required)
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/about"];
// Paths where an authenticated user should be redirected to the dashboard
const AUTH_ONLY_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isAuthOnly = AUTH_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  const token = request.cookies.get("auth_token")?.value;

  // No token → redirect to /login (unless already on a public path)
  if (!token && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user visiting marketing page → redirect to /dashboard
  if (token && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Authenticated user visiting login/register → redirect to /dashboard
  if (token && isAuthOnly) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - api/* (proxied to Django — Django handles its own JWT auth)
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, robots.txt
     * - public asset extensions
     */
    "/((?!api/|_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)",
  ],
};
