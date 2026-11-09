import { createContext, useContext } from "react"

export interface ChatActions {
  reply: (
    contextId: string,
    type: "button_reply" | "list_reply",
    optionId: string
  ) => void
  openFlow: (messageId: string) => void
}

// Absent in observe mode, which renders the same messages read-only
export const ChatActionsContext = createContext<ChatActions | null>(null)
export const useChatActions = () => useContext(ChatActionsContext)
