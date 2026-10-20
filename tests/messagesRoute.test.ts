import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

process.env.CHATBOT_CALLBACK_URL = "http://chatbot.test/devhooks"
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test"
const { db } = await import("@/db")
const { GET } = await import("@/app/api/messages/route")

describe("GET /api/messages in observe mode", () => {
  const originalAppMode = process.env.APP_MODE

  beforeEach(() => {
    process.env.APP_MODE = "observe"
  })

  afterEach(() => {
    mock.restoreAll()
    if (originalAppMode === undefined) delete process.env.APP_MODE
    else process.env.APP_MODE = originalAppMode
  })

  it("rejects missing or invalid IDs before querying the database", async () => {
    const query = mock.method(db.query.messages, "findMany", async () => [])
    for (const suffix of [
      "",
      "?userId=0",
      "?userId=abc",
      "?userId=9007199254740992",
    ]) {
      const response = await GET(
        new Request(`http://localhost/api/messages${suffix}`)
      )
      assert.equal(response.status, 400)
      assert.deepEqual((await response.json()).messages, [])
    }
    assert.equal(query.mock.callCount(), 0)
  })

  it("scopes polling to the requested user and visible conversation roles", async () => {
    const query = mock.method(db.query.messages, "findMany", async () => [])
    const response = await GET(
      new Request("http://localhost/api/messages?userId=42")
    )
    assert.equal(response.status, 200)
    assert.equal(query.mock.callCount(), 1)
    const options = query.mock.calls[0]!.arguments[0] as any
    const filters = options.where(
      {
        user_id: "user_id",
        role: "role",
        is_present_in_conversation: "visible",
      },
      {
        and: (...args: unknown[]) => args,
        or: (...args: unknown[]) => args,
        eq: (column: string, value: unknown) => [column, value],
      }
    )
    assert.deepEqual(filters, [
      ["visible", true],
      [
        ["role", "user"],
        ["role", "assistant"],
      ],
      ["user_id", 42],
    ])
  })

  it("preserves unscoped chat polling in chat mode", async () => {
    process.env.APP_MODE = "chat"
    const query = mock.method(db.query.messages, "findMany", async () => [])
    const response = await GET(new Request("http://localhost/api/messages"))
    assert.equal(response.status, 200)
    assert.equal(query.mock.callCount(), 1)
  })
})
