import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { appendEvent, readEvents } from "@/lib/localEvents"

describe("local event log", () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mock-events-"))
    process.env.MOCK_WHATSAPP_DATA_DIR = directory
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("orders concurrent appends without overwriting messages", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        appendEvent({
          kind: "inbound",
          recipientId: "1",
          messageId: `wamid.${index}`,
          body: "same text",
        })
      )
    )
    const events = await readEvents()
    assert.deepEqual(
      events.map((event) => event.seq),
      Array.from({ length: 20 }, (_, index) => index + 1)
    )
  })

  it("survives a new process and preserves its sequence", async () => {
    await appendEvent({
      kind: "inbound",
      recipientId: "1",
      messageId: "wamid.1",
      body: "persisted",
    })
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        'const {readEvents,appendEvent}=await import("./lib/localEvents.ts"); const events=await readEvents(); console.log(events[0].body); await appendEvent({kind:"inbound",recipientId:"1",messageId:"wamid.2",body:"second"})',
      ],
      { env: process.env, encoding: "utf8" }
    )
    assert.match(output, /persisted/)
    assert.equal((await readEvents()).at(-1)!.seq, 2)
  })

  it("repairs only an incomplete final append", async () => {
    await appendEvent({
      kind: "inbound",
      recipientId: "1",
      messageId: "wamid.1",
      body: "first",
    })
    await appendFile(path.join(directory, "events.jsonl"), '{"incomplete":')
    assert.equal((await readEvents()).length, 1)
    await appendEvent({
      kind: "forwarded",
      recipientId: "1",
      messageId: "wamid.1",
    })
    assert.equal((await readEvents()).length, 2)
    await writeFile(path.join(directory, "events.jsonl"), "corrupt\n")
    await assert.rejects(readEvents)
  })

  it("rejects duplicate inbound IDs before forwarding twice", async () => {
    const event = {
      kind: "inbound" as const,
      recipientId: "1",
      messageId: "wamid.1",
      body: "hello",
    }
    await appendEvent(event)
    await assert.rejects(appendEvent(event), /already exists/)
    assert.equal((await readEvents()).length, 1)
  })
})
