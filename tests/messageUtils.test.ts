import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { type Message } from "@/types/chat"
import {
  excludeClearedMessages,
  getLastMessageId,
  reconcileTempMessages,
  sortMessages,
} from "@/lib/messageUtils"

const message = (id: Message["id"], content = `message ${id}`): Message => ({
  id,
  role: "user",
  content,
})

describe("getLastMessageId", () => {
  it("returns the highest database id", () => {
    assert.equal(getLastMessageId([message(3), message(12), message(7)]), 12)
  })

  it("ignores temporary messages", () => {
    assert.equal(getLastMessageId([message(4), message("temp-abc")]), 4)
    assert.equal(getLastMessageId([message("temp-abc")]), null)
  })

  it("returns null without messages", () => {
    assert.equal(getLastMessageId([]), null)
  })
})

describe("excludeClearedMessages", () => {
  it("keeps every message when the chat was never cleared", () => {
    const messages = [message(1), message(2)]
    assert.deepEqual(excludeClearedMessages(messages, null), messages)
  })

  it("hides messages up to the cleared id when the next poll returns them", () => {
    const polled = [message(1), message(2), message(3), message(4)]
    assert.deepEqual(
      excludeClearedMessages(polled, 2).map(({ id }) => id),
      [3, 4]
    )
  })

  it("keeps temporary messages sent after clearing", () => {
    const polled = [message(1), message("temp-abc")]
    assert.deepEqual(
      excludeClearedMessages(polled, 1).map(({ id }) => id),
      ["temp-abc"]
    )
  })
})

describe("reconcileTempMessages", () => {
  const temp = (
    key: string,
    content: string,
    sentAfterId: number
  ): Message => ({
    id: `temp-${key}`,
    role: "user",
    content,
    isTemp: true,
    status: "sending",
    sentAfterId,
  })
  const saved = (id: number, content: string, role: Message["role"] = "user") =>
    ({ id, role, content }) satisfies Message

  it("removes a temporary message once its saved copy arrives", () => {
    const pending = [temp("a", "What is weathering?", 10)]
    const polled = [saved(9, "hi"), saved(11, "What is weathering?")]

    assert.deepEqual(reconcileTempMessages(pending, polled), [])
  })

  it("keeps a temporary message while no saved copy exists", () => {
    const pending = [temp("a", "What is weathering?", 10)]

    assert.equal(reconcileTempMessages(pending, [saved(9, "hi")]), pending)
    assert.equal(reconcileTempMessages(pending, []), pending)
  })

  it("is not removed by unrelated saved messages", () => {
    const pending = [temp("a", "What is weathering?", 10)]
    const polled = [
      saved(8, "What is weathering?"), // saved before it was sent
      saved(11, "What is erosion?"),
      saved(12, "What is weathering?", "assistant"),
      saved(13, "What is weathering? Explain."),
    ]

    assert.deepEqual(reconcileTempMessages(pending, polled), pending)
  })

  it("replaces identical messages sent quickly one for one", () => {
    const pending = [temp("a", "hi", 10), temp("b", "hi", 10)]

    const afterFirstCopy = reconcileTempMessages(pending, [saved(11, "hi")])
    assert.deepEqual(
      afterFirstCopy.map(({ id }) => id),
      ["temp-b"]
    )

    // The next poll returns the already claimed copy again
    const nextPoll = reconcileTempMessages(afterFirstCopy, [saved(11, "hi")])
    assert.deepEqual(
      nextPoll.map(({ id }) => id),
      ["temp-b"]
    )

    assert.deepEqual(
      reconcileTempMessages(nextPoll, [saved(11, "hi"), saved(12, "hi")]),
      []
    )
  })

  it("replaces both identical messages when both copies arrive together", () => {
    const pending = [temp("a", "hi", 10), temp("b", "hi", 10)]
    const polled = [saved(11, "hi"), saved(12, "hi")]

    assert.deepEqual(reconcileTempMessages(pending, polled), [])
  })

  it("does not match a failed send", () => {
    const pending = [{ ...temp("a", "hi", 10), status: "error" as const }]

    assert.deepEqual(reconcileTempMessages(pending, [saved(11, "hi")]), pending)
  })
})

describe("sortMessages", () => {
  it("orders messages saved in the same second by id", () => {
    // As returned by the API: newest first
    const polled: Message[] = [
      { id: 42, role: "assistant", content: "Reply", timestamp: 1000 },
      { id: 41, role: "user", content: "Second", timestamp: 1000 },
      { id: 40, role: "user", content: "First", timestamp: 1000 },
    ]

    assert.deepEqual(
      sortMessages(polled).map(({ id }) => id),
      [40, 41, 42]
    )
  })

  it("keeps temporary messages last", () => {
    const sorted = sortMessages([
      { id: "temp-a", role: "user", content: "Sending", isTemp: true },
      { id: 7, role: "assistant", content: "Reply", timestamp: 2000 },
    ])

    assert.deepEqual(
      sorted.map(({ id }) => id),
      [7, "temp-a"]
    )
  })
})
