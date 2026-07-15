import "server-only";

import { createGatewayServiceHeaders } from "@/lib/hermes/gateway-auth";

export async function revokeRelayFingerprints(input: {
  gatewayUrl: string;
  installationId: string;
  installationKey: string;
  fingerprints: string[];
}) {
  if (!input.fingerprints.length) return { propagated: true as const };
  const endpoint = new URL("/v1/relay/admin/revoke", input.gatewayUrl);
  const requestUri = endpoint.pathname;
  const body = JSON.stringify({ installationId: input.installationId, fingerprints: input.fingerprints });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createGatewayServiceHeaders({
          method: "POST",
          requestUri,
          profile: "default",
          installationKey: input.installationKey,
          scope: "relay",
          body,
        }),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    return { propagated: response.ok, status: response.status };
  } catch {
    return { propagated: false as const, status: 0 };
  }
}

export async function revokeEdgeTickets(input: {
  gatewayUrl: string;
  installationKey: string;
}) {
  const requestUri = "/v1/control/revoke";
  const endpoint = `${input.gatewayUrl.replace(/\/$/, "")}${requestUri}`;
  const body = JSON.stringify({ installationId: input.installationKey });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createGatewayServiceHeaders({ method: "POST", requestUri, profile: "default", installationKey: input.installationKey, body }),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
