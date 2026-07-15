import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { deriveInstallationSecret, gatewayServiceMasterSecret } from "@/lib/hermes/relay-identity";

function gatewayServiceSecret(installationKey: string, scope: "installation" | "relay") {
  if (scope === "installation" && process.env.HERMES_GATEWAY_DERIVE_SECRETS !== "false") {
    return deriveInstallationSecret("service", installationKey);
  }
  return gatewayServiceMasterSecret();
}

export function createGatewayServiceHeaders(input: {
  method: string;
  requestUri: string;
  profile: string;
  installationKey: string;
  body?: BodyInit | null;
  timestamp?: number;
  scope?: "installation" | "relay";
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
  const signature = createHmac("sha256", gatewayServiceSecret(input.installationKey, input.scope ?? "installation"))
    .update(canonical)
    .digest("base64url");
  return {
    "X-Hermes-Timestamp": String(timestamp),
    "X-Hermes-Nonce": nonce,
    "X-Hermes-Signature": signature,
    "X-Hermes-Profile": input.profile,
    "X-Hermes-Installation-Id": input.installationKey,
  };
}
