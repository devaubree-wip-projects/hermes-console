import { createMCPClient, type MCPClient } from "@ai-sdk/mcp"
import type { ToolSet } from "ai"
import type {
  McpServerHeader,
  McpServerRequestConfig,
  McpServerTransport,
} from "@/lib/shared/chat/mcp-server-config"

type ResolvedMcpTools = {
  tools: ToolSet
  warnings: string[]
  close: () => Promise<void>
}

type ListedMcpTool = {
  name: string
  description?: string
}

export type McpServerProbeResult = {
  serverName: string
  toolCount: number
  tools: ListedMcpTool[]
}

const MCP_REQUEST_TIMEOUT_MS = 10_000

function isTransport(value: unknown): value is McpServerTransport {
  return value === "http" || value === "sse"
}

function normalizeHeaders(headers: McpServerHeader[] | undefined) {
  const normalized: Record<string, string> = {}

  for (const header of headers ?? []) {
    const name = header.name.trim()
    const value = header.value.trim()
    if (!name || !value) continue
    normalized[name] = value
  }

  return Object.keys(normalized).length ? normalized : undefined
}

function validateMcpServer(server: McpServerRequestConfig) {
  const name = server.name.trim()
  if (!name) throw new Error("MCP server name is required.")
  if (!isTransport(server.transport)) {
    throw new Error("MCP server transport must be HTTP or SSE.")
  }

  let url: URL
  try {
    url = new URL(server.url)
  } catch {
    throw new Error("MCP server URL is invalid.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP server URL must use http or https.")
  }

  return {
    id: server.id,
    name,
    transport: server.transport,
    url: url.toString(),
    headers: normalizeHeaders(server.headers),
  }
}

async function openMcpClient(server: McpServerRequestConfig) {
  const valid = validateMcpServer(server)

  const client = await createMCPClient({
    transport: {
      type: valid.transport,
      url: valid.url,
      ...(valid.headers ? { headers: valid.headers } : undefined),
    },
    clientName: "v1-xulux",
  })

  return { client, server: valid }
}

function toolNamespace(server: { id: string; name: string }, used: Set<string>) {
  const base =
    server.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "mcp"

  if (!used.has(base)) {
    used.add(base)
    return base
  }

  const suffix = server.id.replace(/[^a-z0-9]+/gi, "").slice(0, 6)
  const namespaced = `${base}_${suffix || used.size + 1}`
  used.add(namespaced)
  return namespaced
}

function prefixMcpTools({
  server,
  tools,
  namespaces,
}: {
  server: { id: string; name: string }
  tools: ToolSet
  namespaces: Set<string>
}) {
  const namespace = toolNamespace(server, namespaces)
  const prefixed: ToolSet = {}

  for (const [toolName, tool] of Object.entries(tools)) {
    const nextName = `${namespace}__${toolName}`
    const description =
      "description" in tool && typeof tool.description === "string"
        ? `[${server.name}] ${tool.description}`
        : `MCP tool from ${server.name}: ${toolName}`

    prefixed[nextName] = {
      ...tool,
      description,
    }
  }

  return prefixed
}

export async function probeMcpServer(
  server: McpServerRequestConfig,
): Promise<McpServerProbeResult> {
  const { client, server: valid } = await openMcpClient(server)

  try {
    const definitions = await client.listTools({
      options: { timeout: MCP_REQUEST_TIMEOUT_MS },
    })

    return {
      serverName: valid.name,
      toolCount: definitions.tools.length,
      tools: definitions.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    }
  } finally {
    await client.close()
  }
}

export async function resolveMcpTools(
  servers: McpServerRequestConfig[] | undefined,
): Promise<ResolvedMcpTools> {
  const enabledServers = (servers ?? []).filter((server) => server.enabled)
  const clients: MCPClient[] = []
  const warnings: string[] = []
  const tools: ToolSet = {}
  const namespaces = new Set<string>()

  for (const server of enabledServers) {
    let client: MCPClient | undefined

    try {
      const opened = await openMcpClient(server)
      client = opened.client
      clients.push(client)

      const definitions = await client.listTools({
        options: { timeout: MCP_REQUEST_TIMEOUT_MS },
      })
      const serverTools = client.toolsFromDefinitions(definitions)
      Object.assign(
        tools,
        prefixMcpTools({
          server: opened.server,
          tools: serverTools,
          namespaces,
        }),
      )
    } catch (error) {
      if (client) {
        await client.close().catch(() => undefined)
      }
      warnings.push(
        `${server.name || server.url}: ${
          error instanceof Error ? error.message : "MCP connection failed."
        }`,
      )
    }
  }

  return {
    tools,
    warnings,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()))
    },
  }
}
