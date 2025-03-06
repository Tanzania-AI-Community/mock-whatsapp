import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"

import { type Message } from "@/types/chat"
import { groupMessagesByDate } from "@/lib/messageUtils"
import { cn } from "@/lib/utils"

import { ChatMessage } from "./ChatMessage"
import { DateDivider } from "./DateDivider" // Import our new component
import { Button } from "./ui/button"

interface ChatContainerProps {
  messages: Message[]
  shouldScrollToBottom?: boolean
  onScrollComplete?: () => void
  onScrollStateChange?: (isAtBottom: boolean) => void
}

export const ChatContainer = ({
  messages,
  shouldScrollToBottom = false,
  onScrollComplete,
  onScrollStateChange,
}: ChatContainerProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true)
  const prevMessagesLengthRef = useRef(messages.length)

  console.log("Messages in container :", messages)

  // Filter out empty non-tool messages
  const validMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (msg.role === "tool") return true
      return msg.content && msg.content.trim() !== ""
    })
  }, [messages])

  // Memoize sorted messages using the filtered messages
  const sortedMessages = useMemo(() => {
    return [...validMessages].sort((a, b) => {
      // Temporary messages always at the end
      if (a.isTemp && !b.isTemp) return 1
      if (!a.isTemp && b.isTemp) return -1

      // Otherwise sort by timestamp
      const timestampA =
        a.timestamp ||
        (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0)
      const timestampB =
        b.timestamp ||
        (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0)
      return timestampA - timestampB
    })
  }, [validMessages])

  // Memoize message groups by date
  const messageGroups = useMemo(() => {
    return groupMessagesByDate(sortedMessages)
  }, [sortedMessages])

  // Improved scroll-to-bottom utility with useCallback
  const scrollToBottom = useCallback(
    (smooth: boolean = true) => {
      if (containerRef.current) {
        const container = containerRef.current

        // For smoother scroll, use a small delay to ensure DOM is fully updated
        setTimeout(() => {
          try {
            // First attempt: direct DOM manipulation for reliable scrolling
            container.scrollTop = container.scrollHeight

            // Then use smooth scrolling for animation if requested
            if (smooth) {
              container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
              })
            }

            // Alternative method using the messages end ref as backup
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({
                behavior: smooth ? "smooth" : "auto",
                block: "end",
              })
            }

            // After scrolling, mark that we don't need the button
            setShowScrollButton(false)

            // Update auto-scroll state
            setIsAutoScrollEnabled(true)

            // If using smooth scroll, wait for animation to complete before notifying parent
            if (smooth && onScrollComplete) {
              setTimeout(onScrollComplete, 300) // approximate duration of smooth scroll
            } else if (onScrollComplete) {
              onScrollComplete()
            }
          } catch (e) {
            console.error("Error scrolling to bottom:", e)
            // Fallback: direct scroll assignment
            container.scrollTop = container.scrollHeight
          }
        }, 50)
      }
    },
    [
      messagesEndRef,
      containerRef,
      setShowScrollButton,
      setIsAutoScrollEnabled,
      onScrollComplete,
    ]
  )

  // More accurate scroll position detection
  const handleScroll = () => {
    if (!containerRef.current) return

    const container = containerRef.current
    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    // Use a very small threshold (20px) for better precision
    const isAtBottom = distanceFromBottom <= 20

    // Only update states if they've actually changed
    if (showScrollButton === isAtBottom) {
      setShowScrollButton(!isAtBottom)
    }

    if (isAtBottom !== isAutoScrollEnabled) {
      setIsAutoScrollEnabled(isAtBottom)
      onScrollStateChange?.(isAtBottom)
    }
  }

  // Improved scroll event listener with debounce
  useEffect(() => {
    const currentContainer = containerRef.current
    if (!currentContainer) return

    let scrollTimeout: NodeJS.Timeout | null = null

    const handleScrollDebounced = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      // Use a short debounce to avoid excessive checks
      scrollTimeout = setTimeout(() => {
        handleScroll()
      }, 100)
    }

    currentContainer.addEventListener("scroll", handleScrollDebounced, {
      passive: true,
    })

    return () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
      currentContainer.removeEventListener("scroll", handleScrollDebounced)
    }
  }, [])

  // Check for new messages and scroll accordingly
  useEffect(() => {
    if (messages.length === 0) return

    const hasNewMessages = messages.length > prevMessagesLengthRef.current

    // Always scroll on initial load or when explicitly requested
    if (shouldScrollToBottom) {
      // Short delay to ensure component is fully rendered
      setTimeout(() => scrollToBottom(true), 100)
    }
    // Scroll if new messages arrived and auto-scroll is enabled
    else if (hasNewMessages && isAutoScrollEnabled) {
      scrollToBottom(true)
    }
    // If new messages but not scrolling, show button
    else if (hasNewMessages) {
      setShowScrollButton(true)
    }

    // Update the ref regardless
    prevMessagesLengthRef.current = messages.length
  }, [messages, shouldScrollToBottom, isAutoScrollEnabled, scrollToBottom])

  // Force a scroll position check when component mounts
  useEffect(() => {
    // Only run this effect if we have messages
    if (messages.length === 0) return

    // Initial scroll to bottom
    scrollToBottom(false)

    // Schedule a position check after everything has rendered
    const checkTimer = setTimeout(() => {
      handleScroll()
    }, 500)

    return () => clearTimeout(checkTimer)
  }, [])

  // If no messages, render the empty state
  if (messages.length === 0) {
    return null
  }

  return (
    <div className="relative h-full">
      <div
        className="h-full overflow-y-auto scroll-smooth bg-[#f0f2f5] px-4 py-2"
        ref={containerRef}
        onScroll={handleScroll} // Direct scroll handler for immediate response
      >
        <div className="flex flex-col space-y-4">
          {messageGroups.map((group) => (
            <div key={group.date} className="space-y-2">
              <DateDivider timestamp={group.date} />

              {group.messages.map((message) => (
                <ChatMessage
                  key={`${message.id}-${message.isTemp ? "temp" : "real"}`}
                  message={message}
                />
              ))}
            </div>
          ))}
          {/* This div serves as a scroll anchor with increased height for better targeting */}
          <div ref={messagesEndRef} className="h-4 scroll-mt-4" />
        </div>
      </div>

      {/* Scroll to bottom button with clear visibility conditions */}
      <Button
        size="icon"
        variant="secondary"
        className={cn(
          "absolute bottom-6 right-6 size-10 rounded-full shadow-md transition-all duration-200 ease-in-out",
          showScrollButton
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        )}
        onClick={() => scrollToBottom(true)}
      >
        <ArrowDown className="size-5" />
      </Button>
    </div>
  )
}
