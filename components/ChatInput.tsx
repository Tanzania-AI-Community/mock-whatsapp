import { useState } from "react"
import { Send } from "lucide-react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

interface ChatInputProps {
  onSendMessage: (message: string) => void
  isLoading?: boolean
}

export const ChatInput = ({ onSendMessage, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        className="flex-1"
        disabled={isLoading}
      />
      <Button
        type="submit"
        size="icon"
        disabled={isLoading || !message.trim()}
        className="shrink-0 transition-all duration-200"
      >
        <Send className="size-4" />
      </Button>
    </form>
  )
}
