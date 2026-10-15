import { useEffect, useRef, useState } from "react"
import { Database, Loader2, Mic, Send, Square } from "lucide-react"

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
  const [isRecording, setIsRecording] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

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

  const handleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      audioInputRef.current?.click()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      streamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = async () => {
        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null

        const blob = new Blob(chunks, { type: recorder.mimeType })
        if (blob.size === 0) return

        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm"
        setIsSendingAudio(true)
        try {
          await onSendAudio(
            new File([blob], `voice-message.${extension}`, {
              type: recorder.mimeType,
            })
          )
        } finally {
          setIsSendingAudio(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Unable to access microphone:", error)
      window.alert("Microphone access is required to record a voice message.")
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
        onClick={() => void handleRecord()}
        aria-label={
          isRecording ? "Stop and send recording" : "Record voice message"
        }
        title={isRecording ? "Stop and send" : "Record voice message"}
        className={isRecording ? "shrink-0 text-red-600" : "shrink-0"}
      >
        {isSendingAudio ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isRecording ? (
          <Square className="size-4 fill-current" />
        ) : (
          <Mic className="size-4" />
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
