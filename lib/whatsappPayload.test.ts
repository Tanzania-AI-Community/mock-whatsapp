import assert from "node:assert/strict"
import test from "node:test"

import { buildPseudoWhatsAppWebhookPayload } from "./whatsappPayload"

test("builds a valid Meta-style payload for text-only messages", () => {
  const payload = buildPseudoWhatsAppWebhookPayload({
    recipientId: "user_abc",
    body: "Hello from mock whatsapp",
    now: new Date("2026-01-10T09:10:11.000Z"),
    messageIdPrefix: "wamid.test_text_only",
    wabaId: "WABA_SANDBOX",
  })

  const messages = payload.entry[0]?.changes[0]?.value.messages
  assert.equal(payload.object, "whatsapp_business_account")
  assert.equal(messages?.length, 1)
  const textMessage = messages?.[0]
  assert.equal(textMessage?.type, "text")
  assert.equal(textMessage?.id, "wamid.test_text_only.text.1")
  assert.equal(textMessage?.timestamp, "1768036211")
  if (textMessage?.type !== "text") {
    assert.fail("Expected text message")
  }
  assert.equal(textMessage.text.body, "Hello from mock whatsapp")
})

test("builds image-only payloads using media_id objects (without bytes)", () => {
  const payload = buildPseudoWhatsAppWebhookPayload({
    recipientId: "user_abc",
    images: [
      {
        mediaId: "media_001",
        mimeType: "image/png",
        fileName: "first.png",
      },
      {
        mediaId: "media_002",
        mimeType: "image/jpeg",
        fileName: "second.jpg",
      },
    ],
    now: new Date("2026-01-10T09:10:11.000Z"),
    messageIdPrefix: "wamid.test_images_only",
  })

  const messages = payload.entry[0]?.changes[0]?.value.messages
  assert.equal(messages?.length, 2)
  const [firstImage, secondImage] = messages ?? []
  assert.equal(firstImage?.type, "image")
  if (firstImage?.type !== "image") {
    assert.fail("Expected first image message")
  }
  assert.equal(firstImage.image.id, "media_001")
  assert.equal(firstImage.image.mime_type, "image/png")
  assert.equal(firstImage.image.filename, "first.png")

  assert.equal(secondImage?.type, "image")
  if (secondImage?.type !== "image") {
    assert.fail("Expected second image message")
  }
  assert.equal(secondImage.image.id, "media_002")
  assert.equal(secondImage.image.mime_type, "image/jpeg")
  assert.equal(secondImage.image.filename, "second.jpg")
})

test("supports text and images together in the same webhook delivery", () => {
  const payload = buildPseudoWhatsAppWebhookPayload({
    recipientId: "user_abc",
    body: "Here are the images",
    images: [
      {
        mediaId: "media_100",
        mimeType: "image/webp",
      },
    ],
    now: new Date("2026-01-10T09:10:11.000Z"),
    messageIdPrefix: "wamid.test_text_and_image",
  })

  const messages = payload.entry[0]?.changes[0]?.value.messages ?? []
  assert.deepEqual(
    messages.map((message) => message.type),
    ["text", "image"]
  )
  const [textMessage, imageMessage] = messages
  assert.equal(textMessage?.type, "text")
  assert.equal(imageMessage?.type, "image")
  if (textMessage?.type !== "text" || imageMessage?.type !== "image") {
    assert.fail("Expected text message followed by image message")
  }
  assert.equal(textMessage.text.body, "Here are the images")
  assert.equal(imageMessage.image.id, "media_100")
  assert.equal(imageMessage.timestamp, "1768036211")
})
