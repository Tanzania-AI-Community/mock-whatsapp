import assert from "node:assert/strict"
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it, mock } from "node:test"

import { projectChat } from "@/lib/localChat"
import { readEvents } from "@/lib/localEvents"
import { POST as send } from "@/app/api/whatsapp/messages/route"

process.env.CHATBOT_CALLBACK_URL = "http://127.0.0.1:8000/devhooks"
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/test"
const { POST: exchange } = await import("@/app/api/flows/route")
const { GET: definition } = await import("@/app/api/flows/definition/route")

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const recipientId = "255712345678"

// Mirrors Twiga's app/services/flows/utils.py decrypt and encrypt functions
function twigaDecrypt(body: Record<string, string>) {
  const aesKey = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(body.encrypted_aes_key!, "base64")
  )
  const iv = Buffer.from(body.initial_vector!, "base64")
  const data = Buffer.from(body.encrypted_flow_data!, "base64")
  const decipher = createDecipheriv("aes-128-gcm", aesKey, iv)
  decipher.setAuthTag(data.subarray(-16))
  const plain = Buffer.concat([
    decipher.update(data.subarray(0, -16)),
    decipher.final(),
  ])
  return { payload: JSON.parse(plain.toString()), aesKey, iv }
}
function twigaEncrypt(response: unknown, aesKey: Buffer, iv: Buffer) {
  const cipher = createCipheriv(
    "aes-128-gcm",
    aesKey,
    Buffer.from(iv.map((b) => ~b & 0xff))
  )
  return Buffer.concat([
    cipher.update(JSON.stringify(response)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64")
}

const flowMessage = {
  messaging_product: "whatsapp",
  to: recipientId,
  recipient_type: "individual",
  type: "interactive",
  interactive: {
    type: "flow",
    header: { type: "text", text: "Classes and subjects" },
    body: { text: "Update your classes" },
    footer: { text: "Twiga" },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_action: "navigate",
        flow_token: "encrypted-token",
        flow_id: "1000000000000001",
        flow_cta: "Select",
        mode: "published",
        flow_action_payload: {
          screen: "select_subject",
          data: { has_subject_options: true },
        },
      },
    },
  },
}

const post = (body: unknown) =>
  exchange(
    new Request("http://localhost/api/flows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify(body),
    })
  )

