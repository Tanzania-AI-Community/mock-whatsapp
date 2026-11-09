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

  it("renders captionless images and named documents from local media", () => {
    const imageHtml = renderToStaticMarkup(
      <ChatMessage
        message={{
          id: "wamid.img",
          role: "assistant",
          content: "",
          media: { kind: "image", id: "1000000000000001" },
        }}
      />
    )
    assert.match(imageHtml, /<img src="\/api\/media\/1000000000000001"/)
    const documentHtml = renderToStaticMarkup(
      <ChatMessage
        message={{
          id: "wamid.doc",
          role: "assistant",
          content: "",
          media: {
            kind: "document",
            id: "1000000000000002",
            filename: "lesson_plan.pdf",
            serverCopyDeleted: true,
          },
        }}
      />
    )
    assert.match(documentHtml, /lesson_plan\.pdf/)
    assert.match(
      documentHtml,
      /href="\/api\/media\/1000000000000002\?download"/
    )
    assert.match(documentHtml, /Media deleted from server/)
  })

  it("shows reply buttons, disabled without chat actions", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        message={{
          id: "wamid.menu",
          role: "assistant",
          content: "Welcome to the Settings Menu",
          interactive: {
            type: "button",
            body: { text: "Welcome to the Settings Menu" },
            footer: { text: "This is an automatic message 🦒" },
            action: {
              buttons: [
                { type: "reply", reply: { id: "option-0", title: "Profile" } },
                {
                  type: "reply",
                  reply: { id: "option-1", title: "Classes and Subjects" },
                },
              ],
            },
          },
        }}
      />
    )
    assert.match(html, /disabled="">Profile<\/button>/)
    assert.match(html, /Classes and Subjects/)
    assert.match(html, /This is an automatic message/)
  })
})
