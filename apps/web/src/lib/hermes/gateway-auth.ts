import "server-only";

import { GATEWAY_SERVICE_HEADERS } from "@hermes-console/shared/gateway";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { headers as requestHeaders } from "next/headers";
import { gatewayServiceMasterSecret } from "@/lib/hermes/relay-identity";
import { derivedFallback, resolveInstallationSecret } from "@/lib/hermes/installation-secrets";

export type GatewayAuthScope = "installation" | "relay" | "unregistered";

// Trois portées, trois sources de secret :
//   relay        — le Relay n'est pas une installation, il s'authentifie avec le
//                  master (apps/gateway/gateway/relay.go:271) ;
//   unregistered — l'installation n'existe PAS encore en base (préflight du flux
//                  « Connecter »). Interroger la base y serait toujours vain, et
//                  imposerait une connexion Postgres à un appel qui n'en a pas besoin ;
//   installation — le cas courant : la base d'abord, la dérivation en repli.
function gatewayServiceSecret(installationKey: string, scope: GatewayAuthScope) {
  if (scope === "relay") return Promise.resolve(gatewayServiceMasterSecret());
  if (scope === "unregistered") {
    return Promise.resolve(derivedFallback("service", installationKey));
  }
  return resolveInstallationSecret("service", installationKey);
}

function validRequestId(value: string | null | undefined) {
  return value?.match(/^[a-zA-Z0-9._-]{8,128}$/)?.[0] ?? null;
}

async function correlationId(explicit: string | undefined) {
  const provided = validRequestId(explicit);
  if (provided) return provided;
  try {
    const incoming = validRequestId((await requestHeaders()).get(GATEWAY_SERVICE_HEADERS.requestId));
    if (incoming) return incoming;
  } catch {
    // Scripts and startup tasks run outside a Next.js request context.
  }
  return randomUUID();
}

export async function createGatewayServiceHeaders(input: {
  method: string;
  requestUri: string;
  profile: string;
  installationKey: string;
  body?: BodyInit | null;
  timestamp?: number;
  scope?: GatewayAuthScope;
  requestId?: string;
}) {
  const timestamp = input.timestamp ?? Date.now();
  const nonce = randomBytes(16).toString("hex");
  const body = typeof input.body === "string" ? input.body : "";
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = [
    input.method.toUpperCase(),
    input.requestUri,
    String(timestamp),
    nonce,
    input.profile,
    digest,
  ].join("\n");
  const secret = await gatewayServiceSecret(input.installationKey, input.scope ?? "installation");
  const signature = createHmac("sha256", secret)
    .update(canonical)
    .digest("base64url");
  return {
    [GATEWAY_SERVICE_HEADERS.timestamp]: String(timestamp),
    [GATEWAY_SERVICE_HEADERS.nonce]: nonce,
    [GATEWAY_SERVICE_HEADERS.signature]: signature,
    [GATEWAY_SERVICE_HEADERS.profile]: input.profile,
    [GATEWAY_SERVICE_HEADERS.installation]: input.installationKey,
    [GATEWAY_SERVICE_HEADERS.requestId]: await correlationId(input.requestId),
  };
}
