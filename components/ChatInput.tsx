import { useState } from "react"
import { Database, Send } from "lucide-react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

interface ChatInputProps {
  onSendMessage: (message: string) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSendMessage,
  isLoading,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) => {
  const [message, setMessage] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading && !disabled) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  // Determine the input class based on disabled state
  const inputClasses = disabled ? "flex-1 bg-gray-100 text-gray-500" : "flex-1"

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {disabled && (
        <div className="flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
          <Database className="mr-1 size-3" />
          Offline
        </div>
      )}
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder}
        className={inputClasses}
        disabled={isLoading || disabled}
      />
      <Button
        type="submit"
        size="icon"
        disabled={isLoading || disabled || !message.trim()}
        className="shrink-0 transition-all duration-200"
      >
        <Send className="size-4" />
      </Button>
    </form>
  )
}
