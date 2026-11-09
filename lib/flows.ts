import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { FlowParameters } from "@/types/events"
import { readEvents } from "@/lib/localEvents"

export interface SentFlow {
  recipientId: string
  messageId: string
  parameters: FlowParameters
}

export async function findSentFlow(
  messageId: string
): Promise<SentFlow | null> {
  const event = (await readEvents()).find(
    (e) => e.kind === "outgoing" && e.messageId === messageId
  )
  if (
    event?.kind !== "outgoing" ||
    event.payload.type !== "interactive" ||
    event.payload.interactive.type !== "flow"
  )
    return null
  return {
    recipientId: event.recipientId,
    messageId,
    parameters: event.payload.interactive.action.parameters,
  }
}

interface FlowDefinition {
  screens: { id: string }[]
}

// Picks the Flow JSON in MOCK_WHATSAPP_FLOW_DIR (e.g. Twiga's app/assets/flows)
// that contains the screen the Flow message opens
export async function readFlowDefinition(screen: string | undefined) {
  const directory = process.env.MOCK_WHATSAPP_FLOW_DIR
  if (!directory) throw new Error("MOCK_WHATSAPP_FLOW_DIR is not configured")
  if (!screen) throw new Error("The Flow message has no entry screen")
  for (const file of (await readdir(directory)).sort()) {
    if (!file.endsWith(".json")) continue
    const definition = JSON.parse(
      await readFile(path.join(directory, file), "utf8")
    ) as FlowDefinition
    if (definition.screens?.some((candidate) => candidate.id === screen))
      return definition
  }
  throw new Error(`No local Flow definition has the screen ${screen}`)
}

export async function readFlowPublicKey() {
  const file = process.env.MOCK_WHATSAPP_FLOW_PUBLIC_KEY_FILE
  if (!file)
    throw new Error("MOCK_WHATSAPP_FLOW_PUBLIC_KEY_FILE is not configured")
  return readFile(file, "utf8")
}
