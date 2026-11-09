import { z } from "zod"

import { getAppMode } from "@/lib/appMode"
import { forwardInbound } from "@/lib/inbound"
import { readEvents } from "@/lib/localEvents"
import {
  baseMimeType,
  MAX_MEDIA_BYTES,
  MediaError,
  mediaLimits,
  saveMedia,
} from "@/lib/mediaStore"
import { BUSINESS_PHONE_NUMBER, DEFAULT_RECIPIENT_ID } from "@/lib/metaWebhook"
import { checkLocalRequest } from "@/lib/mockTransport"

export const runtime = "nodejs"

const recipientId = z.string().regex(/^\d+$/).default(DEFAULT_RECIPIENT_ID)
const messageId = z
  .string()
  .regex(/^wamid\.[\w.-]+$/)
  .optional()

const inputSchema = z.union([
  z.object({
    body: z.string().refine((body) => body.trim().length > 0),
    recipientId,
    messageId,
  }),
  z.object({
    reply: z.object({
      type: z.enum(["button_reply", "list_reply"]),
      id: z.string().min(1),
    }),
    contextId: z.string().min(1),
    recipientId,
    messageId,
  }),
])

const invalid = (error: string) =>
  Response.json({ success: false, error }, { status: 400 })

// Users can only tap options that Twiga actually sent them
async function findReplyOption(
  recipient: string,
  contextId: string,
  type: "button_reply" | "list_reply",
  optionId: string
) {
  const sent = (await readEvents()).find(
    (event) =>
      event.kind === "outgoing" &&
      event.recipientId === recipient &&
      event.messageId === contextId
  )
  if (sent?.kind !== "outgoing" || sent.payload.type !== "interactive")
    return null
  const interactive = sent.payload.interactive
  if (type === "button_reply" && interactive.type === "button") {
    const button = interactive.action.buttons.find(
      (b) => b.reply.id === optionId
    )
    return button ? { id: button.reply.id, title: button.reply.title } : null
  }
  if (type === "list_reply" && interactive.type === "list") {
    const row = interactive.action.sections
      .flatMap((section) => section.rows)
      .find((r) => r.id === optionId)
    return row
      ? {
          id: row.id,
          title: row.title,
          ...(row.description ? { description: row.description } : {}),
        }
      : null
  }
  return null
}

async function handleMedia(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_MEDIA_BYTES + 65536)
    return invalid("Media exceeds the 100 MB limit")
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const fields = z
    .object({
      recipientId,
      messageId,
      caption: z.string().max(1024).optional(),
    })
    .safeParse({
      recipientId: form?.get("recipientId") ?? undefined,
      messageId: form?.get("messageId") ?? undefined,
      caption: form?.get("caption") || undefined,
    })
  if (!(file instanceof File) || !fields.success)
    return invalid("A media file and valid recipient are required")

  const mimeType = baseMimeType(file.type)
  const type = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("audio/")
      ? "audio"
      : "document"
  let media
  try {
    media = await saveMedia(file, {
      direction: "inbound",
      allowed: new Set(Object.keys(mediaLimits)),
      filename: file.name,
    })
  } catch (error) {
    if (error instanceof MediaError) return invalid(error.message)
    throw error
  }
  // WhatsApp audio messages have no caption
  const caption = type === "audio" ? undefined : fields.data.caption
  const id = fields.data.messageId ?? `wamid.${crypto.randomUUID()}`
  // WhatsApp voice notes are Opus in OGG; other types report their plain MIME type
  const reported =
    mimeType === "audio/ogg" ? "audio/ogg; codecs=opus" : mimeType
  const details = {
    ...(caption ? { caption } : {}),
    mime_type: reported,
    sha256: media.sha256,
    id: media.id,
    ...(type === "document" ? { filename: media.filename } : {}),
    ...(type === "audio" ? { voice: mimeType === "audio/ogg" } : {}),
  }
  return forwardInbound(
    {
      recipientId: fields.data.recipientId,
      messageId: id,
      body: caption ?? "",
      media: {
        type,
        id: media.id,
        mimeType: media.mimeType,
        filename: media.filename,
        caption,
      },
    },
    { type, [type]: details }
  )
}

export async function POST(request: Request) {
  if (getAppMode() === "observe") {
    return Response.json(
      { success: false, error: "OBSERVE_MODE_READ_ONLY" },
      { status: 403 }
    )
  }

  const denied = checkLocalRequest(request)
  if (denied) return denied
  if (request.headers.get("content-type")?.startsWith("multipart/form-data"))
    return handleMedia(request)

  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return invalid("A message body and valid recipient are required")
  const input = parsed.data
  const id = input.messageId ?? `wamid.${crypto.randomUUID()}`

  if ("body" in input) {
    return forwardInbound(
      { recipientId: input.recipientId, messageId: id, body: input.body },
      { type: "text", text: { body: input.body } }
    )
  }

  const option = await findReplyOption(
    input.recipientId,
    input.contextId,
    input.reply.type,
    input.reply.id
  )
  if (!option) return invalid("That option was not sent in this chat")
  return forwardInbound(
    {
      recipientId: input.recipientId,
      messageId: id,
      body: option.title,
      contextId: input.contextId,
      reply: { type: input.reply.type, id: option.id, title: option.title },
    },
    {
      type: "interactive",
      context: { from: BUSINESS_PHONE_NUMBER, id: input.contextId },
      interactive: { type: input.reply.type, [input.reply.type]: option },
    }
  )
}
