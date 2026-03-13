export interface OutboundImageMedia {
  mediaId: string
  mimeType: string
  fileName?: string
  sha256?: string
  caption?: string
}

interface BuildPseudoWhatsAppWebhookPayloadInput {
  recipientId: string
  body?: string
  images?: OutboundImageMedia[]
  now?: Date
  messageIdPrefix?: string
  wabaId?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  contactName?: string
}

interface WhatsAppTextMessage {
  from: string
  id: string
  timestamp: string
  type: "text"
  text: {
    body: string
  }
}

interface WhatsAppImageMessage {
  from: string
  id: string
  timestamp: string
  type: "image"
  image: {
    id: string
    mime_type: string
    filename?: string
    sha256?: string
    caption?: string
  }
}

type WhatsAppInboundMessage = WhatsAppTextMessage | WhatsAppImageMessage

interface PseudoWhatsAppWebhookPayload {
  object: "whatsapp_business_account"
  entry: Array<{
    id: string
    changes: Array<{
      field: "messages"
      value: {
        messaging_product: "whatsapp"
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts: Array<{
          profile: { name: string }
          wa_id: string
        }>
        messages: WhatsAppInboundMessage[]
      }
    }>
  }>
}

export function buildPseudoWhatsAppWebhookPayload({
  recipientId,
  body,
  images = [],
  now = new Date(),
  messageIdPrefix = `wamid.${now.getTime()}`,
  wabaId = "WABA_SANDBOX",
  phoneNumberId = "sandbox_phone_number_id",
  displayPhoneNumber = "sandbox",
  contactName = "Test User",
}: BuildPseudoWhatsAppWebhookPayloadInput): PseudoWhatsAppWebhookPayload {
  const unixTimestamp = String(Math.floor(now.getTime() / 1000))
  const trimmedBody = body?.trim() ?? ""

  const messages: WhatsAppInboundMessage[] = []

  if (trimmedBody) {
    messages.push({
      from: recipientId,
      id: `${messageIdPrefix}.text.1`,
      timestamp: unixTimestamp,
      type: "text",
      text: { body: trimmedBody },
    })
  }

  images.forEach((image, index) => {
    const imagePayload: WhatsAppImageMessage["image"] = {
      id: image.mediaId,
      mime_type: image.mimeType,
    }

    if (image.fileName) {
      imagePayload.filename = image.fileName
    }
    if (image.sha256) {
      imagePayload.sha256 = image.sha256
    }
    if (image.caption?.trim()) {
      imagePayload.caption = image.caption.trim()
    }

    messages.push({
      from: recipientId,
      id: `${messageIdPrefix}.image.${index + 1}`,
      timestamp: unixTimestamp,
      type: "image",
      image: imagePayload,
    })
  })

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: contactName },
                  wa_id: recipientId,
                },
              ],
              messages,
            },
          },
        ],
      },
    ],
  }
}
