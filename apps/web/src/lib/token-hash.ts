import { createHash } from "node:crypto";

/** Single-use links (password reset, invitations) only ever persist this hash. */
export function sha256Token(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
