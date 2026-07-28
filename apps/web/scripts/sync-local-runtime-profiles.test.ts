import { afterEach, describe, expect, test } from "bun:test";
import { discoverLocalRuntime } from "./sync-local-runtime-profiles";

const servers: Array<ReturnType<typeof Bun.serve>> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

function edgeServer(installationId: unknown) {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname !== "/v1/capabilities") {
        return new Response("Not found", { status: 404 });
      }
      return Response.json({
        installationId,
        protocolVersion: 1,
        runtimeKind: "docker",
      });
    },
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

describe("local Docker runtime discovery", () => {
  test("uses the installation identity exposed by the Edge", async () => {
    const runtime = await discoverLocalRuntime({
      gatewayUrl: edgeServer("docker-installation-a"),
    });

    expect(runtime.installationKey).toBe("docker-installation-a");
    expect(runtime.capabilities.runtimeKind).toBe("docker");
  });

  test("rejects an Edge without a valid installation identity", async () => {
    await expect(discoverLocalRuntime({
      gatewayUrl: edgeServer("invalid installation"),
    })).rejects.toThrow("identité d’installation valide");
  });
});
