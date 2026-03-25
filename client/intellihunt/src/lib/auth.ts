/**
 * Client-side auth token management.
 * Tokens are stored in localStorage AND mirrored to a cookie
 * so Next.js middleware can read them for route protection.
 */

const ACCESS_KEY = "intellihunt_token";
const REFRESH_KEY = "intellihunt_refresh";
const USER_KEY    = "intellihunt_user";

export type StoredUser = {
  id: string;
  username: string;
  email: string;
  organization: { id: string; name: string };
};

// ── Token storage ──────────────────────────────────────────────────────────────

export function setTokens(access: string, refresh: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  // Cookie for Next.js middleware (30-day expiry, SameSite=Lax, no httpOnly so JS can read it)
  document.cookie = `auth_token=${access}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = "auth_token=; path=/; max-age=0";
}

// ── User profile storage ───────────────────────────────────────────────────────

export function setUser(user: StoredUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/** Redirect to /login, preserving the attempted path in the query string. */
export function redirectToLogin(from?: string): void {
  if (typeof window === "undefined") return;
  const url = from ? `/login?from=${encodeURIComponent(from)}` : "/login";
  window.location.href = url;
}
