import { useEffect, useRef, useState } from "react"
import { Database, Loader2, Mic, Send, Square, Trash2 } from "lucide-react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

const MAX_RECORDING_SECONDS = 120

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onSendAudio: (file: File) => Promise<void>
  audioStatus?: string | null
  audioError?: string | null
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  onSendMessage,
  onSendAudio,
  audioStatus,
  audioError,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) => {
  const [message, setMessage] = useState("")
  const [isSendingAudio, setIsSendingAudio] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recording, setRecording] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isRecording) return
    const interval = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds + 1 >= MAX_RECORDING_SECONDS)
          mediaRecorderRef.current?.stop()
        return seconds + 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const clearRecording = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setRecording(null)
    setRecordingSeconds(0)
  }

  const prepareRecording = (file: File) => {
    clearRecording()
    setRecording(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  const handleAudioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file && !disabled) prepareRecording(file)
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
      setRecordingError(null)
      clearRecording()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      streamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        const blob = new Blob(chunks, { type: recorder.mimeType })
        if (blob.size === 0) return
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm"
        prepareRecording(
          new File([blob], `voice-message.${extension}`, {
            type: recorder.mimeType,
          })
        )
      }

      recorder.start()
      setRecordingSeconds(0)
      setIsRecording(true)
    } catch (error) {
      console.error("Unable to access microphone:", error)
      setRecordingError(
        "Microphone access was denied. Allow access in the browser and try again."
      )
    }
  }

  const sendRecording = async () => {
    if (!recording) return
    setIsSendingAudio(true)
    try {
      await onSendAudio(recording)
      clearRecording()
    } finally {
      setIsSendingAudio(false)
    }
  }

  const formattedTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`
  return (
    <div className="space-y-2">
      {(isRecording || recording) && (
        <div className="flex items-center gap-2 rounded-md bg-muted p-2">
          {isRecording ? (
            <>
              <span className="size-2 animate-pulse rounded-full bg-red-600" />
              <span className="text-sm font-medium">
                Recording {formattedTime}
              </span>
              <span className="text-xs text-muted-foreground">
                2:00 maximum
              </span>
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={() => mediaRecorderRef.current?.stop()}
              >
                <Square className="mr-1 size-3 fill-current" /> Stop
              </Button>
            </>
          ) : (
            <>
              {previewUrl && (
                <audio
                  src={previewUrl}
                  controls
                  className="h-8 min-w-0 flex-1"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearRecording}
                aria-label="Cancel recording"
              >
                <Trash2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSendingAudio}
                onClick={() => void sendRecording()}
              >
                {isSendingAudio ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Send className="mr-1 size-4" />
                )}
                Send
              </Button>
            </>
          )}
        </div>
      )}

      {(audioStatus || audioError || recordingError) && (
        <p
          className={
            audioError || recordingError
              ? "text-xs text-red-600"
              : "text-xs text-muted-foreground"
          }
          role="status"
        >
          {recordingError ?? audioError ?? audioStatus}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {disabled && (
          <div className="flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
            <Database className="mr-1 size-3" /> Offline
          </div>
        )}
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={disabled ? "flex-1 bg-gray-100 text-gray-500" : "flex-1"}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*,.m4a"
          className="hidden"
          onChange={handleAudioChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || isSendingAudio || !!recording}
          onClick={() => void handleRecord()}
          aria-label={isRecording ? "Stop recording" : "Record voice message"}
          title={isRecording ? "Stop recording" : "Record voice message"}
          className={isRecording ? "shrink-0 text-red-600" : "shrink-0"}
        >
          {isRecording ? (
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
    </div>
  )
}
