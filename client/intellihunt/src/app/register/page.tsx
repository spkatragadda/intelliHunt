"use client";

import { useState, FormEvent } from "react";

export default function RegisterPage() {
  const [orgName, setOrgName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_name: orgName, username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Is the server running?");
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

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "440px" }}>
        {/* Brand */}
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
          }}>Create your organization</div>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}>
            Your data stays isolated from other tenants.
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "28px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {submitted ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{
                padding: "16px 18px",
                background: "rgba(74,222,128,0.06)",
                border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: "10px",
                display: "flex", gap: "14px", alignItems: "flex-start",
              }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                  background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" fill="none" stroke="#4ade80" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#4ade80", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.05em", marginBottom: "5px" }}>
                    REQUEST SUBMITTED
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    Your account request is pending admin approval. You&apos;ll receive an email at <strong style={{ color: "var(--text-secondary)" }}>{email}</strong> once your account is approved.
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <a href="/login" style={{
                  fontSize: "12px", color: "var(--text-muted)", textDecoration: "none",
                  fontFamily: "var(--font-mono), monospace", letterSpacing: "0.05em",
                }}>← Back to sign in</a>
              </div>
            </div>
          ) : (
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

            {/* Org name — prominent first field */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
                color: "var(--accent)", fontFamily: "var(--font-mono), monospace",
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                ORGANIZATION NAME
              </label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
                autoFocus
                placeholder="Acme Security Corp"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>

            {/* Divider */}
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              color: "var(--text-muted)", fontSize: "10px",
              fontFamily: "var(--font-mono), monospace", letterSpacing: "0.1em",
            }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              ADMIN ACCOUNT
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={labelStyle}>USERNAME</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={labelStyle}>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
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
                  CREATING ORGANIZATION…
                </>
              ) : "CREATE ORGANIZATION →"}
            </button>

            <div style={{
              marginTop: "2px", paddingTop: "20px",
              borderTop: "1px solid var(--border)",
              textAlign: "center",
              fontSize: "13px",
              color: "var(--text-muted)",
            }}>
              Already have an account?{" "}
              <a href="/login" style={{
                color: "var(--accent)", textDecoration: "none", fontWeight: 600,
              }}>
                Sign in
              </a>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
  color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "var(--bg)", border: "1px solid var(--border)",
  borderRadius: "8px", color: "var(--text-primary)",
  fontSize: "14px", outline: "none",
  fontFamily: "var(--font-display)",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};
