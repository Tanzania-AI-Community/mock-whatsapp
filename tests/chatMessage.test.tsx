import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { ChatMessage } from "@/components/ChatMessage"

describe("ChatMessage", () => {
  it("keeps fixed light message bubbles readable with dark theme tokens", () => {
    for (const [role, bubbleColor] of [
      ["user", "bg-[#e7ffd9]"],
      ["assistant", "bg-white"],
    ] as const) {
      const html = renderToStaticMarkup(
        <ChatMessage
          message={{
            id: role,
            role,
            content: "Test message",
            status: "sent",
            timestamp: 0,
          }}
        />
      )

      assert.ok(html.includes(`${bubbleColor} text-gray-900`))
      assert.match(html, /text-xs text-gray-500/)
      assert.match(html, /text-gray-500/) // sent check mark
    }
  })

  it("shows a read receipt only when one was received", () => {
    const message = {
      id: "wamid.1",
      role: "user" as const,
      content: "hello",
      status: "sent" as const,
    }
    assert.doesNotMatch(
      renderToStaticMarkup(<ChatMessage message={message} />),
      /aria-label="Read"/
    )
    assert.match(
      renderToStaticMarkup(
        <ChatMessage message={{ ...message, read: true }} />
      ),
      /aria-label="Read"/
    )
  })
})
