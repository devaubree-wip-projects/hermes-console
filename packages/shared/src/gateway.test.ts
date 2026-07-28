import { describe, expect, test } from "bun:test";
import { GATEWAY_PATHS, GATEWAY_PROTOCOL_VERSION, GATEWAY_SERVICE_HEADERS, GATEWAY_WORK_PATHS, GATEWAY_WORK_PROTOCOL_VERSION } from "./gateway";

describe("canonical gateway contract", () => {
  test("exposes the stable protocol shared by web and Go", () => {
    expect(GATEWAY_PROTOCOL_VERSION).toBe(1);
    expect(GATEWAY_PATHS.websocket).toBe("/v1/ws");
    expect(GATEWAY_PATHS.telegramWork).toBe("/v1/work/telegram");
    expect(GATEWAY_SERVICE_HEADERS.signature).toBe("X-Hermes-Signature");
    expect(GATEWAY_SERVICE_HEADERS.requestId).toBe("X-Request-Id");
    expect(GATEWAY_WORK_PROTOCOL_VERSION).toBe(1);
    expect(GATEWAY_WORK_PATHS.claim).toBe("/api/runtime/work/claim");
    expect(GATEWAY_WORK_PATHS.telegramCommand).toBe("/api/runtime/work/telegram");
    expect(GATEWAY_PATHS.telegramMission).toBe("/v1/agents/mission/telegram");
    expect(GATEWAY_WORK_PATHS.telegramMissionCommand).toBe("/api/runtime/agents/mission");
    expect(GATEWAY_PATHS.telegramAgent).toBe("/v1/agents/create/telegram");
    expect(GATEWAY_WORK_PATHS.telegramAgentCommand).toBe("/api/runtime/agents/create");
    expect(GATEWAY_WORK_PATHS.runEvents).toContain("{runId}");
  });
});
