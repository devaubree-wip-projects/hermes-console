import { createHash, createHmac, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";

const CREDENTIAL_VERSION = 1;
const DEFAULT_IDENTITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVELOPMENT_SECRET = "hermes-console-local-development";

export type RelayIdentityClaims = {
  version: 1;
  tenantId: string;
  installationId: string;
  installationKey: string;
  fingerprint: string;
  exp: number;
};

function configuredSecret(label: string, values: Array<string | undefined>) {
  const value = values.find((candidate) => candidate?.trim())?.trim();
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${label} doit être défini explicitement en production.`);
  }
  return value ?? DEVELOPMENT_SECRET;
}

export function gatewayServiceMasterSecret() {
  return configuredSecret("HERMES_GATEWAY_SERVICE_SECRET", [
    process.env.HERMES_GATEWAY_SERVICE_SECRET,
    process.env.HERMES_GATEWAY_TICKET_SECRET,
  ]);
}

export function gatewayTicketMasterSecret() {
  return configuredSecret("HERMES_GATEWAY_TICKET_SECRET", [process.env.HERMES_GATEWAY_TICKET_SECRET]);
}

function secret() {
  const value = configuredSecret("HERMES_RELAY_IDENTITY_SECRET", [
    process.env.HERMES_RELAY_IDENTITY_SECRET,
    process.env.HERMES_GATEWAY_SERVICE_SECRET,
  ]);
  if (value.length < 24) throw new Error("Le secret d’identité Relay doit contenir au moins 24 caractères.");
  return value;
}

export function deriveInstallationSecret(purpose: "service" | "ticket", installationKey: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(installationKey)) throw new Error("Clé d’installation invalide.");
  const master = purpose === "service"
    ? gatewayServiceMasterSecret()
    : gatewayTicketMasterSecret();
  return createHmac("sha256", master).update(`hermes-console:${purpose}:${installationKey}`).digest("base64url");
}

export function createEnrollmentToken() {
  return randomBytes(32).toString("base64url");
}

export function hashEnrollmentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function certificateIdentity(certificatePem: string) {
  const certificate = new X509Certificate(certificatePem);
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
    throw new Error("Le certificat Edge n’est pas actuellement valide.");
  }
  const fingerprint = createHash("sha256").update(certificate.raw).digest("hex");
  const publicKey = certificate.publicKey.export({ type: "spki", format: "pem" }).toString();
  return { fingerprint, publicKey, certificatePem: certificate.toString() };
}

export function signRelayIdentity(
  input: Omit<RelayIdentityClaims, "version" | "exp"> & { expiresAt?: Date },
) {
  const claims: RelayIdentityClaims = {
    version: CREDENTIAL_VERSION,
    tenantId: input.tenantId,
    installationId: input.installationId,
    installationKey: input.installationKey,
    fingerprint: input.fingerprint,
    exp: (input.expiresAt ?? new Date(Date.now() + DEFAULT_IDENTITY_TTL_MS)).getTime(),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyRelayIdentity(raw: string, now = new Date()): RelayIdentityClaims {
  const [payload, provided, extra] = raw.split(".");
  if (!payload || !provided || extra) throw new Error("Identité Relay malformée.");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const signature = Buffer.from(provided, "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new Error("Signature d’identité Relay invalide.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RelayIdentityClaims;
  if (
    claims.version !== CREDENTIAL_VERSION
    || !claims.tenantId
    || !claims.installationId
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(claims.installationKey)
    || !/^[a-f0-9]{64}$/.test(claims.fingerprint)
    || claims.exp <= now.getTime()
  ) {
    throw new Error("Identité Relay expirée ou incomplète.");
  }
  return claims;
}
