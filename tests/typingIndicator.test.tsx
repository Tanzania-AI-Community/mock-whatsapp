import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { ChatContainer } from "@/components/ChatContainer"
import { TypingIndicator } from "@/components/TypingIndicator"

describe("TypingIndicator", () => {
  it("renders three animated dots and no visible text", () => {
    const html = renderToStaticMarkup(<TypingIndicator />)

    assert.equal(html.match(/animate-typing-dot/g)?.length, 3)
    assert.match(html, /motion-safe:animate-typing-dot/)
    assert.equal(html.replace(/<[^>]+>/g, ""), "")
  })

  it("is shown in an empty chat while typing", () => {
    mock.method(console, "log", () => {})

    const typing = renderToStaticMarkup(
      <ChatContainer messages={[]} isTyping />
    )
    const idle = renderToStaticMarkup(<ChatContainer messages={[]} />)

    mock.restoreAll()
    assert.match(typing, /aria-label="Typing"/)
    assert.equal(idle, "")
  })
})
