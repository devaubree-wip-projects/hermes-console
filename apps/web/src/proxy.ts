import { after, NextResponse, type NextRequest } from "next/server";
import { normalizedRequestId, webLogger } from "@/lib/observability/logger";
import { legacyTenantRedirectPath } from "@/lib/tenant-routing";

export function proxy(request: NextRequest) {
  const startedAt = performance.now();
  const requestId = normalizedRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const redirectPath = legacyTenantRedirectPath(request.nextUrl.pathname);
  const response = redirectPath
    ? NextResponse.redirect(new URL(redirectPath + request.nextUrl.search, request.url), 308)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  if (process.env.NODE_ENV === "production" || process.env.HERMES_LOG_HTTP === "true") {
    after(() => {
      webLogger.info("http.request.completed", {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      });
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
