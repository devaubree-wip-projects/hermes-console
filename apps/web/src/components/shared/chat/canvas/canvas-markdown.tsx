"use client"

import { memo } from "react"
import { TextMessagePartProvider } from "@assistant-ui/react"
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown"
import remarkGfm from "remark-gfm"

import { markdownComponents } from "@/components/shared/chat/assistant-ui/markdown-text"
import { cn } from "@/lib/utils"

// The model embeds schematic diagrams as fenced ```svg blocks; we inline them
// after stripping anything executable (the content is model-generated).
function sanitizeSvg(code: string): string {
  if (!/^\s*<svg[\s>]/i.test(code)) return ""
  return code
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*"(?!#)[^"]*"/gi, "")
}

function isSvgCodeElement(children: React.ReactNode): boolean {
  if (!children || typeof children !== "object" || Array.isArray(children)) {
    return false
  }
  const el = children as React.ReactElement<{ className?: string }>
  return (
    typeof el.props?.className === "string" &&
    el.props.className.includes("language-svg")
  )
}

const canvasComponents = memoizeMarkdownComponents({
  ...markdownComponents,
  // Render ```svg blocks as bare diagrams: no code frame, no copy header.
  CodeHeader: (props) => {
    if (props.language === "svg") return null
    const BaseHeader = markdownComponents.CodeHeader as React.ElementType
    return <BaseHeader {...props} />
  },
  pre: ({ className, children, ...props }) => {
    if (isSvgCodeElement(children)) return <>{children}</>
    const BasePre = markdownComponents.pre as React.ElementType
    return (
      <BasePre className={className} {...props}>
        {children}
      </BasePre>
    )
  },
  img: ({ className, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cn("my-2 h-auto max-w-full rounded-lg border", className)}
      alt={alt ?? ""}
      loading="lazy"
      {...props}
    />
  ),
  code: function CanvasCode({ className, children, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock()
    const language = /language-([^\s]+)/.exec(className ?? "")?.[1]

    if (isCodeBlock && language === "svg") {
      const svg = sanitizeSvg(String(children))
      if (svg) {
        return (
          <span
            className="block overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )
      }
    }

    const BaseCode = markdownComponents.code as React.ElementType
    return (
      <BaseCode className={className} {...props}>
        {children}
      </BaseCode>
    )
  },
})

type CanvasMarkdownProps = {
  text: string
  isRunning: boolean
}

export const CanvasMarkdown = memo(function CanvasMarkdown({
  text,
  isRunning,
}: CanvasMarkdownProps) {
  return (
    <TextMessagePartProvider text={text} isRunning={isRunning}>
      <MarkdownTextPrimitive
        remarkPlugins={[remarkGfm]}
        className="aui-md text-sm leading-relaxed"
        components={canvasComponents}
      />
    </TextMessagePartProvider>
  )
})
