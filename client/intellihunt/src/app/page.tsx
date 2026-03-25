"use client";

import { useEffect, useRef, useState } from "react";

/* ─── Animated scan line ─────────────────────────────────── */
function ScanLine() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(74,158,255,0.15) 20%, rgba(74,158,255,0.6) 50%, rgba(74,158,255,0.15) 80%, transparent 100%)",
          animation: "scanline 6s linear infinite",
          willChange: "transform",
        }}
      />
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(-10px); opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes floatBlob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(30px, -20px) scale(1.05); }
          66%  { transform: translate(-20px, 15px) scale(0.97); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blinkCursor {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes statReveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: rgba(74,158,255,0.2); }
          50%      { border-color: rgba(74,158,255,0.5); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.6; }
        }
        @keyframes dotBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

/* ─── Typing headline ────────────────────────────────────── */
function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) { clearInterval(iv); setDone(true); }
    }, 38);
    return () => clearInterval(iv);
  }, [text]);
  return (
    <span>
      {displayed}
      {!done && (
        <span style={{ animation: "blinkCursor 0.9s step-end infinite", color: "var(--accent)" }}>|</span>
      )}
    </span>
  );
}

/* ─── Counter animation ──────────────────────────────────── */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    const duration = 1400;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(ease * to));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to]);
  return <>{val.toLocaleString()}{suffix}</>;
}

/* ─── Feature card ───────────────────────────────────────── */
function FeatureCard({
  icon, title, desc, delay = 0,
}: { icon: React.ReactNode; title: string; desc: string; delay?: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "linear-gradient(135deg, rgba(74,158,255,0.07) 0%, rgba(74,158,255,0.02) 100%)"
          : "rgba(255,255,255,0.02)",
        border: "1px solid",
        borderColor: hovered ? "rgba(74,158,255,0.35)" : "rgba(255,255,255,0.07)",
        borderRadius: "16px",
        padding: "28px",
        transition: "all 0.25s ease",
        boxShadow: hovered ? "0 0 32px rgba(74,158,255,0.08), inset 0 1px 0 rgba(74,158,255,0.1)" : "none",
        animation: `fadeUp 0.6s ease both`,
        animationDelay: `${delay}ms`,
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top accent line */}
      <div style={{
        position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(74,158,255,0.4), transparent)",
        opacity: hovered ? 1 : 0, transition: "opacity 0.25s",
      }} />

      <div style={{
        width: "40px", height: "40px", borderRadius: "10px",
        background: "rgba(74,158,255,0.1)",
        border: "1px solid rgba(74,158,255,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: "16px", color: "var(--accent)",
        transition: "all 0.25s",
        boxShadow: hovered ? "0 0 16px rgba(74,158,255,0.2)" : "none",
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: "15px", fontWeight: 700,
        color: "var(--text-primary)",
        fontFamily: "var(--font-display)",
        marginBottom: "8px", letterSpacing: "-0.01em",
      }}>{title}</div>
      <div style={{
        fontSize: "13.5px", lineHeight: 1.65,
        color: "var(--text-muted)",
        fontFamily: "var(--font-display)",
      }}>{desc}</div>
    </div>
  );
}

/* ─── Step ────────────────────────────────────────────────── */
function Step({ n, title, desc, last = false }: { n: number; title: string; desc: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flex: 1, position: "relative" }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: "42px", height: "42px", borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(74,158,255,0.22), rgba(74,158,255,0.06))",
          border: "1px solid rgba(74,158,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700,
          color: "var(--accent)", flexShrink: 0,
          boxShadow: "0 0 20px rgba(74,158,255,0.15)",
        }}>{String(n).padStart(2, "0")}</div>
      </div>
      <div style={{ paddingTop: "6px", flex: 1 }}>
        <div style={{
          fontSize: "15px", fontWeight: 700,
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
          marginBottom: "6px", letterSpacing: "-0.01em",
        }}>{title}</div>
        <div style={{
          fontSize: "13.5px", color: "var(--text-muted)",
          fontFamily: "var(--font-display)", lineHeight: 1.6,
        }}>{desc}</div>
      </div>
      {!last && (
        <div style={{
          position: "absolute", top: "21px", left: "42px", right: "-20px",
          height: "1px", zIndex: 0,
          background: "linear-gradient(90deg, rgba(74,158,255,0.35), rgba(74,158,255,0.05))",
          display: "none",
        }} />
      )}
    </div>
  );
}

