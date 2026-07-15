"use client"

import { makeAssistantToolUI } from "@assistant-ui/react"
import { DownloadIcon, FileTextIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

type DocumentToolResult = {
  documentId?: string
  filename?: string
  format?: string
  downloadUrl?: string
}

function DocumentGenerating({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      <span>Generating {label}…</span>
    </div>
  )
}

function DocumentDownloadCard({
  result,
  label,
}: {
  result: DocumentToolResult
  label: string
}) {
  if (!result.downloadUrl || !result.filename) return null

  return (
    <a
      href={result.downloadUrl}
      download={result.filename}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted",
      )}
    >
      <FileTextIcon className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label} ready</div>
        <div className="truncate text-xs text-muted-foreground">
          {result.filename}
        </div>
      </div>
      <DownloadIcon className="size-4 shrink-0" />
    </a>
  )
}

function createDocumentToolUI(toolName: "generate_pdf" | "generate_docx", label: string) {
  return makeAssistantToolUI<DocumentToolResult, DocumentToolResult>({
    toolName,
    render: ({ result, status }) => {
      if (status.type === "running") {
        return <DocumentGenerating label={label} />
      }

      if (!result) return null

      return <DocumentDownloadCard result={result} label={label} />
    },
  })
}

export const GeneratePdfToolUI = createDocumentToolUI("generate_pdf", "PDF")
export const GenerateDocxToolUI = createDocumentToolUI("generate_docx", "Word document")
