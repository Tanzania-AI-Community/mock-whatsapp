import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { type EventData, type LocalEvent } from "@/types/events"
import { projectChat, reconcileInbound } from "@/lib/localChat"

const event = (seq: number, data: EventData): LocalEvent => ({
  ...data,
  seq,
  time: 1000 + seq,
})
const incoming = (id: string, seq: number) =>
  event(seq, { kind: "inbound", recipientId: "1", messageId: id, body: "same" })
const outgoing = (body: string, seq: number) =>
  event(seq, {
    kind: "outgoing",
    recipientId: "1",
    messageId: `wamid.out.${seq}`,
    payload: {
      messaging_product: "whatsapp",
      to: "1",
      type: "text",
      text: { body },
    },
  })

describe("local chat projection", () => {
  it("preserves progress, chunks and IDs as separate messages", () => {
    const chat = projectChat([
      incoming("wamid.1", 1),
      outgoing("Working...", 2),
      outgoing("chunk one", 3),
      outgoing("chunk two", 4),
    ])
    assert.deepEqual(
      chat.messages.map(({ content }) => content),
      ["same", "Working...", "chunk one", "chunk two"]
    )
    assert.equal(chat.messages[3]!.id, "wamid.out.4")
  })

  it("reads only the referenced inbound message and expires typing after 25 seconds", () => {
    const events = [
      incoming("wamid.1", 1),
      incoming("wamid.2", 2),
      event(3, {
        kind: "action",
        recipientId: "1",
        payload: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: "wamid.2",
          typing_indicator: { type: "text" },
        },
      }),
    ]
    const chat = projectChat(events)
    assert.equal(chat.messages[0]!.read, undefined)
    assert.equal(chat.messages[1]!.read, true)
    assert.equal(chat.typingUntil, 26003)
    assert.equal(
      projectChat([...events, outgoing("Working...", 4)]).typingUntil,
      0
    )
  })

  it("reconciles identical messages by ID, without losing failed sends", () => {
    const messages = projectChat([
      incoming("wamid.1", 1),
      incoming("wamid.2", 2),
    ]).messages
    assert.deepEqual(
      reconcileInbound(messages, messages.slice(0, 1)).map(({ id }) => id),
      ["wamid.2"]
    )
    const chat = projectChat([
      incoming("wamid.1", 1),
      event(2, {
        kind: "forwarded",
        recipientId: "1",
        messageId: "wamid.1",
        error: "Chatbot unavailable",
      }),
      event(3, {
        kind: "rejected",
        recipientId: "1",
        status: 500,
        error: "Rejected",
      }),
    ])
    assert.equal(chat.messages[0]!.status, "error")
    assert.equal(chat.messages.length, 1)
    assert.deepEqual(
      chat.errors.map(({ error }) => error),
      ["Chatbot unavailable", "Rejected"]
    )
  })
})
