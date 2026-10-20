type InlineStyle = "bold" | "italic" | "strikethrough" | "code"

export type InlineNode = string | { style: InlineStyle; children: InlineNode[] }

export type Block =
  | { type: "paragraph"; content: InlineNode[] }
  | { type: "bulleted"; indent: number; content: InlineNode[] }
  | { type: "numbered"; indent: number; marker: string; content: InlineNode[] }
  | { type: "blank" }

const STYLE_BY_MARKER: Record<string, InlineStyle> = {
  "*": "bold",
  _: "italic",
  "~": "strikethrough",
  "`": "code",
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u
const WHITESPACE = /\s/

const isWordCharacter = (char: string | undefined) =>
  char !== undefined && WORD_CHARACTER.test(char)
const isWhitespace = (char: string | undefined) =>
  char !== undefined && WHITESPACE.test(char)

// As in WhatsApp, a span must hug its text and sit at word boundaries, so `2*3*4`
// and `snake_case_name` stay plain text
function findClosingMarker(
  text: string,
  marker: string,
  start: number
): number {
  const contentStart = start + marker.length
  if (contentStart >= text.length || isWhitespace(text[contentStart])) {
    return -1
  }

  let index = text.indexOf(marker, contentStart + 1)
  while (index !== -1) {
    if (
      !isWhitespace(text[index - 1]) &&
      !isWordCharacter(text[index + marker.length])
    ) {
      return index
    }
    index = text.indexOf(marker, index + 1)
  }
  return -1
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let plain = ""
  let index = 0

  while (index < text.length) {
    const marker = text.startsWith("```", index) ? "```" : text[index]!
    const style = STYLE_BY_MARKER[marker[0]!]
    const opensSpan = style !== undefined && !isWordCharacter(text[index - 1])
    const closing = opensSpan ? findClosingMarker(text, marker, index) : -1

    if (closing === -1) {
      plain += text[index]
      index += 1
      continue
    }

    if (plain) nodes.push(plain)
    plain = ""

    const inner = text.slice(index + marker.length, closing)
    nodes.push({
      style: style!,
      children: style === "code" ? [inner] : parseInline(inner),
    })
    index = closing + marker.length
  }

  if (plain) nodes.push(plain)
  return nodes
}

export function parseWhatsAppText(text: string): Block[] {
  return text.split(/\r?\n/).map((line): Block => {
    if (line.trim() === "") return { type: "blank" }

    const bulleted = /^(\s*)[-*•]\s+(.*)$/.exec(line)
    if (bulleted) {
      return {
        type: "bulleted",
        indent: bulleted[1]!.length,
        content: parseInline(bulleted[2]!),
      }
    }

    const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line)
    if (numbered) {
      return {
        type: "numbered",
        indent: numbered[1]!.length,
        marker: numbered[2]!,
        content: parseInline(numbered[3]!),
      }
    }

    return { type: "paragraph", content: parseInline(line) }
  })
}
