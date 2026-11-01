import { appendFile, mkdir, readFile, truncate } from "node:fs/promises"
import path from "node:path"

import { type EventData, type LocalEvent } from "@/types/events"

const state = globalThis as typeof globalThis & {
  whatsappWrites?: Promise<unknown>
}

function eventPath() {
  return path.join(
    process.env.MOCK_WHATSAPP_DATA_DIR ??
      path.join(process.cwd(), ".mock-whatsapp"),
    "events.jsonl"
  )
}

async function readLog() {
  let content: string
  try {
    content = await readFile(eventPath(), "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { events: [] as LocalEvent[], content: "", complete: "" }
    }
    throw error
  }
  const complete = content.slice(0, content.lastIndexOf("\n") + 1)
  const events: LocalEvent[] = complete
    .split("\n")
    .filter(Boolean)
    .map((line: string) => JSON.parse(line) as LocalEvent)
  return { events, content, complete }
}

export async function readEvents(): Promise<LocalEvent[]> {
  await state.whatsappWrites
  return (await readLog()).events
}

export function appendEvent(data: EventData): Promise<LocalEvent> {
  const write = (state.whatsappWrites ?? Promise.resolve()).then(async () => {
    const { events, content, complete } = await readLog()
    if (
      data.kind === "inbound" &&
      events.some(
        (event) =>
          event.kind === "inbound" && event.messageId === data.messageId
      )
    ) {
      throw new Error("Message ID already exists")
    }
    const event: LocalEvent = {
      ...data,
      seq: (events.at(-1)?.seq ?? 0) + 1,
      time: Date.now(),
    }
    await mkdir(path.dirname(eventPath()), { recursive: true, mode: 0o700 })
    if (content !== complete) {
      await truncate(eventPath(), Buffer.byteLength(complete))
    }
    await appendFile(eventPath(), `${JSON.stringify(event)}\n`, { mode: 0o600 })
    return event
  })
  state.whatsappWrites = write.catch(() => {})
  return write
}
