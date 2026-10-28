import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { type Message } from "@/types/chat"
import { sortMessages } from "@/lib/messageUtils"

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

  it("orders local events by acceptance order", () => {
    const sorted = sortMessages([
      {
        id: "b",
        role: "assistant",
        content: "Second",
        timestamp: 1,
        eventSeq: 2,
      },
      {
        id: "a",
        role: "assistant",
        content: "First",
        timestamp: 2,
        eventSeq: 1,
      },
    ])

    assert.deepEqual(
      sorted.map(({ id }) => id),
      ["a", "b"]
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
