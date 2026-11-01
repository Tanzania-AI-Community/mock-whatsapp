import { env } from "@/env.js"
import { z } from "zod"

import { getAppMode } from "@/lib/appMode"
import { appendEvent } from "@/lib/localEvents"
import {
  buildTextMessageWebhook,
  DEFAULT_RECIPIENT_ID,
} from "@/lib/metaWebhook"
import { checkLocalRequest, isLocalUrl } from "@/lib/mockTransport"

export const runtime = "nodejs"

const inputSchema = z.object({
  body: z.string().refine((body) => body.trim().length > 0),
  recipientId: z.string().regex(/^\d+$/).default(DEFAULT_RECIPIENT_ID),
  messageId: z
    .string()
    .regex(/^wamid\.[\w.-]+$/)
    .optional(),
})

export async function POST(request: Request) {
  if (getAppMode() === "observe") {
    return Response.json(
      { success: false, error: "OBSERVE_MODE_READ_ONLY" },
      { status: 403 }
    )
  }

  const denied = checkLocalRequest(request)
  if (denied) return denied
  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "A message body and valid recipient are required",
      },
      { status: 400 }
    )
  }
  if (!env.CHATBOT_CALLBACK_URL || !isLocalUrl(env.CHATBOT_CALLBACK_URL)) {
    return Response.json(
      {
        success: false,
        error: "CHATBOT_CALLBACK_URL must be a local HTTP URL",
      },
      { status: 503 }
    )
  }
  const payload = buildTextMessageWebhook(parsed.data)
  const message = payload.entry[0]!.changes[0]!.value.messages[0]!
  const { recipientId, body } = parsed.data
  const messageId = message.id
  try {
    await appendEvent({ kind: "inbound", recipientId, messageId, body })
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
