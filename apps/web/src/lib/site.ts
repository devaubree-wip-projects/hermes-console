/**
 * Public site metadata used by SEO surfaces (root metadata, robots, sitemap).
 *
 * `siteUrl` drives `metadataBase`, canonical URLs and the sitemap host. In
 * production it MUST point to the real public console domain — set
 * `HERMES_CONSOLE_URL` accordingly (the local fallback is dev-only).
 */
export const siteUrl = process.env.HERMES_CONSOLE_URL ?? "http://localhost:3010";

export const siteName = "Hermes Console";

export const siteDescription =
  "Cockpit web pour piloter des agents Hermes : transformez conversations et automatisations en travail durable, assigné, observable et récupérable — tâches, sessions, fichiers, connaissances, validations et audit.";
