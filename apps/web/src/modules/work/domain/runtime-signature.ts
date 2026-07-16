import { createHash, createHmac } from "node:crypto";

export function runtimeRequestSignature(input: {
  secret: string;
  method: string;
  requestUri: string;
  timestamp: number;
  nonce: string;
  profile: string;
  body: string;
}) {
  const digest = createHash("sha256").update(input.body).digest("hex");
  const canonical = [
    input.method.toUpperCase(),
    input.requestUri,
    String(input.timestamp),
    input.nonce,
    input.profile,
    digest,
  ].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("base64url");
}
