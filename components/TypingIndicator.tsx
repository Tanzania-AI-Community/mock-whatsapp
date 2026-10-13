const DOT_DELAYS_SECONDS = [0, 0.2, 0.4]

export function TypingIndicator() {
  return (
    <div className="flex items-start" role="status" aria-label="Typing">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3">
        {DOT_DELAYS_SECONDS.map((delay) => (
          <span
            key={delay}
            className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-typing-dot"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  )
}
