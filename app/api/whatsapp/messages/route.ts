import type { OutgoingPayload } from "@/types/events"
import { appendEvent, readEvents } from "@/lib/localEvents"
import {
  MediaError,
  safeFilename,
  updateMedia,
  type MediaRecord,
} from "@/lib/mediaStore"
import {
  applyFault,
  checkLocalRequest,
  issueDetails,
  outgoingSchemas,
  readPayloadSchema,
  whatsappError,
} from "@/lib/mockTransport"

export const runtime = "nodejs"

function recipientOf(input: unknown) {
  return typeof input === "object" &&
    input !== null &&
    "to" in input &&
    typeof input.to === "string"
    ? input.to
    : ""
}

async function reject(
  recipientId: string,
  status: number,
  code: number,
  details: string
) {
  if (recipientId)
    await appendEvent({ kind: "rejected", recipientId, status, error: details })
  return whatsappError(status, code, details)
}

// Media sends must reference an uploaded, undeleted file of a fitting type
function checkMedia(payload: OutgoingPayload, media: MediaRecord) {
  if (payload.type !== "image" && payload.type !== "document") return null
  const id = payload.type === "image" ? payload.image.id : payload.document.id
  if (media.direction !== "outgoing") return `Media ID ${id} was not found`
  if (media.deletedAt) return `Media ID ${id} was deleted`
  if (payload.type === "image" && !media.mimeType.startsWith("image/"))
    return `Media ID ${id} is ${media.mimeType}, not an image`
  return null
}

export async function POST(request: Request) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return whatsappError(400, 100, "Request body must be JSON")
  }
  try {
    const action = readPayloadSchema.safeParse(input)
    if (action.success) {
      const inbound = (await readEvents()).find(
        (event) =>
          event.kind === "inbound" && event.messageId === action.data.message_id
      )
      if (!inbound) return whatsappError(404, 100, "Unknown inbound message ID")
      const fault = await applyFault("action", inbound.recipientId)
      if (fault)
        return reject(inbound.recipientId, fault.status, 131000, fault.error)
      await appendEvent({
        kind: "action",
        recipientId: inbound.recipientId,
        payload: action.data,
      })
      return Response.json({ success: true })
    }

    const recipientId = recipientOf(input)
    const type =
      typeof input === "object" && input !== null && "type" in input
        ? String(input.type)
        : ""
    if (!(type in outgoingSchemas)) {
      return reject(
        recipientId,
        400,
        100,
        `Unsupported message type: ${type || "missing"}`
      )
    }
    const parsed =
      outgoingSchemas[type as keyof typeof outgoingSchemas].safeParse(input)
    if (!parsed.success)
      return reject(recipientId, 400, 131009, issueDetails(parsed.error))
    const payload = parsed.data as OutgoingPayload
    const fault = await applyFault(payload.type, recipientId)
    if (fault) return reject(recipientId, fault.status, 131000, fault.error)

    const messageId = `wamid.mock.${crypto.randomUUID()}`
    if (payload.type === "image" || payload.type === "document") {
      const id =
        payload.type === "image" ? payload.image.id : payload.document.id
      const delivered = await updateMedia(id, async (media) => {
        const error = checkMedia(payload, media)
        if (error) throw new MediaError(error)
        await appendEvent({ kind: "outgoing", recipientId, messageId, payload })
        return {
          ...media,
          deliveredTo: media.deliveredTo ?? recipientId,
          ...(payload.type === "document" && payload.document.filename
            ? { filename: safeFilename(payload.document.filename) }
            : {}),
        }
      })
      if (!delivered)
        return reject(recipientId, 400, 131009, `Media ID ${id} was not found`)
    } else {
      await appendEvent({ kind: "outgoing", recipientId, messageId, payload })
    }
    return Response.json({
      messaging_product: "whatsapp",
      contacts: [{ input: recipientId, wa_id: recipientId }],
      messages: [{ id: messageId }],
    })
  } catch (error) {
    if (error instanceof MediaError)
      return reject(recipientOf(input), error.status, 131009, error.message)
    return Response.json(
      { error: "Could not persist WhatsApp event" },
      { status: 503 }
    )
  }
}