describe("WhatsApp Flow simulation", () => {
  let directory: string
  let messageId: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mock-flows-"))
    process.env.MOCK_WHATSAPP_DATA_DIR = directory
    process.env.MOCK_WHATSAPP_TOKEN = "test-token"
    process.env.APP_MODE = "chat"
    process.env.MOCK_WHATSAPP_FLOW_DIR = directory
    process.env.MOCK_WHATSAPP_FLOW_PUBLIC_KEY_FILE = path.join(
      directory,
      "public.pem"
    )
    await writeFile(
      process.env.MOCK_WHATSAPP_FLOW_PUBLIC_KEY_FILE,
      publicKey.export({ type: "spki", format: "pem" })
    )
    await writeFile(
      path.join(directory, "subjects_classes_flow.json"),
      JSON.stringify({
        screens: [{ id: "select_subject", layout: { children: [] } }],
      })
    )
    const response = await send(
      new Request("http://localhost/api/whatsapp/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(flowMessage),
      })
    )
    assert.equal(response.status, 200)
    messageId = (await response.json()).messages[0].id
  })
  afterEach(async () => {
    mock.restoreAll()
    await rm(directory, { recursive: true, force: true })
  })

  it("shows the sent flow with its local definition and first screen", async () => {
    const response = await definition(
      new Request(
        `http://localhost/api/flows/definition?messageId=${messageId}`
      )
    )
    const result = await response.json()
    assert.equal(result.screen, "select_subject")
    assert.deepEqual(result.data, { has_subject_options: true })
    assert.equal(result.definition.screens[0].id, "select_subject")
    const messages = projectChat(await readEvents()).messages
    assert.equal(messages[0]!.interactive?.type, "flow")
  })

  it("encrypts screen actions for Twiga's endpoint and shows the next screen", async () => {
    const requests: { url: string; payload: Record<string, unknown> }[] = []
    mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
      const { payload, aesKey, iv } = twigaDecrypt(
        JSON.parse(init.body as string)
      )
      requests.push({ url: String(url), payload })
      return new Response(
        twigaEncrypt(
          { screen: "select_classes", data: { has_classes: true } },
          aesKey,
          iv
        )
      )
    })
    const response = await post({
      messageId,
      action: "data_exchange",
      screen: "select_subject",
      data: {
        component_action: "load_subject_classes",
        selected_subject_ids: ["1"],
      },
    })
    assert.deepEqual(await response.json(), {
      screen: "select_classes",
      data: { has_classes: true },
    })
    assert.equal(requests[0]!.url, "http://127.0.0.1:8000/flows")
    assert.deepEqual(requests[0]!.payload, {
      version: "3.0",
      action: "data_exchange",
      screen: "select_subject",
      data: {
        component_action: "load_subject_classes",
        selected_subject_ids: ["1"],
      },
      flow_token: "encrypted-token",
    })
  })

  it("sends an nfm_reply webhook when Twiga completes the flow", async () => {
    const calls: { url: string; body: string }[] = []
    mock.method(
      globalThis,
      "fetch",
      async (url: URL | string, init: RequestInit) => {
        calls.push({ url: String(url), body: init.body as string })
        if (String(url).endsWith("/flows")) {
          const { aesKey, iv } = twigaDecrypt(JSON.parse(init.body as string))
          return new Response(
            twigaEncrypt(
              {
                screen: "SUCCESS",
                data: {
                  extension_message_response: {
                    params: { flow_token: "encrypted-token" },
                  },
                },
              },
              aesKey,
              iv
            )
          )
        }
        return Response.json({ status: "ok" })
      }
    )
    const response = await post({
      messageId,
      action: "data_exchange",
      screen: "select_classes",
      data: { component_action: "complete_subject_configuration" },
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).screen, "SUCCESS")
    assert.equal(calls[1]!.url, "http://127.0.0.1:8000/devhooks")
    const message = JSON.parse(calls[1]!.body).entry[0].changes[0].value
      .messages[0]
    assert.equal(message.context.id, messageId)
    assert.deepEqual(message.interactive, {
      type: "nfm_reply",
      nfm_reply: {
        name: "flow",
        body: "Sent",
        response_json: JSON.stringify({ flow_token: "encrypted-token" }),
      },
    })
    const chat = projectChat(await readEvents())
    assert.equal(chat.messages.at(-1)!.content, "Sent")
  })

  it("does not forward encrypted requests through endpoint redirects", async () => {
    let escaped = 0
    const destination = createServer((_req, res) => {
      escaped++
      res.end("external")
    })
    const endpoint = createServer((_req, res) => {
      res.writeHead(307, {
        Location: `http://127.0.0.1:${(destination.address() as AddressInfo).port}/external`,
      })
      res.end()
    })
    await new Promise<void>((resolve) =>
      destination.listen(0, "127.0.0.1", resolve)
    )
    await new Promise<void>((resolve) =>
      endpoint.listen(0, "127.0.0.1", resolve)
    )
    const nativeFetch = globalThis.fetch
    mock.method(globalThis, "fetch", (_url: URL | string, init?: RequestInit) =>
      nativeFetch(
        `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}/flows`,
        init
      )
    )
    try {
      const result = await post({
        messageId,
        action: "data_exchange",
        screen: "select_subject",
        data: {},
      })
      assert.equal(escaped, 0)
      assert.equal(result.status, 502)
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => endpoint.close(() => resolve())),
        new Promise<void>((resolve) => destination.close(() => resolve())),
      ])
    }
  })

  it("reports endpoint errors and flows without a local definition", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ error_msg: "Decryption failed" }, { status: 421 })
    )
    const failed = await post({
      messageId,
      action: "data_exchange",
      screen: "s",
      data: {},
    })
    assert.equal(failed.status, 502)
    assert.match((await failed.json()).error, /421/)
    assert.equal(
      (await post({ messageId: "wamid.none", action: "BACK", screen: "s" }))
        .status,
      404
    )
    flowMessage.interactive.action.parameters.flow_action_payload.screen =
      "unknown_screen"
    const unknown = await send(
      new Request("http://localhost/api/whatsapp/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(flowMessage),
      })
    )
    const unknownId = (await unknown.json()).messages[0].id
    const response = await definition(
      new Request(
        `http://localhost/api/flows/definition?messageId=${unknownId}`
      )
    )
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /No local Flow definition/)
  })
})
