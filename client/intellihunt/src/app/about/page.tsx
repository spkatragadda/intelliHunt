"use client";

import { useState, useEffect } from "react";

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-display)",
    }}>
      {/* Grid backdrop */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(74,158,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(74,158,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: "56px 56px",
      }} />

      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "60px",
        display: "flex", alignItems: "center",
        padding: "0 32px",
        background: scrolled ? "rgba(9,12,22,0.92)" : "rgba(9,12,22,0.4)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: scrolled ? "1px solid rgba(74,158,255,0.1)" : "1px solid transparent",
        transition: "all 0.3s ease",
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", flex: 1 }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "9px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.22), rgba(74,158,255,0.06))",
            border: "1px solid rgba(74,158,255,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#4a9eff",
          }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span style={{
            fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em",
            color: "var(--text-primary)", fontFamily: "var(--font-display)",
          }}>IntelliHunt</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <a href="/" style={{
            padding: "7px 16px", borderRadius: "8px",
            color: "var(--text-muted)", textDecoration: "none",
            fontSize: "13.5px", fontWeight: 500, transition: "color 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; }}
          >← Home</a>
          <a href="/register" style={{
            padding: "8px 18px", borderRadius: "9px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.2), rgba(74,158,255,0.08))",
            border: "1px solid rgba(74,158,255,0.35)",
            color: "#4a9eff", textDecoration: "none",
            fontSize: "13.5px", fontWeight: 700,
            transition: "all 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.3), rgba(74,158,255,0.12))";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.2), rgba(74,158,255,0.08))";
            }}
          >Get Started</a>
        </div>
      </nav>

      {/* Article */}
      <main style={{
        position: "relative", zIndex: 1,
        maxWidth: "720px",
        margin: "0 auto",
        padding: "120px 32px 100px",
      }}>

        {/* Eyebrow */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          marginBottom: "24px",
          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
          letterSpacing: "0.18em", color: "var(--accent)",
        }}>
          <span style={{ width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6, display: "inline-block" }} />
          ABOUT INTELLIHUNT
          <span style={{ width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6, display: "inline-block" }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: "clamp(32px, 5vw, 48px)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
          marginBottom: "20px",
          fontStyle: "italic",
        }}>
          Automated threat intelligence<br />for every software stack.
        </h1>

        {/* Divider */}
        <div style={{
          height: "1px",
          background: "linear-gradient(90deg, rgba(74,158,255,0.35), transparent)",
          marginBottom: "36px",
        }} />

        {/* Lead */}
        <p style={{
          fontSize: "17px", lineHeight: 1.75,
          color: "var(--text-secondary)",
          marginBottom: "40px",
        }}>
          IntelliHunt is a security platform that automatically maps your organization&apos;s
          software inventory to known vulnerabilities — then surfaces what matters most.
          Instead of manually cross-referencing CVE databases, teams describe their stack
          once and let the platform do the rest.
        </p>

        {/* Section */}
        <Section title="What it does">
          <p>
            At its core, IntelliHunt pulls your software stack from wherever it lives —
            typed in directly, uploaded as a YAML configuration, connected through your
            EDR platform, or imported from a CMDB like ServiceNow or BMC Helix.
            It then queries the National Vulnerability Database (NVD) and scores each
            finding by CVSS severity, giving you an immediate picture of your exposure.
          </p>
          <p>
            Reports are generated by an autonomous AI agent crew and delivered as
            structured markdown — readable in the browser or exported for compliance
            documentation. New CVE data is continuously ingested, so reports stay
            current without manual reruns.
          </p>
        </Section>

        <Section title="Repository scanning">
          <p>
            Beyond configured stacks, IntelliHunt can scan any Git repository or
            uploaded ZIP archive. It fingerprints dependencies, identifies library
            versions, and cross-references them against the CVE database automatically.
            This makes it practical for engineering teams who want to audit a project
            before shipping or after a third-party component surfaces in the news.
          </p>
        </Section>

        <Section title="Who it&apos;s for">
          <p>
            IntelliHunt is designed for small-to-mid-sized security and DevSecOps teams
            that need vulnerability awareness without standing up a full SIEM or paying
            for an enterprise scanner. It complements existing tools rather than
            replacing them — it sits alongside your EDR, pulls inventory from your CMDB,
            and hands findings back to whoever owns remediation.
          </p>
        </Section>

        {/* CTA */}
        <div style={{
          marginTop: "56px",
          padding: "32px 28px",
          borderRadius: "16px",
          background: "rgba(74,158,255,0.04)",
          border: "1px solid rgba(74,158,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "24px", flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: "16px", fontWeight: 700,
              color: "var(--text-primary)", fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em", marginBottom: "4px",
            }}>Ready to try it?</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Create an organization and run your first report in under a minute.
            </div>
          </div>
          <a href="/register" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "11px 22px", borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.25), rgba(74,158,255,0.08))",
            border: "1px solid rgba(74,158,255,0.4)",
            color: "#4a9eff", textDecoration: "none",
            fontSize: "13px", fontWeight: 700, letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.35), rgba(74,158,255,0.12))";
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.25), rgba(74,158,255,0.08))";
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
            }}
          >
            Get started free
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        position: "relative", zIndex: 1,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "28px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "12px",
      }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          © 2025 IntelliHunt. All rights reserved.
        </div>
        <a href="/" style={{
          fontSize: "12px", color: "var(--text-muted)",
          fontFamily: "var(--font-mono)", textDecoration: "none",
          letterSpacing: "0.04em", transition: "color 0.15s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; }}
        >← Back to home</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "36px" }}>
      <h2 style={{
        fontSize: "13px", fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--accent)", fontFamily: "var(--font-mono)",
        textTransform: "uppercase", marginBottom: "14px",
      }}>{title}</h2>
      <div style={{
        fontSize: "15px", lineHeight: 1.75,
        color: "var(--text-muted)",
        display: "flex", flexDirection: "column", gap: "14px",
      }}>
        {children}
      </div>
    </div>
  );
}
