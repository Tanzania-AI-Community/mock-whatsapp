export interface TextPayload {
  messaging_product: "whatsapp"
  to: string
  type: "text"
  text: { body: string }
}

export interface ReadPayload {
  messaging_product: "whatsapp"
  status: "read"
  message_id: string
  typing_indicator?: { type: "text" }
}

export type EventData = { recipientId: string } & (
  | { kind: "inbound"; messageId: string; body: string }
  | { kind: "forwarded"; messageId: string; error?: string }
  | { kind: "outgoing"; messageId: string; payload: TextPayload }
  | { kind: "action"; payload: ReadPayload }
  | { kind: "rejected"; status: number; error: string }
)

export type LocalEvent = EventData & { seq: number; time: number }
