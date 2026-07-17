/** Public base URL of the console, used to build links sent by email. */
export function consoleBaseUrl(): string {
  return (process.env.HERMES_CONSOLE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}

/** Accepts only same-origin absolute paths for post-auth redirects. */
export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
