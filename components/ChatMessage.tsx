import { memo, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Check, CheckCheck } from "lucide-react"

import { type Message } from "@/types/chat"
import { cn } from "@/lib/utils"

interface ChatMessageProps {
  message: Message
}

// Create a comparison function for memoization
const areEqual = (prevProps: ChatMessageProps, nextProps: ChatMessageProps) => {
  // Compare important properties that would affect rendering
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.isTemp === nextProps.message.isTemp
  )
}

const ChatMessageComponent = ({ message }: ChatMessageProps) => {
  const isSender = message.role === "user"
  const isTemporary = message.isTemp === true

  // State for fading animation
  const [opacity, setOpacity] = useState(isTemporary ? 0 : 1)

  // Apply fade-in effect for temporary messages
  useEffect(() => {
    if (isTemporary) {
      setTimeout(() => setOpacity(0.7), 50)
    }
  }, [isTemporary])

  // Memoize expensive calculations
  const messageTime = useMemo(() => {
    try {
      // Try using timestamp (seconds)
      if (message.timestamp) {
        return new Date(message.timestamp * 1000)
      }

      // Try using created_at if it's a Date object
      if (message.created_at instanceof Date) {
        return message.created_at
      }

      // Try parsing created_at if it's a string or number
      if (message.created_at) {
        return new Date(message.created_at)
      }

      // Fallback to current time
      return new Date()
    } catch (e) {
      console.error("Error parsing message time:", e)
      return new Date()
    }
  }, [message.timestamp, message.created_at])

  // Memoize status icon
  const statusIcon = useMemo(() => {
    if (!isSender) return null

    switch (message.status) {
      case "sending":
        return <Check className="size-4 text-muted-foreground opacity-50" />
      case "sent":
        return <CheckCheck className="size-4 text-muted-foreground" />
      case "error":
        return <Check className="size-4 text-destructive" />
      default:
        return <Check className="size-4 text-muted-foreground" />
    }
  }, [isSender, message.status])

  return (
    <div
      // eslint-disable-next-line tailwindcss/no-custom-classname
      className={cn(
        `message-appear flex flex-col space-y-1 ${isSender ? "items-end" : "items-start"}`,
        isTemporary && "animate-pulse",
        { "opacity-70": isTemporary }
      )}
      style={{ transition: "opacity 0.3s ease-in-out" }}
    >
      <div
        className={`flex max-w-[70%] flex-col ${isSender ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-2xl px-4 py-2 ${
            isSender
              ? "rounded-tr-sm bg-[#e7ffd9] text-foreground"
              : "rounded-tl-sm bg-white text-foreground"
          }`}
        >
          <p className="break-words text-[15px] leading-relaxed">
            {message.content}
          </p>
          <div className="-mb-1 flex items-center justify-end space-x-1">
            <span className="text-xs text-muted-foreground">
              {format(messageTime, "HH:mm")}
            </span>
            {statusIcon}
          </div>
        </div>
      </div>
    </div>
  )
}

// Export the memoized component
export const ChatMessage = memo(ChatMessageComponent, areEqual)
