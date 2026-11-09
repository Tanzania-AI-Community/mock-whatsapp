import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { ChatInput } from "@/components/ChatInput"

describe("ChatInput", () => {
  it("offers voice recording while the message is empty", () => {
    const html = renderToStaticMarkup(
      <ChatInput onSendMessage={() => {}} onSendFile={() => {}} />
    )
    assert.match(html, /aria-label="Record a voice message"/)
    assert.doesNotMatch(html, /type="submit"/)
  })

  it("keeps the send button when attachments are unavailable", () => {
    const html = renderToStaticMarkup(<ChatInput onSendMessage={() => {}} />)
    assert.doesNotMatch(html, /Record a voice message/)
    assert.match(html, /type="submit"/)
  })
})
