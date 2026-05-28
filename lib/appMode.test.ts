import assert from "node:assert/strict"
import test from "node:test"

import { getAppMode, parseObservedUserId } from "@/lib/appMode"

test("getAppMode defaults to chat", () => {
  assert.equal(getAppMode(undefined), "chat")
})

test("getAppMode returns observe when configured", () => {
  assert.equal(getAppMode("observe"), "observe")
})

test("parseObservedUserId accepts positive integer strings", () => {
  assert.deepEqual(parseObservedUserId("42"), { userId: 42 })
})

test("parseObservedUserId ignores empty values", () => {
  assert.deepEqual(parseObservedUserId(undefined), { userId: null })
  assert.deepEqual(parseObservedUserId(""), { userId: null })
})

test("parseObservedUserId rejects non-numeric values", () => {
  assert.deepEqual(parseObservedUserId("abc"), {
    userId: null,
    error: "Enter a positive numeric user ID.",
  })
})

test("parseObservedUserId rejects non-positive values", () => {
  assert.deepEqual(parseObservedUserId("0"), {
    userId: null,
    error: "Enter a positive numeric user ID.",
  })
})
