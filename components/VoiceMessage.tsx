import { useRef, useState } from "react"
import { Mic, Pause, Play } from "lucide-react"

import { type Message } from "@/types/chat"

interface VoiceMessageProps {
  message: Message
}

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

export const VoiceMessage = ({ message }: VoiceMessageProps) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const duration = message.audioDurationSeconds ?? 0

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }

  const seek = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = duration * value
    setProgress(value)
  }

  return (
    <div className="w-[280px] max-w-full">
      <audio
        ref={audioRef}
        src={message.audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          if (audio.duration) setProgress(audio.currentTime / audio.duration)
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-primary"
            aria-label="Voice message playback position"
          />
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {formatDuration(duration * progress)}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Mic className="size-3" /> {formatDuration(duration)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-foreground/10 pt-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          Transcript
        </p>
        <p className="mt-0.5 break-words text-sm leading-relaxed">
          {message.isTemp ? "Transcribing…" : message.content}
        </p>
        {!message.isTemp && message.transcriptionModel && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {message.transcriptionProvider} · {message.transcriptionModel}
          </p>
        )}
      </div>
    </div>
  )
}
