import { useEffect, useRef, useState } from "react"
import { format, isSameDay, isToday, isYesterday } from "date-fns"
import { ArrowDown } from "lucide-react"

import { type Message } from "@/types/chat"
import { cn } from "@/lib/utils"

import { ChatMessage } from "./ChatMessage"
import { Button } from "./ui/button"

interface ChatContainerProps {
  messages: Message[]
  shouldScrollToBottom?: boolean
  onScrollComplete?: () => void
}

export const ChatContainer = ({
  messages,
  shouldScrollToBottom = false,
  onScrollComplete,
}: ChatContainerProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true)
  const prevMessagesLengthRef = useRef(messages.length)

  // Improved scroll-to-bottom utility
  const scrollToBottom = (smooth: boolean = true) => {
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
  }

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

    if (isAtBottom && !isAutoScrollEnabled) {
      setIsAutoScrollEnabled(true)
    } else if (!isAtBottom && isAutoScrollEnabled) {
      setIsAutoScrollEnabled(false)
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
    const hasNewMessages = messages.length > prevMessagesLengthRef.current

    // Always scroll on initial load or when explicitly requested
    if (shouldScrollToBottom || messages.length === 0) {
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
  }, [messages, shouldScrollToBottom, isAutoScrollEnabled])

  // Force a scroll position check when component mounts
  useEffect(() => {
    // Initial scroll to bottom
    if (messages.length > 0) {
      scrollToBottom(false)
    }

    // Schedule a position check after everything has rendered
    const checkTimer = setTimeout(() => {
      handleScroll()
    }, 500)

    return () => clearTimeout(checkTimer)
  }, [])

  const getDateDivider = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    if (isToday(date)) {
      return "Today"
    }
    if (isYesterday(date)) {
      return "Yesterday"
    }
    return format(date, "MMMM d, yyyy")
  }

  // Sort messages by timestamp to ensure chronological order
  const sortedMessages = [...messages].sort((a, b) => {
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

  const messageGroups = groupMessagesByDate(sortedMessages)

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
              <div className="flex justify-center self-center">
                <div className="rounded-full bg-white px-4 py-1 text-sm text-muted-foreground shadow-sm">
                  {getDateDivider(group.date)}
                </div>
              </div>
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

// Helper function to group messages by date
function groupMessagesByDate(messages: Message[]) {
  const groups: { date: number; messages: Message[] }[] = []

  messages.forEach((message) => {
    const timestamp =
      message.timestamp ||
      (message.created_at
        ? Math.floor(new Date(message.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000))

    const lastGroup = groups[groups.length - 1]
    const messageDate = new Date(timestamp * 1000)

    if (
      !lastGroup ||
      !isSameDay(new Date(lastGroup.date * 1000), messageDate)
    ) {
      groups.push({
        date: timestamp,
        messages: [message],
      })
    } else {
      lastGroup.messages.push(message)
    }
  })

  return groups
}
