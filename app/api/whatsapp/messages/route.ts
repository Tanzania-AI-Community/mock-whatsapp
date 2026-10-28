import { appendEvent, readEvents } from "@/lib/localEvents"
import {
  checkLocalRequest,
  readPayloadSchema,
  takeFault,
  textPayloadSchema,
} from "@/lib/mockTransport"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json(
      { error: "Request body must be JSON" },
      { status: 400 }
    )
  }
  const text = textPayloadSchema.safeParse(input)
  const action = readPayloadSchema.safeParse(input)
  try {
    if (!text.success && !action.success) {
      const recipientId =
        typeof input === "object" &&
        input !== null &&
        "to" in input &&
        typeof input.to === "string"
          ? input.to
          : ""
      const error =
        "Invalid payload; P0 supports text and read/typing actions only"
      if (recipientId)
        await appendEvent({ kind: "rejected", recipientId, status: 422, error })
      return Response.json({ error }, { status: 422 })
    }
    let recipientId: string
    if (text.success) {
      recipientId = text.data.to
    } else {
      if (!action.success) throw new Error("Invalid read action")
      const inbound = (await readEvents()).find(
        (event) =>
          event.kind === "inbound" && event.messageId === action.data.message_id
      )
      if (!inbound)
        return Response.json(
          { error: "Unknown inbound message ID" },
          { status: 404 }
        )
      recipientId = inbound.recipientId
    }
    const fault = takeFault(text.success ? "text" : "action", recipientId)
    if (fault?.delayMs)
      await new Promise((resolve) => setTimeout(resolve, fault.delayMs))
    if (fault?.status) {
      const error = `Simulated WhatsApp rejection (${fault.status})`
      await appendEvent({
        kind: "rejected",
        recipientId,
        status: fault.status,
        error,
      })
      return Response.json(
        { error: { message: error } },
        { status: fault.status }
      )
    }
    if (text.success) {
      const messageId = `wamid.mock.${crypto.randomUUID()}`
      await appendEvent({
        kind: "outgoing",
        recipientId,
        messageId,
        payload: text.data,
      })
      return Response.json({
        messaging_product: "whatsapp",
        contacts: [{ input: recipientId, wa_id: recipientId }],
        messages: [{ id: messageId }],
      })
    }
    if (action.success) {
      await appendEvent({ kind: "action", recipientId, payload: action.data })
    }
    return Response.json({ success: true })
  } catch {
    return Response.json(
      { error: "Could not persist WhatsApp event" },
      { status: 503 }
    )
  }
}
