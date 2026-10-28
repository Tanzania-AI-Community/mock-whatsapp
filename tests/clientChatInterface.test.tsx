import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import ClientChatInterface from "@/components/ClientChatInterface"

describe("ClientChatInterface", () => {
  it("shows loading while the initial client fetch is pending for an empty chat", () => {
    const html = renderToStaticMarkup(
      <ClientChatInterface initialMessages={[]} />
    )

    assert.match(html, /Loading messages\.\.\./)
    assert.doesNotMatch(html, /No messages yet/)
  })

  it("keeps observe mode read-only", () => {
    const html = renderToStaticMarkup(
      <ClientChatInterface
        initialMessages={[]}
        mode="observe"
        observedUserId={42}
      />
    )

    assert.match(html, /Observe mode is read-only/)
    assert.doesNotMatch(html, /Type a message/)
  })
})
