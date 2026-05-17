"use client";

import { Suspense, useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setUser, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      const from = searchParams.get("from") ?? "/dashboard";
      router.replace(from);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        let msg = "Login failed.";
        try { msg = (await res.json()).error ?? msg; } catch { msg = "Login failed."; }
        setError(msg);
        return;
      }
      const data = await res.json();
      setUser({
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        tier: data.user.tier ?? "free",
        organization: data.organization,
      });
      const defaultRoute = data.user.tier === "pro" ? "/dashboard" : "/repo-scanner";
      const from = searchParams.get("from") ?? defaultRoute;
      router.replace(from);
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: "24px",
    }}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `linear-gradient(rgba(74,158,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(74,158,255,0.025) 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: "420px",
      }}>
        {/* Logo / brand */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "48px", height: "48px", borderRadius: "14px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.2), rgba(74,158,255,0.05))",
            border: "1px solid var(--accent-border)",
            marginBottom: "16px",
          }}>
            <svg width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em",
            color: "var(--accent)", marginBottom: "6px",
          }}>INTELLIHUNT</div>
          <div style={{
            fontSize: "20px", fontWeight: 700,
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.02em",
          }}>Sign in to your account</div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "28px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {error && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "8px",
                color: "#ef4444",
                fontSize: "13px",
                fontFamily: "var(--font-mono), monospace",
              }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
                color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
              }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "8px", color: "var(--text-primary)",
                  fontSize: "14px", outline: "none",
                  fontFamily: "var(--font-display)",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
                color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
              }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "8px", color: "var(--text-primary)",
                  fontSize: "14px", outline: "none",
                  fontFamily: "var(--font-display)",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>

            <div style={{ textAlign: "right" }}>
              <a href="/forgot-password" style={{
                fontSize: "12px", color: "var(--text-muted)",
                textDecoration: "none", fontFamily: "var(--font-mono), monospace",
              }}>
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "11px",
                background: loading
                  ? "rgba(74,158,255,0.1)"
                  : "linear-gradient(135deg, rgba(74,158,255,0.22), rgba(74,158,255,0.1))",
                border: "1px solid var(--accent-border)",
                borderRadius: "9px",
                color: "var(--accent)",
                fontSize: "12px", fontWeight: 700,
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono), monospace",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "all 0.15s",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? (
                <>
                  <span className="animate-spin" style={{
                    display: "inline-block", width: "12px", height: "12px",
                    border: "2px solid rgba(74,158,255,0.3)",
                    borderTopColor: "var(--accent)", borderRadius: "50%",
                  }} />
                  SIGNING IN…
                </>
              ) : "SIGN IN →"}
            </button>
          </form>

          <div style={{
            marginTop: "20px", paddingTop: "20px",
            borderTop: "1px solid var(--border)",
            textAlign: "center",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}>
            No account?{" "}
            <a href="/register" style={{
              color: "var(--accent)", textDecoration: "none", fontWeight: 600,
            }}>
              Create one
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
