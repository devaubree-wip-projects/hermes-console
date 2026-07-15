import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import {
  parseMarkdownBlocks,
  stripInlineMarkdown,
  type MarkdownBlock,
} from "@/lib/shared/chat/markdown-blocks"

export type DocumentFormat = "pdf" | "docx"

const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
  },
  title: {
    fontSize: 22,
    marginBottom: 20,
    fontFamily: "Helvetica-Bold",
  },
  h1: {
    fontSize: 20,
    marginTop: 14,
    marginBottom: 8,
    fontFamily: "Helvetica-Bold",
  },
  h2: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
  },
  h3: {
    fontSize: 14,
    marginTop: 10,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  paragraph: {
    marginBottom: 8,
  },
  list: {
    marginBottom: 8,
    paddingLeft: 12,
  },
  listItem: {
    marginBottom: 4,
  },
})

export function slugifyFilename(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "document"
}

function docxHeadingLevel(level: 1 | 2 | 3) {
  if (level === 1) return HeadingLevel.HEADING_1
  if (level === 2) return HeadingLevel.HEADING_2
  return HeadingLevel.HEADING_3
}

function docxParagraphFromBlock(block: MarkdownBlock): Paragraph {
  if (block.type === "heading") {
    return new Paragraph({
      text: stripInlineMarkdown(block.text),
      heading: docxHeadingLevel(block.level),
    })
  }

  if (block.type === "list") {
    return new Paragraph({
      children: block.items.flatMap((item, index) => [
        new TextRun({
          text: `${index === 0 ? "• " : "\n• "}${stripInlineMarkdown(item)}`,
        }),
      ]),
    })
  }

  return new Paragraph({
    children: [new TextRun({ text: stripInlineMarkdown(block.text) })],
  })
}

function PdfBlock({ block }: { block: MarkdownBlock }) {
  if (block.type === "heading") {
    const style =
      block.level === 1
        ? pdfStyles.h1
        : block.level === 2
          ? pdfStyles.h2
          : pdfStyles.h3
    return <Text style={style}>{stripInlineMarkdown(block.text)}</Text>
  }

  if (block.type === "list") {
    return (
      <View style={pdfStyles.list}>
        {block.items.map((item, index) => (
          <Text key={index} style={pdfStyles.listItem}>
            • {stripInlineMarkdown(item)}
          </Text>
        ))}
      </View>
    )
  }

  return (
    <Text style={pdfStyles.paragraph}>{stripInlineMarkdown(block.text)}</Text>
  )
}

function MarkdownPdfDocument({
  title,
  blocks,
}: {
  title: string
  blocks: MarkdownBlock[]
}) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>{title}</Text>
        {blocks.map((block, index) => (
          <PdfBlock key={index} block={block} />
        ))}
      </Page>
    </Document>
  )
}

export async function generateDocument(options: {
  title: string
  format: DocumentFormat
  markdown: string
}): Promise<Buffer> {
  const blocks = parseMarkdownBlocks(options.markdown)

  if (options.format === "docx") {
    const children = [
      new Paragraph({
        text: options.title,
        heading: HeadingLevel.TITLE,
      }),
      ...blocks.map(docxParagraphFromBlock),
    ]

    const document = new DocxDocument({
      sections: [{ children }],
    })

    return Packer.toBuffer(document)
  }

  return renderToBuffer(
    <MarkdownPdfDocument title={options.title} blocks={blocks} />,
  )
}
