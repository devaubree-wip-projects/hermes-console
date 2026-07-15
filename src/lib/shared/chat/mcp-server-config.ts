export type McpServerTransport = "http" | "sse"

export type McpServerHeader = {
  id: string
  name: string
  value: string
}

export type McpServerTestResult = {
  status: "success" | "error"
  message: string
  testedAt: string
  toolCount?: number
}

export type McpServerConfig = {
  id: string
  name: string
  transport: McpServerTransport
  url: string
  enabled: boolean
  headers: McpServerHeader[]
  createdAt: string
  updatedAt: string
  lastTest?: McpServerTestResult
}

export type McpServerRequestConfig = Pick<
  McpServerConfig,
  "id" | "name" | "transport" | "url" | "enabled" | "headers"
>

export function toMcpServerRequestConfig(
  server: McpServerConfig,
): McpServerRequestConfig {
  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    url: server.url,
    enabled: server.enabled,
    headers: server.headers,
  }
}
