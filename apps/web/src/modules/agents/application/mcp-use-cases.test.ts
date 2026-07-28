import { describe, expect, test } from "bun:test";
import type { AgentContextParams, AgentRuntimeContext } from "../domain/agent-context";
import type { McpRuntimePort, McpServerSummary } from "./mcp-ports";
import { createMcpUseCases } from "./mcp-use-cases";

const PARAMS: AgentContextParams = { tenantSlug: "acme", agentSlug: "ada" };
const OWNER: AgentRuntimeContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  role: "owner",
  agent: { id: "agent-1", name: "Ada", slug: "ada", hermesProfileName: "ada" },
};
const SECRET = "https://ghost:s3cr3t@search.example.com";

function createFakes(
  options: { servers?: McpServerSummary[]; test?: unknown; fail?: Error; needsInstall?: boolean } = {},
) {
  const events: { action: string; metadata: Record<string, unknown> }[] = [];
  const credentials: { key: string; value: string }[] = [];
  const added: Array<Record<string, unknown>> = [];
  const restarts: string[] = [];
  const runtime: McpRuntimePort = {
    async list() {
      if (options.fail) throw options.fail;
      return { servers: options.servers ?? [] };
    },
    async add(_agentId, _profile, input) {
      if (options.fail) throw options.fail;
      added.push(input as unknown as Record<string, unknown>);
      return {};
    },
    async remove() {
      return {};
    },
    async test() {
      return (options.test ?? { ok: true, tools: [{ name: "web_search" }] }) as never;
    },
    async setEnabled() {
      return {};
    },
    async catalog() {
      return { entries: [{ name: "n8n", needs_install: options.needsInstall ?? false }] };
    },
    async installFromCatalog() {
      return {};
    },
    async setCredential(_agentId, _profile, key, value) {
      credentials.push({ key, value });
    },
    async lifecycle(_agentId, _profile, action) {
      restarts.push(action);
      return {};
    },
    classifyError(error) {
      const message = error instanceof Error ? error.message : "Runtime indisponible.";
      return { message, status: 502, safeMessage: message };
    },
  };
  const useCases = createMcpUseCases({
    contexts: { async resolve() { return OWNER; } },
    runtime,
    audit: { async record(input) { events.push({ action: input.action, metadata: input.metadata }); } },
  });
  return { useCases, events, credentials, added, restarts };
}

describe("MCP use-cases", () => {
  test("un secret part dans le .env du profil et seule une référence atteint la config", async () => {
    const { useCases, credentials, added, events } = createFakes();
    const response = await useCases.command(PARAMS, {
      action: "add",
      name: "ghostsearch",
      command: "/opt/data/profiles/ada/bin/ghostsearch",
      env: [{ key: "GHOSTSEARCH_SEARXNG_URL", value: SECRET }],
    });

    expect(response.status).toBe(200);
    expect(credentials).toEqual([{ key: "GHOSTSEARCH_SEARXNG_URL", value: SECRET }]);
    expect(added[0].env).toEqual({ GHOSTSEARCH_SEARXNG_URL: "${GHOSTSEARCH_SEARXNG_URL}" });
    // Le secret ne doit apparaître nulle part dans la piste d'audit.
    expect(JSON.stringify(events)).not.toContain("s3cr3t");
  });

  test("une valeur vide référence le secret déjà posé sans le réécrire", async () => {
    const { useCases, credentials, added } = createFakes();
    await useCases.command(PARAMS, {
      action: "add",
      name: "ghostsearch",
      command: "ghostsearch",
      env: [{ key: "GHOSTSEARCH_SEARXNG_URL", value: "" }],
    });
    expect(credentials).toEqual([]);
    expect(added[0].env).toEqual({ GHOSTSEARCH_SEARXNG_URL: "${GHOSTSEARCH_SEARXNG_URL}" });
  });

  test("un rôle non-owner ne peut rien écrire", async () => {
    const { useCases, added } = createFakes();
    const viewer = createMcpUseCases({
      contexts: { async resolve() { return { ...OWNER, role: "viewer" as const }; } },
      runtime: { ...({} as McpRuntimePort) },
      audit: { async record() {} },
    });
    const response = await viewer.command(PARAMS, { action: "add", name: "x", url: "https://example.com/mcp" });
    expect(response.status).toBe(403);
    expect(added).toEqual([]);
    void useCases;
  });

  test("aucun redémarrage sans demande explicite, et l'appelant est prévenu", async () => {
    const { useCases, restarts } = createFakes();
    const response = await useCases.command(PARAMS, {
      action: "add",
      name: "linear",
      url: "https://mcp.linear.app/mcp",
    });
    expect(restarts).toEqual([]);
    expect((response.body as { needsRestart: boolean }).needsRestart).toBe(true);
  });

  test("une commande absente du runtime devient un message actionnable", async () => {
    const { useCases, events } = createFakes({ fail: new Error("FileNotFoundError: 'ghostsearch'") });
    const response = await useCases.command(PARAMS, {
      action: "add",
      name: "ghostsearch",
      command: "ghostsearch",
    });
    const body = response.body as { failure: { code: string }; error: string };
    expect(body.failure.code).toBe("command_not_found");
    expect(body.error).toContain("ghostsearch");
    expect(events.at(-1)?.action).toBe("agent.mcp.failed");
  });

  test("un serveur ne peut pas être à la fois distant et local", async () => {
    const { useCases } = createFakes();
    const response = await useCases.command(PARAMS, {
      action: "add",
      name: "x",
      url: "https://example.com/mcp",
      command: "npx",
    });
    expect(response.status).toBe(400);
  });

  test("une variable qui détournerait le runtime est refusée", async () => {
    const { useCases, credentials, added } = createFakes()
    for (const key of ["HTTPS_PROXY", "PATH", "NPM_CONFIG_REGISTRY", "HERMES_HOME", "LD_PRELOAD"]) {
      const response = await useCases.command(PARAMS, {
        action: "add",
        name: "piege",
        command: "npx",
        env: [{ key, value: "http://attaquant.example" }],
      });
      expect(response.status).toBe(400);
    }
    // Aucun secret posé, aucun serveur créé : le refus est en amont du runtime.
    expect(credentials).toEqual([]);
    expect(added).toEqual([]);
  });

  test("une URL non http est refusée avant d'atteindre le runtime", async () => {
    const { useCases, added } = createFakes();
    const response = await useCases.command(PARAMS, { action: "add", name: "x", url: "file:///etc/passwd" });
    expect(response.status).toBe(400);
    expect(added).toEqual([]);
  });

  test("une entrée de catalogue à compiler est refusée, pas installée", async () => {
    const { useCases } = createFakes({ needsInstall: true });
    const response = await useCases.command(PARAMS, { action: "install_catalog", name: "n8n" });
    expect(response.status).toBe(409);
    expect((response.body as { error: string }).error).toContain("compilée");
  });

  test("une entrée de catalogue inconnue ne déclenche aucune installation", async () => {
    const { useCases } = createFakes();
    const response = await useCases.command(PARAMS, { action: "install_catalog", name: "inexistante" });
    expect(response.status).toBe(404);
  });

  test("le catalogue indisponible n'empêche pas de lister les serveurs installés", async () => {
    const { useCases } = createFakes({ servers: [{ name: "ghostsearch", transport: "stdio" }] });
    const response = await useCases.get(PARAMS);
    const body = response.body as { servers: McpServerSummary[]; catalogAvailable: boolean };
    expect(body.servers).toHaveLength(1);
    expect(body.catalogAvailable).toBe(true);
  });
});
