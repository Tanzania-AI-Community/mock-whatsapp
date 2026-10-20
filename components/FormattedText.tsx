import { Fragment, type ReactNode } from "react"

import {
  parseWhatsAppText,
  type Block,
  type InlineNode,
} from "@/lib/whatsappFormat"

const INDENT_REM_PER_SPACE = 0.5

function renderInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (typeof node === "string") {
      return <Fragment key={index}>{node}</Fragment>
    }

    const children = renderInline(node.children)
    switch (node.style) {
      case "bold":
        return <strong key={index}>{children}</strong>
      case "italic":
        return <em key={index}>{children}</em>
      case "strikethrough":
        return <s key={index}>{children}</s>
      case "code":
        return (
          <code key={index} className="font-mono text-[0.9em]">
            {children}
          </code>
        )
    }
  })
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "blank":
      return <div key={index} className="h-3" />
    case "paragraph":
      return <div key={index}>{renderInline(block.content)}</div>
    case "bulleted":
    case "numbered":
      return (
        <div
          key={index}
          className="flex gap-2"
          style={{ paddingLeft: `${block.indent * INDENT_REM_PER_SPACE}rem` }}
        >
          <span className="shrink-0">
            {block.type === "bulleted" ? "•" : block.marker}
          </span>
          <span className="min-w-0">{renderInline(block.content)}</span>
        </div>
      )
  }
}

// Renders React elements only, so message text is always escaped
export function FormattedText({ text }: { text: string }) {
  return <>{parseWhatsAppText(text).map(renderBlock)}</>
}
