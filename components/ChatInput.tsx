import { useEffect, useRef, useState } from "react"
import { Database, Loader2, Mic, Send, Trash2 } from "lucide-react"

import { Button } from "./ui/button"
import { Input } from "./ui/input"

const MAX_RECORDING_SECONDS = 120
const WAVEFORM_BARS = 18

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onSendAudio: (file: File, durationSeconds: number) => Promise<void>
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
  const [isRecording, setIsRecording] = useState(false)
  const [isSendingAudio, setIsSendingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>(
    Array.from({ length: WAVEFORM_BARS }, () => 0.12)
  )
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const shouldSendRef = useRef(false)
  const durationRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const stopWaveform = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    void audioContextRef.current?.close()
    audioContextRef.current = null
    setWaveform(Array.from({ length: WAVEFORM_BARS }, () => 0.12))
  }

  const startWaveform = (stream: MediaStream) => {
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.72
    audioContext.createMediaStreamSource(stream).connect(analyser)
    audioContextRef.current = audioContext
    const frequencies = new Uint8Array(analyser.frequencyBinCount)

    const update = () => {
      analyser.getByteFrequencyData(frequencies)
      setWaveform(
        Array.from({ length: WAVEFORM_BARS }, (_, index) => {
          const bin = Math.floor((index / WAVEFORM_BARS) * frequencies.length)
          return Math.min(1, 0.12 + frequencies[bin] / 150)
        })
      )
      animationFrameRef.current = requestAnimationFrame(update)
    }
    update()
  }

  useEffect(() => {
    durationRef.current = recordingSeconds
  }, [recordingSeconds])

  useEffect(() => {
    if (!isRecording) return
    const interval = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        const next = seconds + 1
        if (next >= MAX_RECORDING_SECONDS) {
          shouldSendRef.current = true
          mediaRecorderRef.current?.stop()
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      void audioContextRef.current?.close()
    }
  }, [])

  const stopStream = () => {
    stopWaveform()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage("")
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecordingError("This browser does not support voice recording.")
      return
    }

    try {
      setRecordingError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      startWaveform(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      shouldSendRef.current = false
      setRecordingSeconds(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const shouldSend = shouldSendRef.current
        const duration = durationRef.current
        setIsRecording(false)
        stopStream()
        if (!shouldSend) return

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        if (blob.size === 0) {
          setRecordingError("No audio was captured. Please try again.")
          return
        }
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm"
        setIsSendingAudio(true)
        try {
          await onSendAudio(
            new File([blob], `voice-message.${extension}`, {
              type: recorder.mimeType,
            }),
            duration
          )
        } finally {
          setIsSendingAudio(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Unable to access microphone:", error)
      stopStream()
      setRecordingError(
        "Microphone access was denied. Allow access in the browser and try again."
      )
    }
  }

  const finishRecording = (send: boolean) => {
    shouldSendRef.current = send
    mediaRecorderRef.current?.stop()
  }

  const formattedTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`

  return (
    <div className="space-y-2">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-11 items-center gap-2"
      >
        {disabled && (
          <div className="flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">
            <Database className="mr-1 size-3" /> Offline
          </div>
        )}

        {isRecording ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-muted px-3 py-2">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="min-w-11 text-sm font-medium tabular-nums">
              {formattedTime}
            </span>
            <div
              className="flex h-5 flex-1 items-center justify-center gap-1 overflow-hidden"
              aria-hidden="true"
            >
              {waveform.map((level, index) => (
                <span
                  key={index}
                  className="h-5 w-1 shrink-0 origin-center rounded-full bg-primary/65 transition-transform duration-100 ease-linear motion-reduce:transition-none"
                  style={{ transform: `scaleY(${level})` }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">2:00 max</span>
          </div>
        ) : (
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={placeholder}
            disabled={disabled || isSendingAudio}
            className={disabled ? "flex-1 bg-gray-100 text-gray-500" : "flex-1"}
          />
        )}

        {isRecording ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => finishRecording(false)}
              aria-label="Cancel recording"
              title="Cancel recording"
            >
              <Trash2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => finishRecording(true)}
              aria-label="Send voice message"
              title="Send voice message"
            >
              <Send className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || isSendingAudio}
              onClick={() => void startRecording()}
              aria-label="Record voice message"
              title="Record voice message"
            >
              {isSendingAudio ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={disabled || !message.trim() || isSendingAudio}
              className="shrink-0 transition-all duration-200"
            >
              <Send className="size-4" />
            </Button>
          </>
        )}
      </form>

      {(audioStatus || audioError || recordingError) && (
        <p
          className={
            audioError || recordingError
              ? "px-2 text-xs text-red-600"
              : "px-2 text-xs text-muted-foreground"
          }
          role="status"
        >
          {recordingError ?? audioError ?? audioStatus}
        </p>
      )}
    </div>
  )
}
