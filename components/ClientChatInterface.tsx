"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Database,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
} from "lucide-react"

import type { Message } from "@/types/chat"
import type { LocalEvent } from "@/types/events"
import { projectChat, reconcileInbound } from "@/lib/localChat"
import { shouldTriggerScroll } from "@/lib/messageUtils"
import { DEFAULT_RECIPIENT_ID } from "@/lib/metaWebhook"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChatContainer } from "@/components/ChatContainer"
import { ChatInput } from "@/components/ChatInput"

// Route handlers avoid the client-side Server Action queue
async function requestMessages(userId?: number): Promise<{
  messages: Message[]
  error?: string
}> {
  const url =
    userId === undefined ? "/api/messages" : `/api/messages?userId=${userId}`
  const response = await fetch(url, { cache: "no-store" })
  return response.json()
}

async function requestEvents(after: number): Promise<{
  events?: LocalEvent[]
  nextCursor: number
  error?: string
}> {
  const response = await fetch(
    `/api/events?recipientId=${DEFAULT_RECIPIENT_ID}&after=${after}`,
    { cache: "no-store" }
  )
  return response.json()
}

async function postInboundMessage(
  body: string,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch("/api/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, messageId }),
  })
  return response.json()
}

interface ClientChatInterfaceProps {
  initialMessages: Message[]
  isInitialLoading?: boolean
  mode?: "chat" | "observe"
  observedUserId?: number | null
}