/* ─── Icons ───────────────────────────────────────────────── */
const icons = {
  shield: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  plug: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  ),
  code: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  lock: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  sparkles: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  ),
  database: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════ */

export default function HomePage() {
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
      overflowX: "hidden",
    }}>

      {/* ── Global grid backdrop ── */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(74,158,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(74,158,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "56px 56px",
      }} />

      {/* ── Navbar ── */}
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
        {/* Logo */}
        <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", flex: 1 }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "9px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.22), rgba(74,158,255,0.06))",
            border: "1px solid rgba(74,158,255,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#4a9eff",
            boxShadow: "0 0 16px rgba(74,158,255,0.2)",
          }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span style={{
            fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}>IntelliHunt</span>
          <span style={{
            marginLeft: "2px",
            fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700,
            letterSpacing: "0.12em", color: "var(--accent)",
            padding: "2px 6px", borderRadius: "4px",
            background: "rgba(74,158,255,0.1)",
            border: "1px solid rgba(74,158,255,0.2)",
          }}>BETA</span>
        </a>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <a href="/login" style={{
            padding: "7px 16px", borderRadius: "8px",
            color: "var(--text-muted)", textDecoration: "none",
            fontSize: "13.5px", fontWeight: 500,
            transition: "color 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)"; }}
          >
            Sign In
          </a>
          <a href="/register" style={{
            padding: "8px 18px", borderRadius: "9px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.2), rgba(74,158,255,0.08))",
            border: "1px solid rgba(74,158,255,0.35)",
            color: "#4a9eff", textDecoration: "none",
            fontSize: "13.5px", fontWeight: 700,
            letterSpacing: "-0.01em",
            transition: "all 0.15s",
            boxShadow: "0 0 16px rgba(74,158,255,0.1)",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.3), rgba(74,158,255,0.12))";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 24px rgba(74,158,255,0.25)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "linear-gradient(135deg, rgba(74,158,255,0.2), rgba(74,158,255,0.08))";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 16px rgba(74,158,255,0.1)";
            }}
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "120px 32px 80px",
        overflow: "hidden",
      }}>
        <ScanLine />

        {/* Glow blobs */}
        <div style={{
          position: "absolute", top: "15%", left: "50%",
          transform: "translateX(-50%)",
          width: "700px", height: "400px",
          background: "radial-gradient(ellipse at center, rgba(74,158,255,0.12) 0%, transparent 70%)",
          pointerEvents: "none", zIndex: 0,
          animation: "glowPulse 4s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "30%", left: "20%",
          width: "300px", height: "300px",
          background: "radial-gradient(circle, rgba(74,158,255,0.06) 0%, transparent 70%)",
          animation: "floatBlob 14s ease-in-out infinite reverse",
          pointerEvents: "none", zIndex: 0,
        }} />

        <div style={{
          position: "relative", zIndex: 2,
          maxWidth: "820px", width: "100%", textAlign: "center",
        }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            marginBottom: "28px",
            padding: "6px 14px",
            background: "rgba(74,158,255,0.07)",
            border: "1px solid rgba(74,158,255,0.2)",
            borderRadius: "100px",
            animation: "fadeUp 0.5s ease both",
          }}>
            <span style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 8px var(--accent)",
              display: "inline-block",
              animation: "dotBlink 2s ease-in-out infinite",
            }} />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px", fontWeight: 700,
              letterSpacing: "0.18em", color: "var(--accent)",
            }}>SECURE AGENTIC THREAT INTELLIGENCE PLATFORM</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(42px, 7vw, 76px)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            marginBottom: "24px",
            fontStyle: "italic",
            animation: "fadeUp 0.6s 0.1s ease both",
          }}>
            <TypingText text="Hunt threats before they hunt you." />
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            lineHeight: 1.65,
            color: "var(--text-muted)",
            maxWidth: "580px",
            margin: "0 auto 40px",
            animation: "fadeUp 0.6s 0.3s ease both",
          }}>
            IntelliHunt aggregates CVE intelligence, scans your repositories, and maps
            your attack surface — powered by <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>autonomous AI agents</span> built for modern security teams.
          </p>

          {/* CTAs */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "14px", marginBottom: "56px",
            flexWrap: "wrap",
            animation: "fadeUp 0.6s 0.45s ease both",
          }}>
            <a href="/register" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "13px 28px", borderRadius: "11px",
              background: "linear-gradient(135deg, rgba(74,158,255,0.28), rgba(74,158,255,0.1))",
              border: "1px solid rgba(74,158,255,0.45)",
              color: "#4a9eff", textDecoration: "none",
              fontSize: "14px", fontWeight: 700, letterSpacing: "-0.01em",
              boxShadow: "0 0 32px rgba(74,158,255,0.15), inset 0 1px 0 rgba(74,158,255,0.2)",
              transition: "all 0.2s ease",
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.boxShadow = "0 0 48px rgba(74,158,255,0.3), inset 0 1px 0 rgba(74,158,255,0.25)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.boxShadow = "0 0 32px rgba(74,158,255,0.15), inset 0 1px 0 rgba(74,158,255,0.2)";
                el.style.transform = "translateY(0)";
              }}
            >
              Start for free
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
            <a href="/login" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "13px 24px", borderRadius: "11px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--text-secondary)", textDecoration: "none",
              fontSize: "14px", fontWeight: 600,
              transition: "all 0.2s ease",
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.06)";
                el.style.borderColor = "rgba(255,255,255,0.18)";
                el.style.color = "var(--text-primary)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.03)";
                el.style.borderColor = "rgba(255,255,255,0.1)";
                el.style.color = "var(--text-secondary)";
              }}
            >
              Sign in to dashboard
            </a>
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "0",
            animation: "fadeUp 0.6s 0.6s ease both",
          }}>
            {[
              { value: 10000, suffix: "+", label: "CVEs tracked" },
              { value: 3, suffix: "", label: "EDR integrations" },
              { value: 100, suffix: "%", label: "End-to-end encrypted" },
            ].map((stat, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "18px 36px",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700,
                  color: "var(--text-primary)", letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}>
                  <CountUp to={stat.value} suffix={stat.suffix} />
                </div>
                <div style={{
                  fontSize: "11px", color: "var(--text-muted)",
                  marginTop: "6px", letterSpacing: "0.06em",
                  fontFamily: "var(--font-mono)",
                }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "120px",
          background: "linear-gradient(to bottom, transparent, var(--bg))",
          pointerEvents: "none", zIndex: 3,
        }} />
      </section>

      {/* ── Features ── */}
      <section style={{
        position: "relative", zIndex: 5,
        padding: "80px 32px 100px",
        maxWidth: "1200px", margin: "0 auto",
      }}>
        {/* Section label */}
        <div style={{ textAlign: "center", marginBottom: "56px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            marginBottom: "14px",
            fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.2em", color: "var(--accent)",
          }}>
            <span style={{ display: "inline-block", width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6 }} />
            CAPABILITIES
            <span style={{ display: "inline-block", width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6 }} />
          </div>
          <h2 style={{
            fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800,
            color: "var(--text-primary)", letterSpacing: "-0.025em",
            fontFamily: "var(--font-display)",
            marginBottom: "12px",
          }}>Everything your security team needs</h2>
          <p style={{ fontSize: "15px", color: "var(--text-muted)", maxWidth: "480px", margin: "0 auto", lineHeight: 1.6 }}>
            From raw CVE data to actionable intelligence — all in one platform.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "16px",
        }}>
          <FeatureCard delay={0} icon={icons.shield} title="CVE Intelligence"
            desc="Real-time NVD feed ingestion. AI-generated reports map your exact software stack to known vulnerabilities with severity scoring." />
          <FeatureCard delay={80} icon={icons.plug} title="EDR Integration"
            desc="Pull installed software inventory directly from CrowdStrike Falcon, SentinelOne, and Microsoft Defender for Endpoint." />
          <FeatureCard delay={160} icon={icons.code} title="Repository Scanner"
            desc="Point IntelliHunt at any GitHub repo or upload a ZIP. Dependencies are fingerprinted against the CVE database automatically." />
          <FeatureCard delay={240} icon={icons.lock} title="Zero-Trust Security"
            desc="JWT-scoped access controls, end-to-end encrypted data in transit, and role-based permissions — security built into every layer." />
          <FeatureCard delay={320} icon={icons.sparkles} title="AI Report Generation"
            desc="LLM-powered markdown reports generated by an autonomous agent crew — exportable, shareable, and always current." />
          <FeatureCard delay={400} icon={icons.database} title="CMDB Connectors"
            desc="ServiceNow, BMC Helix, and Atlassian Insight integrations bring your existing asset database into the vulnerability workflow." />
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{
        position: "relative", zIndex: 5,
        padding: "80px 32px 100px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(74,158,255,0.015)",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
              letterSpacing: "0.2em", color: "var(--accent)",
              marginBottom: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              <span style={{ display: "inline-block", width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6 }} />
              HOW IT WORKS
              <span style={{ display: "inline-block", width: "20px", height: "1px", background: "var(--accent)", opacity: 0.6 }} />
            </div>
            <h2 style={{
              fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800,
              color: "var(--text-primary)", letterSpacing: "-0.025em",
              fontFamily: "var(--font-display)",
            }}>Three steps to full visibility</h2>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "40px 48px",
          }}>
            <Step n={1}
              title="Connect your sources"
              desc="Link your EDR platform or CMDB in the Settings panel. IntelliHunt pulls your complete installed software inventory via secure API." />
            <Step n={2}
              title="Automated CVE mapping"
              desc="The platform cross-references your inventory against the full NVD database and scores each vulnerability by CVSS severity." />
            <Step n={3} last
              title="Download your report"
              desc="An AI agent crew synthesizes findings into a structured markdown report. Review online or export for compliance documentation." />
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section style={{
        position: "relative", zIndex: 5,
        padding: "100px 32px",
        textAlign: "center",
        overflow: "hidden",
      }}>
        {/* glow */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px", height: "300px",
          background: "radial-gradient(ellipse, rgba(74,158,255,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: "glowPulse 5s ease-in-out infinite",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            marginBottom: "20px",
            fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.2em", color: "var(--accent)",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px var(--success)", display: "inline-block", animation: "dotBlink 2s ease-in-out infinite" }} />
            READY TO DEPLOY
          </div>
          <h2 style={{
            fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800,
            color: "var(--text-primary)", letterSpacing: "-0.03em",
            fontFamily: "var(--font-display)",
            marginBottom: "14px", fontStyle: "italic",
          }}>
            Ready to secure your organization?
          </h2>
          <p style={{
            fontSize: "16px", color: "var(--text-muted)",
            marginBottom: "40px", lineHeight: 1.6,
          }}>
            Get started in under 60 seconds. No credit card required.
          </p>

          <a href="/register" style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "15px 32px", borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(74,158,255,0.3), rgba(74,158,255,0.1))",
            border: "1px solid rgba(74,158,255,0.5)",
            color: "#4a9eff", textDecoration: "none",
            fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em",
            boxShadow: "0 0 40px rgba(74,158,255,0.2), inset 0 1px 0 rgba(74,158,255,0.3)",
            transition: "all 0.2s ease",
          }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.boxShadow = "0 0 60px rgba(74,158,255,0.35), inset 0 1px 0 rgba(74,158,255,0.35)";
              el.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.boxShadow = "0 0 40px rgba(74,158,255,0.2), inset 0 1px 0 rgba(74,158,255,0.3)";
              el.style.transform = "translateY(0)";
            }}
          >
            Create your organization
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        position: "relative", zIndex: 5,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "7px",
            background: "rgba(74,158,255,0.1)",
            border: "1px solid rgba(74,158,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#4a9eff",
          }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: "13px", fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}>IntelliHunt</div>
            <div style={{
              fontSize: "11px", color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
            }}>Threat intelligence, automated.</div>
          </div>
        </div>
        <div style={{
          fontSize: "12px", color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}>© 2025 IntelliHunt. All rights reserved.</div>
      </footer>
    </div>
  );
}
