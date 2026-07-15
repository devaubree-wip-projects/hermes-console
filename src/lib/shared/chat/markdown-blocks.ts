export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split("\n")
  const blocks: MarkdownBlock[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    blocks.push({ type: "list", items: listItems })
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const h3 = trimmed.match(/^###\s+(.+)$/)
    if (h3) {
      flushList()
      blocks.push({ type: "heading", level: 3, text: h3[1] })
      continue
    }

    const h2 = trimmed.match(/^##\s+(.+)$/)
    if (h2) {
      flushList()
      blocks.push({ type: "heading", level: 2, text: h2[1] })
      continue
    }

    const h1 = trimmed.match(/^#\s+(.+)$/)
    if (h1) {
      flushList()
      blocks.push({ type: "heading", level: 1, text: h1[1] })
      continue
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      listItems.push(listItem[1])
      continue
    }

    flushList()
    blocks.push({ type: "paragraph", text: trimmed })
  }

  flushList()
  return blocks
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
}
