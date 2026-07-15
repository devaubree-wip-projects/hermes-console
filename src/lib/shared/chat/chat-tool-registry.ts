export const CHAT_TOOLS = [
  {
    id: "search_docs",
    label: "Knowledge Base",
    description: "Search internal documentation (RAG stub phase 1)",
    category: "research",
    defaultEnabled: true,
  },
  {
    id: "delegate_to_agent",
    label: "Delegate to Agent",
    description: "Let the orchestrator delegate sub-tasks to dedicated agents",
    category: "agents",
    defaultEnabled: true,
  },
  {
    id: "web_search",
    label: "Web Search",
    description:
      "Search the live web for current information (works with any LLM)",
    category: "research",
    defaultEnabled: true,
  },
  {
    id: "generate_pdf",
    label: "Generate PDF",
    description: "Create a downloadable PDF from conversation content",
    category: "documents",
    defaultEnabled: true,
  },
  {
    id: "generate_docx",
    label: "Generate Word",
    description: "Create a downloadable .docx document",
    category: "documents",
    defaultEnabled: true,
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "Draft substantive documents in a live side panel",
    category: "documents",
    defaultEnabled: true,
  },
  {
    id: "find_web_images",
    label: "Web Images",
    description: "Find real free-license photos (Wikimedia Commons, Openverse)",
    category: "research",
    defaultEnabled: true,
  },
] as const

export type ChatToolId = (typeof CHAT_TOOLS)[number]["id"]
export type ChatToolDefinition = (typeof CHAT_TOOLS)[number]

export const CHAT_TOOL_IDS = CHAT_TOOLS.map((tool) => tool.id) as ChatToolId[]

export function isChatToolId(value: string): value is ChatToolId {
  return CHAT_TOOL_IDS.includes(value as ChatToolId)
}
