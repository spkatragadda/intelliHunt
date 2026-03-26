import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  async rewrites() {
    const backendBase =
      process.env.API_BASE_INTERNAL ?? "http://django:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendBase}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent the page from being embedded in iframes
          { key: "X-Frame-Options",          value: "DENY" },
          // Stop browsers from sniffing MIME types
          { key: "X-Content-Type-Options",   value: "nosniff" },
          // Only send the origin as the Referer header
          { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
          // Disable legacy XSS filter (modern browsers use CSP instead)
          { key: "X-XSS-Protection",         value: "0" },
          // Restrict access to browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Content Security Policy
          // script-src 'self' 'unsafe-inline' is required by Next.js inline scripts;
          // tighten further by switching to nonce-based CSP when ready.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
