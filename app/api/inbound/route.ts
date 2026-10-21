import { env } from "@/env.js"

import { getAppMode } from "@/lib/appMode"
import { buildTextMessageWebhook } from "@/lib/metaWebhook"

export async function POST(request: Request) {
  if (getAppMode() === "observe") {
    return Response.json(
      { success: false, error: "OBSERVE_MODE_READ_ONLY" },
      { status: 403 }
    )
  }

  let input: { body?: unknown; recipientId?: unknown }
  try {
    input = await request.json()
  } catch {
    return Response.json(
      { success: false, error: "Request body must be JSON" },
      { status: 400 }
    )
  }

  const { body, recipientId } = input ?? {}
  if (typeof body !== "string" || body.trim() === "") {
    return Response.json(
      { success: false, error: "Message body is required" },
      { status: 400 }
    )
  }
  if (recipientId !== undefined && typeof recipientId !== "string") {
    return Response.json(
      { success: false, error: "recipientId must be a string" },
      { status: 400 }
    )
  }

  const payload = buildTextMessageWebhook({ body, recipientId })

  try {
    const response = await fetch(env.CHATBOT_CALLBACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    const data: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: `Chatbot responded with status ${response.status}`,
          data,
        },
        { status: 502 }
      )
    }

    return Response.json({ success: true, data })
  } catch (error) {
    console.error("Could not reach chatbot:", error)
    return Response.json(
      { success: false, error: `Could not reach chatbot: ${String(error)}` },
      { status: 502 }
    )
  }
}
