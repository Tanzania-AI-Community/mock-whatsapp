import { useEffect, useRef, useState } from "react"
import { format, isSameDay, isToday, isYesterday } from "date-fns"
import { ArrowDown } from "lucide-react"

import { type Message } from "@/types/chat"
import { cn } from "@/lib/utils"

import { ChatMessage } from "./ChatMessage"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"

interface ChatContainerProps {
  messages: Message[]
}

export const ChatContainer = ({ messages }: ChatContainerProps) => {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef(messages.length)
  const isInitialLoadRef = useRef(true)

  // Track if user is at bottom and if scroll button should be shown
  const [atBottom, setAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Function to determine if element is at the bottom
  const isAtBottom = () => {
    if (!containerRef.current) return true

    const container = containerRef.current
    // Consider small threshold to account for minor discrepancies
    const threshold = 80
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold

    return atBottom
  }

  // Handle scrolling
  const handleScroll = () => {
    if (containerRef.current) {
      const isBottomVisible = isAtBottom()
      setAtBottom(isBottomVisible)
      setShowScrollButton(!isBottomVisible)
    }
  }

  // Add scroll event listener
  useEffect(() => {
    const currentContainer = containerRef.current
    if (currentContainer) {
      currentContainer.addEventListener("scroll", handleScroll)
      return () => {
        currentContainer.removeEventListener("scroll", handleScroll)
      }
    }
  }, [])

  // Scroll to bottom function
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Scroll to bottom on initial load or when new messages arrive
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current

    // Automatically scroll down if:
    // 1. It's the initial load
    // 2. There are new messages AND user was already at the bottom
    const shouldScrollToBottom =
      isInitialLoadRef.current || (hasNewMessages && atBottom)

    if (shouldScrollToBottom) {
      // Short delay to ensure DOM is updated
      const scrollTimer = setTimeout(() => {
        scrollToBottom()
      }, 100)

      isInitialLoadRef.current = false
      prevMessagesLengthRef.current = messages.length

      return () => clearTimeout(scrollTimer)
    } else if (hasNewMessages) {
      // If new messages arrived but user was scrolled up
      // Update reference but don't scroll (and ensure scroll button is visible)
      prevMessagesLengthRef.current = messages.length
      setShowScrollButton(true)
    }
  }, [messages, atBottom])

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
  // Temporary messages should always appear at the end
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

  const groupMessagesByDate = () => {
    const groups: { date: number; messages: Message[] }[] = []

    sortedMessages.forEach((message) => {
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

  const messageGroups = groupMessagesByDate()

  return (
    <div className="relative h-full">
      <ScrollArea
        className="h-full bg-[#f0f2f5]"
        scrollHideDelay={300}
        ref={containerRef}
        onScrollCapture={handleScroll}
      >
        <div className="flex flex-col space-y-4 p-4">
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
          {/* This div serves as an anchor for scrolling to the bottom */}
          <div ref={bottomRef} className="h-1" />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      <Button
        size="icon"
        variant="secondary"
        className={cn(
          "absolute bottom-6 right-6 h-10 w-10 rounded-full shadow-md transition-opacity duration-300",
          showScrollButton ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={scrollToBottom}
      >
        <ArrowDown className="h-5 w-5" />
      </Button>
    </div>
  )
}
