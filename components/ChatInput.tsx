import { useEffect, useRef, useState } from "react"
import { Database, Mic, Paperclip, Send, Trash2 } from "lucide-react"

import { webmOpusToOgg } from "@/lib/oggOpus"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

// Media types WhatsApp users can send and the mock can store
const ATTACHMENT_TYPES =
  "image/jpeg,image/png,application/pdf,audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/amr"

// Firefox records WhatsApp's voice note format directly; Chrome records the same
// Opus audio in WebM, which is rewrapped before sending
const RECORDING_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"]

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onSendFile?: (file: File, caption: string) => void
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSendMessage,
  onSendFile,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) => {
  const [message, setMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null)
  const [isRequestingMic, setIsRequestingMic] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)

  // Releases the microphone if the composer goes away mid-recording
  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    },
    []
  )

  const sendRecording = async (chunks: Blob[], mimeType: string) => {
    try {
      const recording = new Uint8Array(await new Blob(chunks).arrayBuffer())
      const ogg = mimeType.startsWith("audio/ogg")
        ? recording
        : webmOpusToOgg(recording)
      onSendFile?.(
        new File([ogg], "voice-message.ogg", { type: "audio/ogg" }),
        ""
      )
    } catch {
      setRecordError("Could not prepare the voice message")
    }
  }

  const startRecording = async () => {
    setRecordError(null)
    const mimeType =
      typeof MediaRecorder === "undefined"
        ? undefined
        : RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType || !navigator.mediaDevices) {
      setRecordError("This browser cannot record Opus voice messages")
      return
    }

    setIsRequestingMic(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setRecordError("Microphone access is needed to record")
      return
    } finally {
      setIsRequestingMic(false)
    }

    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data)
    chunksRef.current = []
    recorderRef.current = recorder
    recorder.start()
    setRecordingSeconds(0)
    timerRef.current = setInterval(
      () => setRecordingSeconds((seconds) => (seconds ?? 0) + 1),
      1000
    )
  }

  const finishRecording = (send: boolean) => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorderRef.current = null
    clearInterval(timerRef.current)
    setRecordingSeconds(null)
    recorder.onstop = () => {
      if (send) void sendRecording(chunksRef.current, recorder.mimeType)
    }
    recorder.stop()
    recorder.stream.getTracks().forEach((track) => track.stop())
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  // Determine the input class based on disabled state
  const inputClasses = disabled ? "flex-1 bg-gray-100 text-gray-500" : "flex-1"

  if (recordingSeconds !== null) {
    const minutes = Math.floor(recordingSeconds / 60)
    const seconds = String(recordingSeconds % 60).padStart(2, "0")
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Cancel voice message"
          onClick={() => finishRecording(false)}
        >
          <Trash2 className="size-4" />
        </Button>
        <div
          role="status"
          aria-label="Recording voice message"
          className="flex flex-1 items-center gap-2 text-sm text-muted-foreground"
        >
          <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
          {minutes}:{seconds}
        </div>
        <Button
          type="button"
          size="icon"
          aria-label="Send voice message"
          disabled={disabled}
          className="shrink-0 transition-all duration-200"
          onClick={() => finishRecording(true)}
        >
          <Send className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      {recordError && (
        <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
          {recordError}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {disabled && (
          <div className="flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
            <Database className="mr-1 size-3" />
            Offline
          </div>
        )}
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_TYPES}
              className="hidden"
              data-testid="attachment-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                onSendFile(file, message.trim())
                setMessage("")
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Attach a file (the typed text becomes its caption)"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
          </>
        )}
        <Input
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setRecordError(null)
          }}
          placeholder={placeholder}
          className={inputClasses}
          disabled={disabled}
        />
        {onSendFile && !message.trim() ? (
          <Button
            key="record"
            type="button"
            size="icon"
            aria-label="Record a voice message"
            disabled={disabled || isRequestingMic}
            className="shrink-0 transition-all duration-200"
            onClick={() => void startRecording()}
          >
            <Mic className="size-4" />
          </Button>
        ) : (
          <Button
            key="send"
            type="submit"
            size="icon"
            disabled={disabled || !message.trim()}
            className="shrink-0 transition-all duration-200"
          >
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </>
  )
}
