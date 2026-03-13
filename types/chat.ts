export type MessageRole = "user" | "assistant" | "tool" | "system"

// New type for displayed message roles only
export type DisplayMessageRole = "user" | "assistant"

// Helper function to check if a role is a display role
export function isDisplayRole(role: MessageRole): role is DisplayMessageRole {
  return role === "user" || role === "assistant"
}

export interface Message {
  id: string | number
  user_id?: number
  role: MessageRole
  content: string | null
  images?: ChatImageAttachment[]
  tool_name?: string | null
  created_at?: string | Date | number
  timestamp?: number
  status?: "sending" | "sent" | "error"
  isTemp?: boolean // Flag for temporary messages
}

export interface ChatImageAttachment {
  id: string
  mimeType: string
  url?: string
  fileName?: string
  caption?: string
}

export interface OutboundImageUpload {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string
  size: number
}

// User state definitions from Python schema
export type UserState = "new" | "active" | "inactive" | "blocked"
export type OnboardingState = "new" | "started" | "completed"
export type Role = "teacher" | "student" | "admin"

export interface User {
  id: number
  name?: string
  wa_id: string
  state: UserState
  onboarding_state?: OnboardingState
  role: Role
  class_info?: Record<string, string[]> | null
  school_name?: string | null
  birthday?: string | Date | null
  region?: string | null
  last_message_at?: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}
