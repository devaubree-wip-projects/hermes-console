import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@hermes-console/shared"],
  logging: {
    browserToTerminal: "warn",
    fetches: { fullUrl: false, hmrRefreshes: false },
    incomingRequests: { ignore: [/^\/_next\//, /^\/favicon\.ico$/] },
    serverFunctions: false,
  },
};

export default nextConfig;
