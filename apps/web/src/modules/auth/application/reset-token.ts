import { sha256Token } from "@/lib/token-hash";

export const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

/** Only the sha256 hash of a reset token is ever persisted. */
export function hashResetToken(token: string): string {
  return sha256Token(token);
}
