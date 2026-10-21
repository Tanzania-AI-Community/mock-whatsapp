import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMessagesFindManyOptions,
  formatDbMessage,
} from "@/lib/messageQuery"

const fakeColumns = {
  is_present_in_conversation: "is_present_in_conversation",
  role: "role",
  user_id: "user_id",
  created_at: "created_at",
}

const fakeOperators = {
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (column: string, value: unknown) => ({ type: "eq", column, value }),
  or: (...args: unknown[]) => ({ type: "or", args }),
  desc: (column: string) => ({ type: "desc", column }),
}

test("buildMessagesFindManyOptions keeps the conversation visibility filters", () => {
  const options = buildMessagesFindManyOptions()

  assert.equal(options.limit, 100)
  assert.deepEqual(options.where(fakeColumns, fakeOperators), {
    type: "and",
    args: [
      {
        type: "eq",
        column: "is_present_in_conversation",
        value: true,
      },
      {
        type: "or",
        args: [
          { type: "eq", column: "role", value: "user" },
          { type: "eq", column: "role", value: "assistant" },
        ],
      },
    ],
  })
  assert.deepEqual(options.orderBy(fakeColumns, fakeOperators), [
    { type: "desc", column: "created_at" },
  ])
})

test("buildMessagesFindManyOptions adds a user_id filter when observing a user", () => {
  const options = buildMessagesFindManyOptions({ limit: 25, userId: 7 })

  assert.equal(options.limit, 25)
  assert.deepEqual(options.where(fakeColumns, fakeOperators), {
    type: "and",
    args: [
      {
        type: "eq",
        column: "is_present_in_conversation",
        value: true,
      },
      {
        type: "or",
        args: [
          { type: "eq", column: "role", value: "user" },
          { type: "eq", column: "role", value: "assistant" },
        ],
      },
      {
        type: "eq",
        column: "user_id",
        value: 7,
      },
    ],
  })
})

test("formatDbMessage preserves the observed user id", () => {
  const createdAt = new Date("2025-01-02T03:04:05.000Z")

  assert.deepEqual(
    formatDbMessage({
      id: 10,
      user_id: 99,
      role: "assistant",
      content: "Hello",
      tool_name: null,
      is_present_in_conversation: true,
      created_at: createdAt,
    }),
    {
      id: 10,
      user_id: 99,
      role: "assistant",
      content: "Hello",
      tool_name: null,
      created_at: createdAt,
      timestamp: Math.floor(createdAt.getTime() / 1000),
      status: "sent",
    }
  )
})
