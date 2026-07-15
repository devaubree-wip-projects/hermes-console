import type { Instrumentation } from "next";
import { webLogger } from "@/lib/observability/logger";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    webLogger.info("service.started", {
      runtime: "nodejs",
      version: process.env.npm_package_version ?? "unknown",
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const url = new URL(request.path, "http://hermes-console.local");
  webLogger.error("http.request.failed", {
    requestId: Array.isArray(request.headers["x-request-id"])
      ? request.headers["x-request-id"][0]
      : request.headers["x-request-id"],
    method: request.method,
    path: url.pathname,
    routePath: context.routePath,
    routeType: context.routeType,
    error,
  });
};
