export const DEFAULT_RECIPIENT_ID = "255712345678"

interface TextMessageWebhookProps {
  body: string
  recipientId?: string
}

export function buildTextMessageWebhook({
  body,
  recipientId = DEFAULT_RECIPIENT_ID,
}: TextMessageWebhookProps) {
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
                  id: `wamid.${crypto.randomUUID()}`,
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
}
