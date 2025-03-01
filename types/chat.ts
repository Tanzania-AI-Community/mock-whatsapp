export type MessageRole = "user" | "assistant" | "tool" | "system"

export interface Message {
  id: string
  role: MessageRole
  content: string | null
  timestamp: number
}
