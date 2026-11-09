import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

import { projectChat } from "@/lib/localChat"
import { readEvents } from "@/lib/localEvents"
import { faultSchema, setFault } from "@/lib/mockTransport"
import { GET as viewMedia } from "@/app/api/media/[mediaId]/route"
import {
  DELETE as deleteMedia,
  GET as mediaInfo,
} from "@/app/api/whatsapp/[mediaId]/route"
import { GET as downloadMedia } from "@/app/api/whatsapp/media/[mediaId]/route"
import { POST as upload } from "@/app/api/whatsapp/media/route"
import { POST as send } from "@/app/api/whatsapp/messages/route"

const recipientId = "255712345678"
const auth = { Authorization: "Bearer test-token" }

export function png(width = 2, height = 2, colorType = 2) {
  const header = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header)
  header.writeUInt32BE(13, 8)
  header.write("IHDR", 12, "latin1")
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  header[24] = 8
  header[25] = colorType
  return Buffer.concat([header, Buffer.from("rest-of-image")])
}
export const pdf = () => Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")

function uploadRequest(bytes: Buffer, type: string, name: string) {
  const form = new FormData()
  form.set("messaging_product", "whatsapp")
  form.set("file", new File([new Uint8Array(bytes)], name, { type }))
  return new Request("http://localhost/api/whatsapp/media", {
    method: "POST",
    headers: auth,
    body: form,
  })
}

// Request bodies need a Content-Length, like httpx multipart uploads have
async function withLength(request: Request) {
  const body = await request.arrayBuffer()
  return new Request(request.url, {
    method: "POST",
    headers: {
      ...auth,
      "content-type": request.headers.get("content-type")!,
      "content-length": String(body.byteLength),
    },
    body,
  })
}

async function uploadFile(bytes: Buffer, type: string, name = "file") {
  return upload(await withLength(uploadRequest(bytes, type, name)))
}

async function uploadedId(bytes: Buffer, type: string, name = "file") {
  const response = await uploadFile(bytes, type, name)
  assert.equal(response.status, 200)
  const { id } = await response.json()
  assert.match(id, /^\d+$/)
  return id as string
}

function sendRequest(payload: unknown) {
  return new Request("http://localhost/api/whatsapp/messages", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}
const image = (id: string, extra = {}) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipientId,
  type: "image",
  image: { id, ...extra },
})
const documentMessage = (id: string, filename = "lesson_plan.pdf") => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: recipientId,
  type: "document",
  document: { id, filename },
})
const params = (mediaId: string) => ({ params: Promise.resolve({ mediaId }) })
const mediaRequest = (id: string, method = "GET", headers = auth) =>
  new Request(`http://localhost/api/whatsapp/${id}`, { method, headers })
const view = (id: string, query = "") =>
  viewMedia(new Request(`http://localhost/api/media/${id}${query}`), params(id))

