import { format } from "date-fns"
import { Check } from "lucide-react"

import { type Message } from "@/types/chat"

interface ChatMessageProps {
  message: Message
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isSender = message.role === "user"

  return (
    <div
      // eslint-disable-next-line tailwindcss/no-custom-classname
      className={`message-appear flex flex-col space-y-1 ${isSender ? "items-end" : "items-start"}`}
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
              {format(new Date(message.timestamp * 1000), "HH:mm")}
            </span>
            {isSender && <Check className="size-4 text-muted-foreground" />}
          </div>
        </div>
      </div>
    </div>
  )
}
