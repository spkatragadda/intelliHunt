/**
 * Client-side auth management.
 * JWTs are stored in HttpOnly cookies (set by the server) — JS cannot read them.
 * Only the user profile is stored in localStorage for UI display purposes.
 */

const USER_KEY = "intellihunt_user";

export type StoredUser = {
  id: string;
  username: string;
  email: string;
  organization: { id: string; name: string };
};

// ── Auth lifecycle ────────────────────────────────────────────────────────────

export async function clearAuth(): Promise<void> {
  if (typeof window === "undefined") return;
  // Ask the server to clear HttpOnly cookies
  try {
    await fetch("/api/auth/logout/", { method: "POST", credentials: "same-origin" });
  } catch {
    // Best-effort — server may be unreachable
  }
  localStorage.removeItem(USER_KEY);
}

export function clearAuthLocal(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
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
  return !!getUser();
}

/** Redirect to /login, preserving the attempted path in the query string. */
export function redirectToLogin(from?: string): void {
  if (typeof window === "undefined") return;
  const url = from ? `/login?from=${encodeURIComponent(from)}` : "/login";
  window.location.href = url;
}
