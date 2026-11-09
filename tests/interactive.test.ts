import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

import { projectChat } from "@/lib/localChat"
import { readEvents } from "@/lib/localEvents"
import { setFault } from "@/lib/mockTransport"
import { POST as send } from "@/app/api/whatsapp/messages/route"

process.env.CHATBOT_CALLBACK_URL = "http://127.0.0.1:8000/devhooks"
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test"
const { POST: inbound } = await import("@/app/api/inbound/route")

const recipientId = "255712345678"

// Twiga's generate_payload output for the settings command
const settingsMenu = (titles = ["Profile", "Classes and Subjects"]) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipientId,
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: "Welcome to the Settings Menu" },
    footer: { text: "This is an automatic message 🦒" },
    action: {
      buttons: titles.map((title, i) => ({
        type: "reply",
        reply: { id: `option-${i}`, title },
      })),
    },
  },
})

const listMenu = (count = 4) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipientId,
  type: "interactive",
  interactive: {
    type: "list",
    body: { text: "Choose" },
    footer: { text: "This is an automated message 🦒" },
    action: {
      button: "Options",
      sections: [
        {
          title: "Options",
          rows: Array.from({ length: count }, (_, i) => ({
            id: `option-${i}`,
            title: `Choice ${i}`,
          })),
        },
      ],
    },
  },
})

const sendRequest = (payload: unknown) =>
  new Request("http://localhost/api/whatsapp/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

const inboundRequest = (body: unknown) =>
  new Request("http://localhost/api/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  })

async function sentMessageId(payload: unknown) {
  const response = await send(sendRequest(payload))
  assert.equal(response.status, 200)
  return (await response.json()).messages[0].id as string
}

describe("interactive messages", () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mock-interactive-"))
    process.env.MOCK_WHATSAPP_DATA_DIR = directory
    process.env.MOCK_WHATSAPP_TOKEN = "test-token"
    process.env.APP_MODE = "chat"
    setFault(null)
  })
  afterEach(async () => {
    mock.restoreAll()
    await rm(directory, { recursive: true, force: true })
  })

  it("accepts Twiga list rows with null optional descriptions", async () => {
    const payload = listMenu(2)
    const rows = payload.interactive.action.sections[0]!.rows.map((row) => ({
      ...row,
      description: null,
    }))
    const messageId = await sentMessageId({
      ...payload,
      interactive: {
        ...payload.interactive,
        action: {
          ...payload.interactive.action,
          sections: [{ title: "Options", rows }],
        },
      },
    })
    mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
    const response = await inbound(
      inboundRequest({
        recipientId,
        contextId: messageId,
        reply: { type: "list_reply", id: "option-0" },
      })
    )
    assert.equal(response.status, 200)
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.at(-1)!.content, "Choice 0")
  })

  it("accepts Twiga's settings buttons and lists", async () => {
    await sentMessageId(settingsMenu())
    await sentMessageId(listMenu())
    const messages = projectChat(await readEvents()).messages
    assert.equal(messages[0]!.interactive?.type, "button")
    assert.equal(messages[0]!.content, "Welcome to the Settings Menu")
    assert.equal(messages[1]!.interactive?.type, "list")
  })

  it("rejects payloads that break Meta's limits", async () => {
    const tooLongBody = settingsMenu()
    tooLongBody.interactive.body.text = "x".repeat(1025)
    const cases = [
      settingsMenu(["Classes and Subjects!"]),
      settingsMenu(["a", "b", "c", "d"]),
      settingsMenu(["Same", "Same"]),
      settingsMenu([]),
      tooLongBody,
      listMenu(11),
      {
        ...listMenu(),
        interactive: { ...listMenu().interactive, type: "carousel" },
      },
    ]
    for (const payload of cases) {
      const response = await send(sendRequest(payload))
      assert.equal(response.status, 400)
      const { error } = await response.json()
      assert.equal(error.type, "OAuthException")
      assert.ok(error.error_data.details)
    }
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.length, 0)
    assert.equal(chat.errors.length, cases.length)
  })

  it("forwards a tapped button as a button_reply webhook", async () => {
    const contextId = await sentMessageId(settingsMenu())
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
    const response = await inbound(
      inboundRequest({
        reply: { type: "button_reply", id: "option-1" },
        contextId,
      })
    )
    assert.equal(response.status, 200)
    const webhook = JSON.parse(
      (fetchMock.mock.calls[0]!.arguments[1] as RequestInit).body as string
    )
    const message = webhook.entry[0].changes[0].value.messages[0]
    assert.equal(message.type, "interactive")
    assert.deepEqual(message.context, { from: "255712345678", id: contextId })
    assert.deepEqual(message.interactive, {
      type: "button_reply",
      button_reply: { id: "option-1", title: "Classes and Subjects" },
    })
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.at(-1)!.content, "Classes and Subjects")
  })

  it("forwards a list selection as a list_reply webhook", async () => {
    const contextId = await sentMessageId(listMenu())
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
    await inbound(
      inboundRequest({
        reply: { type: "list_reply", id: "option-2" },
        contextId,
      })
    )
    const webhook = JSON.parse(
      (fetchMock.mock.calls[0]!.arguments[1] as RequestInit).body as string
    )
    assert.deepEqual(
      webhook.entry[0].changes[0].value.messages[0].interactive,
      {
        type: "list_reply",
        list_reply: { id: "option-2", title: "Choice 2" },
      }
    )
  })

  it("rejects options that were never sent", async () => {
    const contextId = await sentMessageId(settingsMenu())
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
    for (const body of [
      { reply: { type: "button_reply", id: "option-9" }, contextId },
      { reply: { type: "list_reply", id: "option-0" }, contextId },
      { reply: { type: "button_reply", id: "option-0" }, contextId: "wamid.x" },
    ]) {
      assert.equal((await inbound(inboundRequest(body))).status, 400)
    }
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})
