export interface TextPayload {
  messaging_product: "whatsapp"
  to: string
  type: "text"
  text: { body: string }
}

export interface ImagePayload {
  messaging_product: "whatsapp"
  to: string
  type: "image"
  image: { id: string; caption?: string }
}

export interface DocumentPayload {
  messaging_product: "whatsapp"
  to: string
  type: "document"
  document: { id: string; caption?: string; filename?: string }
}

export interface ReplyButton {
  type: "reply"
  reply: { id: string; title: string }
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface FlowParameters {
  flow_message_version: string
  flow_token: string
  flow_id?: string
  flow_name?: string
  flow_cta: string
  flow_action?: "navigate" | "data_exchange"
  mode?: string
  flow_action_payload?: { screen: string; data?: Record<string, unknown> }
}

interface InteractiveText {
  header?: { type: "text"; text: string }
  body: { text: string }
  footer?: { text: string }
}

export type Interactive = InteractiveText &
  (
    | { type: "button"; action: { buttons: ReplyButton[] } }
    | {
        type: "list"
        action: {
          button: string
          sections: { title?: string; rows: ListRow[] }[]
        }
      }
    | { type: "flow"; action: { name: "flow"; parameters: FlowParameters } }
  )

export interface InteractivePayload {
  messaging_product: "whatsapp"
  to: string
  type: "interactive"
  interactive: Interactive
}

export type OutgoingPayload =
  TextPayload | ImagePayload | DocumentPayload | InteractivePayload

export interface ReadPayload {
  messaging_product: "whatsapp"
  status: "read"
  message_id: string
  typing_indicator?: { type: "text" }
}

export type InboundMedia = {
  type: "image" | "audio" | "document"
  id: string
  mimeType: string
  filename?: string
  caption?: string
}

export type InboundReply =
  | { type: "button_reply" | "list_reply"; id: string; title: string }
  | { type: "nfm_reply"; response: Record<string, unknown> }

export type EventData = { recipientId: string } & (
  | {
      kind: "inbound"
      messageId: string
      body: string
      contextId?: string
      reply?: InboundReply
      media?: InboundMedia
    }
  | { kind: "forwarded"; messageId: string; error?: string }
  | { kind: "outgoing"; messageId: string; payload: OutgoingPayload }
  | { kind: "action"; payload: ReadPayload }
  | { kind: "rejected"; status: number; error: string }
  | { kind: "media_deleted"; mediaId: string }
)

export type LocalEvent = EventData & { seq: number; time: number }
