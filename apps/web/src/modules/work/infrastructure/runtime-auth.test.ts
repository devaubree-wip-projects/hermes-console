import { describe, expect, test } from "bun:test";
import { runtimeRequestSignature } from "../domain/runtime-signature";

describe("runtime work request signature", () => {
  test("is deterministic and binds method, path, profile and body", () => {
    const base = {
      secret: "service-secret-at-least-24-characters",
      method: "POST",
      requestUri: "/api/runtime/work/claim",
      timestamp: 1_752_000_000_000,
      nonce: "0123456789abcdef0123456789abcdef",
      profile: "default",
      body: '{"capacity":1}',
    };
    const signature = runtimeRequestSignature(base);
    expect(signature).toBe(runtimeRequestSignature(base));
    expect(signature).not.toBe(runtimeRequestSignature({ ...base, body: '{"capacity":2}' }));
    expect(signature).not.toBe(runtimeRequestSignature({ ...base, requestUri: "/api/runtime/work/heartbeat" }));
  });
});
