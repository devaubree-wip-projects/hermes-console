import type { NextConfig } from "next";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";

// script-src uses 'unsafe-inline' because Next's bootstrap and next-themes inject
// inline scripts; a nonce-based CSP would need per-request middleware and is left
// as a future hardening. connect-src stays permissive for secure remotes: the
// browser opens a WebSocket to the runtime gateway/relay, whose origin is dynamic
// per installation and unknown at build time. Dev additionally needs eval (HMR)
// and insecure transports (local gateway on ws://127.0.0.1).
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  `connect-src 'self' https: wss:${isProduction ? "" : " http: ws:"}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Ignored by browsers over plain HTTP, so it is safe to always emit; Caddy
  // serves the Console over HTTPS in production.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@hermes-console/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  logging: {
    browserToTerminal: "warn",
    fetches: { fullUrl: false, hmrRefreshes: false },
    incomingRequests: { ignore: [/^\/_next\//, /^\/favicon\.ico$/] },
    serverFunctions: false,
  },
};

export default nextConfig;