export default function ClientChatInterface({
  initialMessages,
  isInitialLoading = false,
  mode = "chat",
  observedUserId = null,
}: ClientChatInterfaceProps) {
  const isReadOnly = mode === "observe"
  // Use initialMessages as the starting point for our state
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(
    isInitialLoading || initialMessages.length === 0
  )
  const [dbError, setDbError] = useState<string | null>(null)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [tempMessages, setTempMessages] = useState<Message[]>([])
  const [events, setEvents] = useState<LocalEvent[]>([])
  const [clearedThroughSeq, setClearedThroughSeq] = useState(0)
  const [expiredTypingUntil, setExpiredTypingUntil] = useState(0)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const [isPollingSuspended, setIsPollingSuspended] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRef = useRef(false)
  const latestRequestIdRef = useRef(0)
  // A ref, because the polling interval keeps its first render's closure
  const eventCursorRef = useRef(0)
  const prevMessagesLengthRef = useRef(initialMessages.length)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true) // Add this state

  // Only the newest request's response is applied, so a forced refresh can't be
  // overwritten by an older poll
  const fetchMessages = async ({ force = false } = {}) => {
    if (isPollingSuspended || (isFetchingRef.current && !force)) return
    const requestId = ++latestRequestIdRef.current
    isFetchingRef.current = true

    try {
      setIsLoading(true)
      if (!isReadOnly) {
        const response = await requestEvents(eventCursorRef.current)
        if (requestId !== latestRequestIdRef.current) return
        setIsLoading(false)
        if (!response.events) throw new Error(response.error)
        handleNewEvents(response.events, response.nextCursor)
        return
      }

      const response = await requestMessages(observedUserId ?? undefined)
      if (requestId !== latestRequestIdRef.current) return
      setIsLoading(false)

      if (response.error) {
        handleDatabaseError(response.error)
        return
      }

      if (response.messages) {
        handleNewMessages(response.messages)
      }
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) return
      console.error("Error in fetchMessages:", error)
      setDbError("Failed to fetch messages. Please try again.")
      // Chat mode keeps polling, so it reconnects once the mock is back
      if (!isReadOnly) setConnectionFailed(true)
      setIsLoading(false)
    } finally {
      if (requestId === latestRequestIdRef.current) {
        isFetchingRef.current = false
      }
    }
  }

  // Helper function to handle database errors
  const handleDatabaseError = (error: string) => {
    const isConnectionError = error === "DATABASE_CONNECTION_ERROR"
    setConnectionFailed(isConnectionError)
    setDbError(
      isConnectionError
        ? "Database connection failed. Please check your database configuration."
        : "An error occurred while fetching messages."
    )
    if (isConnectionError) {
      setIsPollingSuspended(true)
    }
  }

  // Helper function to handle new observed messages
  const handleNewMessages = (newMessages: Message[]) => {
    const shouldScroll = shouldTriggerScroll(
      newMessages,
      prevMessagesLengthRef.current,
      false,
      isAutoScrollEnabled
    )

    if (shouldScroll) {
      setShouldScrollToBottom(true)
    }

    prevMessagesLengthRef.current = newMessages.length
    setMessages(newMessages)
    setDbError(null)
    setConnectionFailed(false)
  }

  // Chat mode appends only the events after the cursor
  const handleNewEvents = (newEvents: LocalEvent[], nextCursor: number) => {
    eventCursorRef.current = nextCursor
    setEvents((current) => [...current, ...newEvents])
    setTempMessages((pending) =>
      reconcileInbound(pending, projectChat(newEvents).messages)
    )
    setDbError(null)
    setConnectionFailed(false)
  }

  // Set up polling
  useEffect(() => {
    // Start after the effect commits so loading state changes do not cascade
    // synchronously from the effect itself.
    const initialFetchTimeout = setTimeout(() => {
      void fetchMessages()
    }, 0)

    // Only set up polling if not suspended
    if (!isPollingSuspended) {
      pollingIntervalRef.current = setInterval(() => {
        fetchMessages()
      }, 2000)

      return () => {
        clearTimeout(initialFetchTimeout)
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    } else {
      clearTimeout(initialFetchTimeout)
      // Clean up any existing interval when suspended
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollingSuspended])

  const chat = useMemo(
    () => projectChat(events.filter((event) => event.seq > clearedThroughSeq)),
    [events, clearedThroughSeq]
  )

  // Hides typing once Twiga's indicator would have expired
  useEffect(() => {
    const timeout = setTimeout(
      () => setExpiredTypingUntil(chat.typingUntil),
      Math.max(chat.typingUntil - Date.now(), 0)
    )
    return () => clearTimeout(timeout)
  }, [chat.typingUntil])

  const handleRefresh = () => {
    // Re-enable polling if it was suspended
    setIsPollingSuspended(false)
    setConnectionFailed(false)
    setShouldScrollToBottom(true)
    void fetchMessages({ force: true })
  }

  // Hides the conversation locally only; the event log and Twiga keep it
  const handleClearChat = () => {
    setClearedThroughSeq(eventCursorRef.current)
    setTempMessages([])
  }

  const handleSendMessage = (text: string) => {
    if (isReadOnly) {
      setDbError("Observe mode is read-only. Sending is disabled.")
      return
    }

    if (connectionFailed) return

    // Always scroll to bottom when sending a new message
    setShouldScrollToBottom(true)

    // The event log reuses this id, so the logged copy replaces the temporary one
    const messageId = `wamid.${crypto.randomUUID()}`
    const tempMessage: Message = {
      id: messageId,
      role: "user",
      content: text,
      created_at: new Date(),
      timestamp: Math.floor(Date.now() / 1000),
      status: "sending",
      isTemp: true,
    }

    setTempMessages((prev) => [...prev, tempMessage])
    void postInboundMessage(text, messageId)
      .then((result) => {
        if (!result.success) {
          throw new Error(
            result.error ?? "Failed to send message to WhatsApp API"
          )
        }
      })
      .catch((error) => {
        console.error("Error sending message:", error)

        setTempMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, status: "error", error: String(error.message) }
              : msg
          )
        )
      })
      .finally(() => fetchMessages({ force: true }))
  }

  const handleScrollComplete = () => {
    // Reset the scroll flag after scrolling is complete
    setShouldScrollToBottom(false)
  }

  // Add handler for scroll state changes
  const handleScrollStateChange = (isAtBottom: boolean) => {
    setIsAutoScrollEnabled(isAtBottom)
  }

  // Filter to only show user and assistant messages.
  const filterAllowedRoles = (msgs: Message[]): Message[] => {
    return msgs.filter((msg) => msg.role === "user" || msg.role === "assistant")
  }

  // Combine real and temporary messages for display, filtering out unwanted roles
  const visibleMessages = isReadOnly ? messages : chat.messages
  const filteredMessages =
    visibleMessages.length > 0 ? filterAllowedRoles(visibleMessages) : []
  const filteredTempMessages =
    tempMessages.length > 0 ? filterAllowedRoles(tempMessages) : []
  const combinedMessages = [...filteredMessages, ...filteredTempMessages]
  const isTyping = !isReadOnly && chat.typingUntil > expiredTypingUntil
  const hasChatContent = combinedMessages.length > 0 || isTyping
  const errorMessage =
    dbError ?? (isReadOnly ? null : chat.errors.at(-1)?.error)

  return (
    <div className="mx-auto flex h-screen max-w-2xl min-w-[500px] flex-col rounded-lg bg-primary-foreground shadow-lg">
      {/* Header section */}
      <div className="flex items-center justify-between bg-primary px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <span className="text-lg font-semibold text-primary">T</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-primary-foreground">
              Twiga
            </h1>
            {isReadOnly && observedUserId !== null ? (
              <div className="flex items-center gap-2 text-xs text-primary-foreground/80">
                <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 uppercase tracking-[0.2em]">
                  Observe
                </span>
                <span>User #{observedUserId}</span>
              </div>
            ) : null}
          </div>
          {/* Database status indicator */}
          {connectionFailed ? (
            <div className="flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              <Database className="mr-1 size-3" /> Disconnected
            </div>
          ) : (
            <div className="flex items-center rounded-full bg-green-500 px-2 py-0.5 text-xs text-white">
              <Database className="mr-1 size-3" /> Connected
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-primary-foreground">
              <MoreVertical className="size-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleRefresh}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </DropdownMenuItem>
            {!isReadOnly ? (
              <DropdownMenuItem onClick={handleClearChat}>
                Clear chat
              </DropdownMenuItem>
            ) : null}
            {isReadOnly ? (
              <DropdownMenuItem asChild>
                <Link href="/">Change observed user</Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Database error notification */}
      {connectionFailed && (
        <div className="flex items-center justify-between gap-4 bg-red-50 px-6 py-3 text-sm text-red-800">
          <div className="flex items-center">
            <AlertCircle className="mr-2 size-5 text-red-600" />
            {isReadOnly ? (
              <div>
                <p className="font-medium">Database Connection Error</p>
                <p className="text-xs">
                  Please check your database configuration and ensure PostgreSQL
                  is running.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Mock WhatsApp Connection Error</p>
                <p className="text-xs">
                  Could not load the local event log. Check that the mock is
                  running.
                </p>
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleRefresh}
            className="whitespace-nowrap"
          >
            <RefreshCw className="mr-2 size-4" />
            Retry Connection
          </Button>
        </div>
      )}

      {/* Chat area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLoading && !hasChatContent ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-6 animate-spin" />
            Loading messages...
          </div>
        ) : !hasChatContent ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-4 size-12 opacity-20" />
            <h3 className="mb-1 text-lg font-medium">
              {isReadOnly ? "No conversation found" : "No messages yet"}
            </h3>
            <p className="text-center text-sm">
              {isReadOnly && observedUserId !== null
                ? `No visible user or assistant messages were found for user #${observedUserId}.`
                : "Start a conversation by sending a message below"}
            </p>
          </div>
        ) : (
          <>
            <ChatContainer
              messages={combinedMessages}
              shouldScrollToBottom={shouldScrollToBottom}
              onScrollComplete={handleScrollComplete}
              onScrollStateChange={handleScrollStateChange} // Add this prop
              isTyping={isTyping}
            />
            {errorMessage && !connectionFailed && (
              <div
                role="alert"
                className="absolute bottom-4 left-4 rounded bg-red-100 px-3 py-1 text-xs text-red-800"
              >
                {errorMessage}
              </div>
            )}
          </>
        )}
      </div>

      {/* Input area */}
      {isReadOnly ? (
        <div className="border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Observe mode is read-only. This view only loads conversation history
          from the database.
        </div>
      ) : (
        <div className="p-4">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={connectionFailed}
            placeholder={
              connectionFailed
                ? "Connection required to send messages"
                : "Type a message..."
            }
          />
        </div>
      )}
    </div>
  )
}