describe("local media API", () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mock-media-"))
    process.env.MOCK_WHATSAPP_DATA_DIR = directory
    process.env.MOCK_WHATSAPP_TOKEN = "test-token"
    process.env.APP_MODE = "chat"
    setFault(null)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("uploads, sends, deletes and keeps the delivered copy", async () => {
    const bytes = png()
    const id = await uploadedId(bytes, "image/png", "twiga_latex_1.png")
    assert.equal((await view(id)).status, 404, "undelivered media is hidden")

    assert.equal((await send(sendRequest(image(id)))).status, 200)
    const served = await view(id)
    assert.equal(served.status, 200)
    assert.equal(served.headers.get("content-type"), "image/png")
    assert.equal(served.headers.get("x-content-type-options"), "nosniff")
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes)

    const deleted = await deleteMedia(mediaRequest(id, "DELETE"), params(id))
    assert.deepEqual(await deleted.json(), { success: true })
    const resend = await send(sendRequest(image(id)))
    assert.equal(resend.status, 400)
    assert.match((await resend.json()).error.error_data.details, /deleted/)
    assert.equal(
      (await deleteMedia(mediaRequest(id, "DELETE"), params(id))).status,
      404
    )
    assert.equal((await view(id)).status, 200, "delivered copy stays visible")

    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.length, 1)
    assert.deepEqual(chat.messages[0]!.media, {
      kind: "image",
      id,
      serverCopyDeleted: true,
    })
  })

  it("serves PDFs inline or as a named download", async () => {
    const id = await uploadedId(pdf(), "application/pdf", "tmpabc.pdf")
    assert.equal(
      (await send(sendRequest(documentMessage(id, "exam_1.pdf")))).status,
      200
    )
    const inline = await view(id)
    assert.equal(inline.headers.get("content-type"), "application/pdf")
    assert.match(inline.headers.get("content-disposition")!, /^inline/)
    const download = await view(id, "?download")
    assert.equal(
      download.headers.get("content-disposition"),
      'attachment; filename="exam_1.pdf"'
    )
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages[0]!.media?.filename, "exam_1.pdf")
  })

  it("rejects unsafe, mislabeled and oversized uploads", async () => {
    const cases: [Buffer, string, number][] = [
      [Buffer.from("<svg/>"), "image/svg+xml", 400],
      [Buffer.from("<html>"), "text/html", 400],
      [pdf(), "image/png", 400],
      [Buffer.from("89504e470d0a1a0a", "hex"), "image/png", 400],
      [png(5000, 10), "image/png", 400],
      [png(2, 2, 3), "image/png", 400],
      [Buffer.concat([png(), Buffer.alloc(5 * 1024 * 1024)]), "image/png", 413],
    ]
    for (const [bytes, type, status] of cases) {
      const response = await uploadFile(bytes, type)
      assert.equal(response.status, status, type)
      assert.equal((await response.json()).error.code, 131053)
    }
    const files = await readdir(path.join(directory, "media")).catch(() => [])
    assert.deepEqual(files, [])
  })

  it("rejects links, unknown IDs and wrong media types in sends", async () => {
    const pdfId = await uploadedId(pdf(), "application/pdf")
    const cases = [
      image("123456789012345", {}),
      image(pdfId),
      { ...image(pdfId), image: { link: "https://example.com/a.png" } },
      documentMessage(pdfId, "lesson_plan"),
    ]
    for (const payload of cases) {
      const response = await send(sendRequest(payload))
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error.code, 131009)
    }
    assert.equal(projectChat(await readEvents()).messages.length, 0)
  })

  it("simulates upload, send and delete failures", async () => {
    setFault(faultSchema.parse({ target: "upload", status: 500 }))
    assert.equal((await uploadFile(png(), "image/png")).status, 500)
    const id = await uploadedId(png(), "image/png")

    setFault(faultSchema.parse({ target: "image", status: 400 }))
    assert.equal((await send(sendRequest(image(id)))).status, 400)
    assert.equal((await send(sendRequest(image(id)))).status, 200)

    setFault(faultSchema.parse({ target: "delete", status: 500 }))
    assert.equal(
      (await deleteMedia(mediaRequest(id, "DELETE"), params(id))).status,
      500
    )
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.length, 1)
    assert.equal(chat.errors.length, 3)
  })

  it("rejects a delayed send if its media is deleted before delivery", async () => {
    const id = await uploadedId(pdf(), "application/pdf", "exam.pdf")
    setFault(faultSchema.parse({ target: "document", delayMs: 100 }))
    const sending = send(sendRequest(documentMessage(id)))
    const deletion = await deleteMedia(mediaRequest(id, "DELETE"), params(id))
    assert.equal(deletion.status, 200)
    assert.equal((await sending).status, 400)
    assert.equal(projectChat(await readEvents()).messages.length, 0)
    assert.equal((await view(id)).status, 404)
  })

  it("attributes deletion to a recipient that received media during a delete delay", async () => {
    const id = await uploadedId(pdf(), "application/pdf", "exam.pdf")
    let release!: () => void
    let markWaiting!: () => void
    const waiting = new Promise<void>((resolve) => {
      markWaiting = resolve
    })
    const timer = mock.method(
      globalThis,
      "setTimeout",
      (callback: () => void) => {
        release = callback
        markWaiting()
        return 0 as unknown as NodeJS.Timeout
      }
    )
    setFault(faultSchema.parse({ target: "delete", delayMs: 100 }))
    try {
      const deleting = deleteMedia(mediaRequest(id, "DELETE"), params(id))
      await waiting
      assert.equal((await send(sendRequest(documentMessage(id)))).status, 200)
      release()
      assert.equal((await deleting).status, 200)
      const deletion = (await readEvents()).find(
        (event) => event.kind === "media_deleted"
      )
      assert.equal(deletion?.recipientId, recipientId)
      assert.equal(
        projectChat(await readEvents()).messages[0]!.media?.serverCopyDeleted,
        true
      )
    } finally {
      timer.mock.restore()
    }
  })

  it("serves metadata and bearer-protected downloads by media ID", async () => {
    const bytes = pdf()
    const id = await uploadedId(bytes, "application/pdf")
    const info = await (await mediaInfo(mediaRequest(id), params(id))).json()
    assert.equal(info.url, `http://localhost/api/whatsapp/media/${id}`)
    assert.equal(info.mime_type, "application/pdf")
    assert.equal(info.file_size, bytes.length)
    assert.equal(info.messaging_product, "whatsapp")

    const download = (headers = auth) =>
      downloadMedia(new Request(info.url, { headers }), params(id))
    assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), bytes)
    assert.equal((await download({ Authorization: "Bearer no" })).status, 401)

    setFault(faultSchema.parse({ target: "download", status: 500 }))
    assert.equal((await download()).status, 500)
    for (const bad of ["../events.jsonl", "12", "abc"]) {
      assert.equal(
        (await mediaInfo(mediaRequest(bad), params(bad))).status,
        404
      )
      assert.equal((await view(bad)).status, 404)
    }
  })

  it("requires the token and a local host for uploads", async () => {
    const request = await withLength(uploadRequest(png(), "image/png", "a.png"))
    request.headers.set("authorization", "Bearer wrong")
    assert.equal((await upload(request)).status, 401)
    const foreign = await withLength(uploadRequest(png(), "image/png", "a.png"))
    foreign.headers.set("host", "example.com")
    assert.equal((await upload(foreign)).status, 403)
  })
})
