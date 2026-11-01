import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { projectChat } from "@/lib/localChat"
import { appendEvent, readEvents } from "@/lib/localEvents"
import { faultSchema, setFault } from "@/lib/mockTransport"
import { GET } from "@/app/api/events/route"
import { PUT } from "@/app/api/whatsapp/faults/route"
import { POST } from "@/app/api/whatsapp/messages/route"

const recipientId = "255712345678"
const payload = (body = "Hello 🦒") => ({
  messaging_product: "whatsapp",
  to: recipientId,
  type: "text",
  text: { body },
})
function request(input: unknown, token = "test-token") {
  return new Request("http://localhost/api/whatsapp/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })
}

describe("local WhatsApp receiver", () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mock-outgoing-"))
    process.env.MOCK_WHATSAPP_DATA_DIR = directory
    process.env.MOCK_WHATSAPP_TOKEN = "test-token"
    process.env.APP_MODE = "chat"
    setFault(null)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("persists the actual text payload before acknowledging its message ID", async () => {
    const response = await POST(request(payload()))
    assert.equal(response.status, 200)
    const result = await response.json()
    const events = await readEvents()
    assert.equal(events.length, 1)
    assert.equal(events[0]!.kind, "outgoing")
    if (events[0]!.kind !== "outgoing")
      throw new Error("Expected outgoing event")
    assert.deepEqual(events[0]!.payload, payload())
    assert.equal(events[0]!.messageId, result.messages[0].id)
    assert.match(result.messages[0].id, /^wamid\.mock\./)
  })

  it("rejects form bytes mislabeled as JSON and unsupported outputs", async () => {
    const malformed = new Request("http://localhost/api/whatsapp/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: "type=text&text=hello",
    })
    assert.equal((await POST(malformed)).status, 400)
    assert.equal(
      (await POST(request({ ...payload(), type: "interactive" }))).status,
      422
    )
    assert.equal(projectChat(await readEvents()).messages.length, 0)
  })

  it("rejects empty and over-limit text without recording delivery", async () => {
    assert.equal((await POST(request(payload(" ")))).status, 422)
    assert.equal((await POST(request(payload("x".repeat(4097))))).status, 422)
    assert.equal(projectChat(await readEvents()).messages.length, 0)
  })

  it("correlates read and typing actions with the inbound message", async () => {
    await appendEvent({
      kind: "inbound",
      recipientId,
      messageId: "wamid.in",
      body: "Hi",
    })
    const action = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.in",
      typing_indicator: { type: "text" },
    }
    assert.equal((await POST(request(action))).status, 200)
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages[0]!.read, true)
    assert.ok(chat.typingUntil > Date.now())
    assert.equal(
      (await POST(request({ ...action, message_id: "wamid.unknown" }))).status,
      404
    )
  })

  it("fails the selected chunk once and never projects it as delivered", async () => {
    const configured = await PUT(
      new Request("http://localhost/api/whatsapp/faults", {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rule: { target: "text", skip: 1, status: 429 },
        }),
      })
    )
    assert.equal(configured.status, 200)
    assert.equal((await POST(request(payload("first")))).status, 200)
    assert.equal((await POST(request(payload("rejected")))).status, 429)
    assert.equal((await POST(request(payload("third")))).status, 200)
    const chat = projectChat(await readEvents())
    assert.deepEqual(
      chat.messages.map((message) => message.content),
      ["first", "third"]
    )
    assert.equal(chat.errors.length, 1)
  })

  it("does not hold the event writer while a delayed send waits", async () => {
    setFault(faultSchema.parse({ target: "text", delayMs: 40 }))
    const delayed = POST(request(payload("delayed")))
    await POST(request(payload("immediate")))
    await delayed
    assert.deepEqual(
      projectChat(await readEvents()).messages.map(
        (message) => message.content
      ),
      ["immediate", "delayed"]
    )
  })

  it("does not acknowledge a message when persistence fails", async () => {
    const file = path.join(directory, "not-a-directory")
    await writeFile(file, "file")
    process.env.MOCK_WHATSAPP_DATA_DIR = file
    assert.equal((await POST(request(payload()))).status, 503)
  })

  it("blocks unauthenticated, nonlocal, cross-origin and observer writes", async () => {
    assert.equal((await POST(request(payload(), "wrong"))).status, 401)
    const foreign = new Request("http://example.com/api/whatsapp/messages", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
      body: JSON.stringify(payload()),
    })
    assert.equal((await POST(foreign)).status, 403)
    const rebinding = request(payload())
    rebinding.headers.set("host", "example.com")
    assert.equal((await POST(rebinding)).status, 403)
    process.env.APP_MODE = "observe"
    assert.equal((await POST(request(payload()))).status, 403)
    assert.equal(
      (await GET(new Request("http://localhost/api/events"))).status,
      403
    )
    assert.deepEqual(await readEvents(), [])
  })

  it("scopes event polling and advances its cursor", async () => {
    await POST(request(payload("one")))
    await POST(request({ ...payload("other"), to: "255700000001" }))
    const response = await GET(
      new Request("http://localhost/api/events?after=0")
    )
    const data = await response.json()
    assert.equal(data.events.length, 1)
    assert.equal(data.nextCursor, 2)
    const next = await GET(
      new Request(`http://localhost/api/events?after=${data.nextCursor}`)
    )
    assert.deepEqual((await next.json()).events, [])
  })
})
