import { type Message } from "@/types/chat"
import { type LocalEvent, type OutgoingPayload } from "@/types/events"

function outgoingMessage(payload: OutgoingPayload): Partial<Message> {
  switch (payload.type) {
    case "text":
      return { content: payload.text.body }
    case "image":
      return {
        content: payload.image.caption ?? "",
        media: { kind: "image", id: payload.image.id },
      }
    case "document":
      return {
        content: payload.document.caption ?? "",
        media: {
          kind: "document",
          id: payload.document.id,
          filename: payload.document.filename,
        },
      }
    case "interactive":
      return {
        content: payload.interactive.body.text,
        interactive: payload.interactive,
      }
  }
}

export function projectChat(events: LocalEvent[]) {
  const messages = new Map<string, Message>()
  const errors: { seq: number; error: string }[] = []
  let typingUntil = 0
  for (const event of events) {
    switch (event.kind) {
      case "inbound":
        messages.set(event.messageId, {
          id: event.messageId,
          role: "user",
          content: event.body,
          eventSeq: event.seq,
          timestamp: event.time / 1000,
          status: "sent",
          ...(event.media
            ? {
                media: {
                  kind: event.media.type,
                  id: event.media.id,
                  mimeType: event.media.mimeType,
                  filename: event.media.filename,
                },
              }
            : {}),
          ...(event.reply ? { reply: event.reply } : {}),
        })
        break
      case "forwarded": {
        const message = messages.get(event.messageId)
        if (message && event.error) {
          message.status = "error"
          message.error = event.error
        }
        if (event.error) errors.push({ seq: event.seq, error: event.error })
        break
      }
      case "outgoing":
        messages.set(event.messageId, {
          id: event.messageId,
          role: "assistant",
          content: "",
          eventSeq: event.seq,
          timestamp: event.time / 1000,
          status: "sent",
          ...outgoingMessage(event.payload),
        })
        typingUntil = 0
        break
      case "action": {
        const message = messages.get(event.payload.message_id)
        if (message) message.read = true
        if (event.payload.typing_indicator) typingUntil = event.time + 25000
        break
      }
      case "media_deleted":
        for (const message of messages.values()) {
          if (message.media?.id === event.mediaId)
            message.media.serverCopyDeleted = true
        }
        break
      case "rejected":
        errors.push({ seq: event.seq, error: event.error })
        break
    }
  }
  return { messages: [...messages.values()], errors, typingUntil }
}

export function reconcileInbound(pending: Message[], saved: Message[]) {
  const ids = new Set(saved.map((message) => message.id))
  return pending.filter((message) => !ids.has(message.id))
}
