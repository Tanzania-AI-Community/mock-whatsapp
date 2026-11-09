import { env } from "@/env.js"

import type { EventData } from "@/types/events"
import { appendEvent } from "@/lib/localEvents"
import { buildMessageWebhook } from "@/lib/metaWebhook"
import { isLocalUrl } from "@/lib/mockTransport"

type InboundEvent = Extract<EventData, { kind: "inbound" }>

// Logs the user's message, then posts it to Twiga like Meta's webhook would
export async function forwardInbound(
  event: Omit<InboundEvent, "kind">,
  message: Parameters<typeof buildMessageWebhook>[0]["message"]
) {
  const { recipientId, messageId } = event
  if (!env.CHATBOT_CALLBACK_URL || !isLocalUrl(env.CHATBOT_CALLBACK_URL)) {
    return Response.json(
      {
        success: false,
        error: "CHATBOT_CALLBACK_URL must be a local HTTP URL",
      },
      { status: 503 }
    )
  }
  const payload = buildMessageWebhook({ message, recipientId, messageId })
  try {
    await appendEvent({ kind: "inbound", ...event })
  } catch (error) {
    const duplicate =
      error instanceof Error && error.message === "Message ID already exists"
    return Response.json(
      {
        success: false,
        messageId,
        error: duplicate ? error.message : "Could not persist inbound message",
      },
      { status: duplicate ? 409 : 503 }
    )
  }
  let data: unknown = null
  let error: string | undefined
  try {
    const response = await fetch(env.CHATBOT_CALLBACK_URL, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    data = await response.json().catch(() => null)
    if (!response.ok) error = `Chatbot responded with status ${response.status}`
  } catch {
    error = "Could not reach chatbot"
  }
  try {
    await appendEvent({ kind: "forwarded", recipientId, messageId, error })
  } catch {
    return Response.json(
      {
        success: false,
        messageId,
        error: "Could not persist forwarding result",
      },
      { status: 503 }
    )
  }
  return Response.json(
    { success: !error, messageId, data, ...(error ? { error } : {}) },
    { status: error ? 502 : 200 }
  )
}
