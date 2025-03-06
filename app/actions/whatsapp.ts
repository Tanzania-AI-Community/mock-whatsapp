"use server"

import { revalidatePath } from "next/cache"

import { env } from "../../env.js"

interface SendMessageProps {
  body: string
  recipientId?: string
}

/**
 * Sends a message to the WhatsApp Business API
 */
export async function sendWhatsAppMessage({
  body,
  recipientId = "255712345678",
}: SendMessageProps) {
  try {
    // Create the WhatsApp Business API payload format
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
                    profile: {
                      name: "John Doe",
                    },
                    wa_id: recipientId,
                  },
                ],
                messages: [
                  {
                    from: recipientId,
                    id: `wamid.${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000),
                    text: {
                      body: body,
                    },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    }

    const response = await fetch(env.CHATBOT_CALLBACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    console.log("WhatsApp API response:", response)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`WhatsApp API error: ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()

    // Revalidate the messages path to refresh the UI
    revalidatePath("/")

    return { success: true, data }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error)
    return { success: false, error: String(error) }
  }
}
