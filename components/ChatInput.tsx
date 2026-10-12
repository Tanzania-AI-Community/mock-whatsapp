import { useRef, useState } from "react"
import { AudioLines, Database, Loader2, Send } from "lucide-react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onSendAudio: (file: File) => Promise<void>
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSendMessage,
  onSendAudio,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) => {
  const [message, setMessage] = useState("")
  const [isSendingAudio, setIsSendingAudio] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || disabled) return

    setIsSendingAudio(true)
    try {
      await onSendAudio(file)
    } finally {
      setIsSendingAudio(false)
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
        disabled={disabled}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.m4a"
        className="hidden"
        onChange={(event) => void handleAudioChange(event)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || isSendingAudio}
        onClick={() => audioInputRef.current?.click()}
        aria-label="Send audio file"
        title="Send audio file"
        className="shrink-0"
      >
        {isSendingAudio ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <AudioLines className="size-4" />
        )}
      </Button>
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !message.trim()}
        className="shrink-0 transition-all duration-200"
      >
        <Send className="size-4" />
      </Button>
    </form>
  )
}
