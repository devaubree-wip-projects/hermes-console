const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function allowedGatewayHosts() {
  const configured = (process.env.HERMES_GATEWAY_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") configured.push(...LOCAL_HOSTS);
  return new Set(configured);
}

export function validateGatewayUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL du gateway invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Le gateway doit utiliser HTTP ou HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("L’URL du gateway ne doit contenir ni identifiants, ni paramètres.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("HTTPS est obligatoire pour un gateway distant en production.");
  }
  if (!allowedGatewayHosts().has(url.hostname.toLowerCase())) {
    throw new Error("Cet hôte n’est pas autorisé par HERMES_GATEWAY_ALLOWED_HOSTS.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
