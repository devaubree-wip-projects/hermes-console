import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { isChatToolId } from "@/lib/shared/chat/chat-tool-registry"
import {
  generateDocument,
  slugifyFilename,
} from "@/lib/shared/chat/document-generator"
import { documentStore } from "@/lib/shared/chat/document-store"
import { searchWeb } from "@/lib/shared/chat/web-search"

const documentInputSchema = z.object({
  title: z.string().describe("Document title"),
  markdown: z
    .string()
    .describe("Full document body in markdown (headings, lists, bold)"),
  filename: z
    .string()
    .optional()
    .describe("Optional filename without extension"),
})

async function storeDocument(options: {
  title: string
  format: "pdf" | "docx"
  markdown: string
  filename?: string
}) {
  const buffer = await generateDocument({
    title: options.title,
    format: options.format,
    markdown: options.markdown,
  })
  const id = crypto.randomUUID()
  const extension = options.format
  const name = `${options.filename ?? slugifyFilename(options.title)}.${extension}`
  const mime =
    options.format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

  documentStore.set(id, { buffer, mime, filename: name })

  return {
    documentId: id,
    filename: name,
    format: options.format,
    downloadUrl: `/api/documents/${id}`,
  }
}

/**
 * Portable fetch-based web search, used only for providers without a native AI
 * SDK web search tool (Ollama). OpenAI / Anthropic / Google use their own native
 * tool — see `webSearchTool` in providers.ts. All are keyed `web_search`.
 */
export const customWebSearchTool = tool({
  description:
    "Search the live web for current, real-time, or post-training information (news, prices, docs, events, facts). Returns a list of results with title, URL and snippet. Use whenever the answer may be outdated or the user invokes /search.",
  inputSchema: z.object({
    query: z.string().describe("The search query to run against the web"),
  }),
  execute: async ({ query }) => searchWeb(query),
})

const allTools = {
  generate_pdf: tool({
    description:
      "Generate a downloadable PDF document. Use when the user asks to export, download, or save content as PDF.",
    inputSchema: documentInputSchema,
    execute: async ({ title, markdown, filename }) =>
      storeDocument({ title, markdown, filename, format: "pdf" }),
  }),
  generate_docx: tool({
    description:
      "Generate a downloadable Word (.docx) document. Use when the user asks to export, download, or save content as Word/DOCX.",
    inputSchema: documentInputSchema,
    execute: async ({ title, markdown, filename }) =>
      storeDocument({ title, markdown, filename, format: "docx" }),
  }),
} satisfies ToolSet

export function buildChatTools(enabledTools: string[] | undefined): ToolSet {
  if (!enabledTools?.length) return {}

  const tools: ToolSet = {}
  for (const id of enabledTools) {
    if (!isChatToolId(id)) continue
    // web_search is injected per-provider in the route (native AI SDK tool),
    // not from this registry-mapped set.
    if (!(id in allTools)) continue
    const chatTool = allTools[id as keyof typeof allTools]
    if (chatTool) tools[id] = chatTool
  }
  return tools
}
