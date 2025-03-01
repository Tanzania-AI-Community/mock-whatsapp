import { useEffect, useRef } from "react"
import { format, isSameDay, isToday, isYesterday } from "date-fns"

import { type Message } from "@/types/chat"

import { ChatMessage } from "./ChatMessage"
import { ScrollArea } from "./ui/scroll-area"

interface ChatContainerProps {
  messages: Message[]
}

export const ChatContainer = ({ messages }: ChatContainerProps) => {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef(messages.length)
  const isInitialLoadRef = useRef(true)

  // Scroll to bottom only on new messages or initial load
  useEffect(() => {
    const shouldScrollToBottom =
      isInitialLoadRef.current ||
      messages.length > prevMessagesLengthRef.current

    if (shouldScrollToBottom) {
      // Using setTimeout to ensure DOM has updated
      const scrollTimer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 100)

      // Update refs
      prevMessagesLengthRef.current = messages.length
      isInitialLoadRef.current = false

      return () => clearTimeout(scrollTimer)
    }
  }, [messages])

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
    <ScrollArea
      ref={scrollAreaRef}
      className="h-full bg-[#f0f2f5]"
      scrollHideDelay={300}
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
  )
}
