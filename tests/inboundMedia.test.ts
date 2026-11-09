import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

import { projectChat } from "@/lib/localChat"
import { readEvents } from "@/lib/localEvents"
import { GET as mediaInfo } from "@/app/api/whatsapp/[mediaId]/route"

process.env.CHATBOT_CALLBACK_URL = "http://127.0.0.1:8000/devhooks"
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test"
const { POST: inbound } = await import("@/app/api/inbound/route")

const jpeg = () =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const ogg = () => Buffer.concat([Buffer.from("OggS"), Buffer.alloc(32)])
const pdf = () => Buffer.from("%PDF-1.4\n%%EOF")

async function sendFile(
  bytes: Buffer,
  type: string,
  name: string,
  caption?: string
) {
  const form = new FormData()
  form.set("file", new File([new Uint8Array(bytes)], name, { type }))
  if (caption) form.set("caption", caption)
  const body = new Request("http://localhost", { method: "POST", body: form })
  const raw = await body.arrayBuffer()
  return inbound(
    new Request("http://localhost/api/inbound", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "content-type": body.headers.get("content-type")!,
        "content-length": String(raw.byteLength),
      },
      body: raw,
    })
  )
}

describe("inbound media", () => {
  let fetchMock: ReturnType<typeof mock.method>
  beforeEach(async () => {
    process.env.MOCK_WHATSAPP_DATA_DIR = await mkdtemp(
      path.join(os.tmpdir(), "mock-inbound-media-")
    )
    process.env.MOCK_WHATSAPP_TOKEN = "test-token"
    process.env.APP_MODE = "chat"
    fetchMock = mock.method(globalThis, "fetch", async () =>
      Response.json({ status: "ok" })
    )
  })
  afterEach(async () => {
    mock.restoreAll()
    await rm(process.env.MOCK_WHATSAPP_DATA_DIR!, {
      recursive: true,
      force: true,
    })
  })

  const forwardedMessage = () => {
    const init = fetchMock.mock.calls.at(-1)!.arguments[1] as RequestInit
    return JSON.parse(init.body as string).entry[0].changes[0].value.messages[0]
  }

  it("sends an image by media ID with its caption", async () => {
    const response = await sendFile(jpeg(), "image/jpeg", "q.jpg", "Solve 2")
    assert.equal(response.status, 200)
    const message = forwardedMessage()
    assert.equal(message.type, "image")
    assert.equal(message.image.caption, "Solve 2")
    assert.equal(message.image.mime_type, "image/jpeg")
    assert.match(message.image.id, /^\d+$/)
    assert.ok(message.image.sha256)
    assert.equal(message.image.url, undefined)

    const id = message.image.id
    const info = await mediaInfo(
      new Request(`http://localhost/api/whatsapp/${id}`, {
        headers: { Authorization: "Bearer test-token" },
      }),
      { params: Promise.resolve({ mediaId: id }) }
    )
    assert.equal((await info.json()).sha256, message.image.sha256)
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages[0]!.media?.kind, "image")
    assert.equal(chat.messages[0]!.content, "Solve 2")
  })

  it("sends OGG audio as a voice note", async () => {
    await sendFile(ogg(), "audio/ogg", "voice.ogg")
    const message = forwardedMessage()
    assert.equal(message.type, "audio")
    assert.equal(message.audio.mime_type, "audio/ogg; codecs=opus")
    assert.equal(message.audio.voice, true)
  })

  it("sends a PDF as a document with its filename", async () => {
    await sendFile(pdf(), "application/pdf", "homework.pdf", "Please check")
    const message = forwardedMessage()
    assert.equal(message.type, "document")
    assert.equal(message.document.filename, "homework.pdf")
    assert.equal(message.document.caption, "Please check")
  })

  it("rejects unsupported and mislabeled files", async () => {
    for (const [bytes, type] of [
      [Buffer.from("<html>"), "text/html"],
      [pdf(), "image/jpeg"],
      [Buffer.alloc(0), "image/jpeg"],
    ] as const) {
      assert.equal((await sendFile(bytes, type, "x")).status, 400, type)
    }
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})
