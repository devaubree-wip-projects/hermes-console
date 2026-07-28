import type { SessionCookiePort } from "./ports";

export function createSignOut(sessions: SessionCookiePort) {
  return async function signOut() {
    await sessions.destroy();
    return { ok: true as const };
  };
}
