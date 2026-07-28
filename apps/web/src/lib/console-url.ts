import { settingValue } from "@/lib/settings/resolve";

/**
 * Public base URL of the console, used to build links sent by email.
 * Asynchronous because the value is overridable from the Console itself: reading it
 * once at import would freeze whatever the `.env` said at boot.
 */
export async function consoleBaseUrl(): Promise<string> {
  const configured = await settingValue("HERMES_CONSOLE_URL");
  return (configured ?? "http://localhost:3010").replace(/\/+$/, "");
}

/** Accepts only same-origin absolute paths for post-auth redirects. */
export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
