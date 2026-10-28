import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

const CHATBOT_CALLBACK_URL = "http://127.0.0.1:8000/devhooks"

// env.js validates these when the route module is first imported
process.env.CHATBOT_CALLBACK_URL = CHATBOT_CALLBACK_URL
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test"
process.env.MOCK_WHATSAPP_TOKEN = "test-local-token"
const { POST } = await import("@/app/api/inbound/route")

function inboundRequest(body: unknown) {
  return new Request("http://localhost/api/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/inbound", () => {
  const originalAppMode = process.env.APP_MODE

  beforeEach(async () => {
    process.env.APP_MODE = "chat"
    process.env.MOCK_WHATSAPP_DATA_DIR = await mkdtemp(
      path.join(os.tmpdir(), "mock-inbound-")
    )
    mock.method(console, "error", () => {})
  })

  afterEach(async () => {
    if (originalAppMode === undefined) delete process.env.APP_MODE
    else process.env.APP_MODE = originalAppMode
    mock.restoreAll()
    await rm(process.env.MOCK_WHATSAPP_DATA_DIR!, {
      recursive: true,
      force: true,
    })
  })

  it("blocks forwarding in observe mode", async () => {
    process.env.APP_MODE = "observe"
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )

    const response = await POST(inboundRequest({ body: "Hello" }))

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), {
      success: false,
      error: "OBSERVE_MODE_READ_ONLY",
    })
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it("forwards the message to the chatbot as a WhatsApp webhook", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )

    const response = await POST(inboundRequest({ body: "Hello Twiga" }))

    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.success, true)
    assert.match(result.messageId, /^wamid\./)
    assert.deepEqual(result.data, { status: "ok" })

    assert.equal(fetchMock.mock.callCount(), 1)
    const [url, init] = fetchMock.mock.calls[0]!.arguments as [
      string,
      RequestInit,
    ]
    assert.equal(url, CHATBOT_CALLBACK_URL)
    assert.equal(init.method, "POST")
    const payload = JSON.parse(init.body as string)
    assert.equal(payload.object, "whatsapp_business_account")
    assert.equal(
      payload.entry[0].changes[0].value.messages[0].text.body,
      "Hello Twiga"
    )
  })

  it("reports an error when the chatbot responds with an error status", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json(
        { status: "error", message: "Internal server error" },
        { status: 500 }
      )
    )

    const response = await POST(inboundRequest({ body: "Hello" }))
    const result = await response.json()

    assert.equal(response.status, 502)
    assert.equal(result.success, false)
    assert.match(result.error, /500/)
  })

  it("reports an error when the chatbot is unreachable", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed")
    })

    const response = await POST(inboundRequest({ body: "Hello" }))
    const result = await response.json()

    assert.equal(response.status, 502)
    assert.equal(result.success, false)
    assert.match(result.error, /Could not reach chatbot/)
  })

  it("rejects requests without a message body", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )

    const missingBody = await POST(inboundRequest({}))
    const blankBody = await POST(inboundRequest({ body: "   " }))
    const invalidJson = await POST(inboundRequest("not json"))

    assert.equal(missingBody.status, 400)
    assert.equal(blankBody.status, 400)
    assert.equal(invalidJson.status, 400)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it("blocks cross-origin requests before forwarding", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
    const foreign = inboundRequest({ body: "hello" })
    foreign.headers.set("origin", "http://example.com")
    assert.equal((await POST(foreign)).status, 403)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it(
    "forwards a second message while the first is still being processed",
    { timeout: 2000 },
    async () => {
      let releaseChatbot!: () => void
      const chatbotBusy = new Promise<void>((resolve) => {
        releaseChatbot = resolve
      })
      let markBothForwarded!: () => void
      const bothForwarded = new Promise<void>((resolve) => {
        markBothForwarded = resolve
      })

      let forwarded = 0
      mock.method(globalThis, "fetch", async () => {
        forwarded += 1
        if (forwarded === 2) markBothForwarded()
        await chatbotBusy
        return Response.json({ status: "ok" })
      })

      const first = POST(inboundRequest({ body: "What is erosion?" }))
      const second = POST(inboundRequest({ body: "Answer in one sentence." }))

      // Times out if the second message waits for the first to finish
      await bothForwarded
      releaseChatbot()

      const responses = await Promise.all([first, second])
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200]
      )
    }
  )
})
