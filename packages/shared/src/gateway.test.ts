import { describe, expect, test } from "bun:test";
import { GATEWAY_PATHS, GATEWAY_PROTOCOL_VERSION, GATEWAY_SERVICE_HEADERS } from "./gateway";

describe("canonical gateway contract", () => {
  test("exposes the stable protocol shared by web and Go", () => {
    expect(GATEWAY_PROTOCOL_VERSION).toBe(1);
    expect(GATEWAY_PATHS.websocket).toBe("/v1/ws");
    expect(GATEWAY_SERVICE_HEADERS.signature).toBe("X-Hermes-Signature");
    expect(GATEWAY_SERVICE_HEADERS.requestId).toBe("X-Request-Id");
  });
});
