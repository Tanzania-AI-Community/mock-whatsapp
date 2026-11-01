import { type Message } from "@/types/chat"
import { type LocalEvent } from "@/types/events"

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
          content: event.payload.text.body,
          eventSeq: event.seq,
          timestamp: event.time / 1000,
          status: "sent",
        })
        typingUntil = 0
        break
      case "action": {
        const message = messages.get(event.payload.message_id)
        if (message) message.read = true
        if (event.payload.typing_indicator) typingUntil = event.time + 25000
        break
      }
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
