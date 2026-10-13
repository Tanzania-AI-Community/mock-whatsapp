import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildTextMessageWebhook,
  DEFAULT_RECIPIENT_ID,
} from "@/lib/metaWebhook"

describe("buildTextMessageWebhook", () => {
  it("builds a WhatsApp text message webhook", () => {
    const payload = buildTextMessageWebhook({ body: "Hello Twiga" })

    assert.equal(payload.object, "whatsapp_business_account")
    const change = payload.entry[0].changes[0]
    assert.equal(change.field, "messages")
    assert.equal(change.value.messaging_product, "whatsapp")
    assert.equal(change.value.contacts[0].wa_id, DEFAULT_RECIPIENT_ID)

    const message = change.value.messages[0]
    assert.equal(message.type, "text")
    assert.equal(message.text.body, "Hello Twiga")
    assert.equal(message.from, DEFAULT_RECIPIENT_ID)
  })

  it("addresses the message from the given recipient", () => {
    const payload = buildTextMessageWebhook({
      body: "Hi",
      recipientId: "255700000001",
    })

    const value = payload.entry[0].changes[0].value
    assert.equal(value.contacts[0].wa_id, "255700000001")
    assert.equal(value.messages[0].from, "255700000001")
  })

  it("timestamps the message in seconds", () => {
    const before = Math.floor(Date.now() / 1000)
    const payload = buildTextMessageWebhook({ body: "Hi" })
    const after = Math.floor(Date.now() / 1000)

    const { timestamp } = payload.entry[0].changes[0].value.messages[0]
    assert.ok(timestamp >= before && timestamp <= after)
  })

  it("gives messages built back to back distinct ids", () => {
    const first = buildTextMessageWebhook({ body: "one" })
    const second = buildTextMessageWebhook({ body: "two" })

    const firstId = first.entry[0].changes[0].value.messages[0].id
    const secondId = second.entry[0].changes[0].value.messages[0].id
    assert.match(firstId, /^wamid\./)
    assert.notEqual(firstId, secondId)
  })
})
