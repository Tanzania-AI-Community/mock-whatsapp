"use server"

import { revalidatePath } from "next/cache"

import { env } from "../../env.js"

interface SendMessageProps {
  body: string
  recipientId?: string
}

const MAX_AUDIO_BYTES = 16 * 1024 * 1024
async function sendWebhookMessage(
  message: Record<string, unknown>,
  recipientId: string
) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: 1234567890,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "255712345678",
                phone_number_id: "9876543210",
              },
              contacts: [
                {
                  profile: { name: "John Doe" },
                  wa_id: recipientId,
                },
              ],
              messages: [message],
            },
            field: "messages",
          },
        ],
      },
    ],
  }

  const response = await fetch(env.CHATBOT_CALLBACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`)
  }

  revalidatePath("/")
  return {
    success: true as const,
    data: await response.json(),
    transcription: {
      provider: response.headers.get("x-audio-transcription-provider"),
      model: response.headers.get("x-audio-transcription-model"),
      latencyMs: Number(
        response.headers.get("x-audio-transcription-latency-ms") ?? 0
      ),
    },
  }
}

/**
 * Sends a message to the WhatsApp Business API
 */
export async function sendWhatsAppMessage({
  body,
  recipientId = "255712345678",
}: SendMessageProps) {
  try {
    return await sendWebhookMessage(
      {
        from: recipientId,
        id: `wamid.${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        text: { body },
        type: "text",
      },
      recipientId
    )
  } catch (error) {
    console.error("Error sending WhatsApp message:", error)
    return { success: false as const, error: String(error) }
  }
}

export async function sendWhatsAppAudio(
  formData: FormData,
  recipientId = "255712345678"
) {
  try {
    const file = formData.get("audio")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Select a non-empty audio file")
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error("Audio files must be 16 MB or smaller")
    }
    const audioBase64 = Buffer.from(await file.arrayBuffer()).toString("base64")

    return await sendWebhookMessage(
      {
        from: recipientId,
        id: `wamid.${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        type: "audio",
        audio: {
          id: `mock-audio-${Date.now()}`,
          mime_type: file.type || "audio/ogg",
          voice: true,
          data: audioBase64,
        },
      },
      recipientId
    )
  } catch (error) {
    console.error("Error sending WhatsApp audio:", error)
    return { success: false as const, error: String(error) }
  }
}
