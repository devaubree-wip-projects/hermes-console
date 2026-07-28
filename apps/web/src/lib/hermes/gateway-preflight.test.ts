import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { probeGateway, testGatewayProfile } = await import("./gateway-preflight");

const servers: Array<{ stop(): void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
});

function edgeServer(input?: { protocolVersion?: number; installationId?: string; preflightStatus?: number }) {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/healthz": Response.json({ ok: true }),
      "/readyz": Response.json({ ok: true, installationId: input?.installationId ?? "install-1" }),
      "/v1/capabilities": Response.json({
        protocolVersion: input?.protocolVersion ?? 1,
        gatewayVersion: "1",
        installationId: input?.installationId ?? "install-1",
        runtimeKind: "docker",
        features: ["runtime.http", "runtime.preflight"],
        lifecycle: ["start", "restart"],
      }),
      "/v1/preflight": (request) => {
        expect(request.headers.get("x-hermes-signature")).toBeTruthy();
        if (input?.preflightStatus) return new Response("unavailable", { status: input.preflightStatus });
        return Response.json({
          ok: true,
          protocolVersion: 1,
          gatewayVersion: "1",
          installationId: "install-1",
          runtimeKind: "docker",
          hermesVersion: "2026.7.7.2",
          profiles: [
            { name: "default", provider: "openai", model: "gpt-test", gatewayRunning: true },
            { name: "../unsafe" },
          ],
          system: { cpu_count: 4, memory: { total: 1024, used: 128 } },
        });
      },
      "/v1/control/profile-test": async (request) => {
        expect(request.headers.get("x-hermes-signature")).toBeTruthy();
        expect(await request.json()).toEqual({ profile: "default" });
        return Response.json({ ok: true, profile: "default", cleanup: true });
      },
    },
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

// Portée « unregistered » : ces scénarios sondent un Edge qui n'a pas encore de ligne
// d'installation, comme le fait le flux « Connecter ». La signature utilise donc le
// secret dérivé, et le test reste indépendant de toute base.
describe("Hermes Edge preflight", () => {
  test("negotiates the protocol and discovers only safe profiles", async () => {
    const result = await probeGateway(edgeServer(), "install-1", "unregistered");
    expect(result.status).toBe("ready");
    expect(result.hermesVersion).toBe("2026.7.7.2");
    expect(result.runtimeKind).toBe("docker");
    expect(result.profiles).toEqual([{
      name: "default",
      provider: "openai",
      model: "gpt-test",
      gatewayRunning: true,
    }]);
  });

  test("keeps an incompatible Edge visible in read-only state", async () => {
    const result = await probeGateway(edgeServer({ protocolVersion: 7 }), "install-1");
    expect(result.status).toBe("incompatible");
    expect(result.statusReason).toBe("gateway_protocol_incompatible");
  });

  test("rejects an Edge presenting another installation identity", async () => {
    expect(probeGateway(edgeServer({ installationId: "other" }), "install-1"))
      .rejects.toThrow("identité d’installation");
  });

  test("validates a profile with an explicitly cleaned ephemeral session", async () => {
    expect(await testGatewayProfile(edgeServer(), "install-1", "default", "unregistered"))
      .toEqual({ ok: true, profile: "default", cleanup: true });
  });
});
