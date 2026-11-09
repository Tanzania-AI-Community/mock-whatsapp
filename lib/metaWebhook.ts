export const DEFAULT_RECIPIENT_ID = "255712345678"
export const BUSINESS_PHONE_NUMBER = "255712345678"

type InboundMessage = {
  type: string
  context?: { from: string; id: string }
} & Record<string, unknown>

// Wraps one user message in Meta's messages webhook envelope
export function buildMessageWebhook<T extends InboundMessage>({
  message,
  recipientId = DEFAULT_RECIPIENT_ID,
  messageId = `wamid.${crypto.randomUUID()}`,
}: {
  message: T
  recipientId?: string
  messageId?: string
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: 1234567890,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: BUSINESS_PHONE_NUMBER,
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
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000),
                  ...message,
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  }
}
