"use client"

import { useEffect, useRef, useState } from "react"
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
import {
  excludeClearedMessages,
  getLastMessageId,
  reconcileTempMessages,
  shouldTriggerScroll,
} from "@/lib/messageUtils"
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

async function postInboundMessage(
  body: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch("/api/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
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
  const [isLoading, setIsLoading] = useState(isInitialLoading)
  const [dbError, setDbError] = useState<string | null>(null)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [tempMessages, setTempMessages] = useState<Message[]>([])
  const [pendingInboundCount, setPendingInboundCount] = useState(0)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const [isPollingSuspended, setIsPollingSuspended] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRef = useRef(false)
  const latestRequestIdRef = useRef(0)
  // A ref, because the polling interval keeps its first render's closure
  const clearedThroughIdRef = useRef<number | null>(null)
  const prevMessagesLengthRef = useRef(initialMessages.length)
  const [userJustSentMessage, setUserJustSentMessage] = useState(false)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true) // Add this state

  // Only the newest request's response is applied, so a forced refresh can't be
  // overwritten by an older poll
  const fetchMessages = async ({ force = false } = {}) => {
    if (isPollingSuspended || (isFetchingRef.current && !force)) return
    const requestId = ++latestRequestIdRef.current
    isFetchingRef.current = true

    try {
      setIsLoading(true)
      const response = await requestMessages(
        isReadOnly && observedUserId !== null ? observedUserId : undefined
      )
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

  // Helper function to handle new messages
  const handleNewMessages = (fetchedMessages: Message[]) => {
    const newMessages = excludeClearedMessages(
      fetchedMessages,
      clearedThroughIdRef.current
    )

    setTempMessages((pending) => reconcileTempMessages(pending, newMessages))

    const shouldScroll = shouldTriggerScroll(
      newMessages,
      prevMessagesLengthRef.current,
      userJustSentMessage,
      isAutoScrollEnabled
    )

    if (shouldScroll) {
      setShouldScrollToBottom(true)
      setUserJustSentMessage(false)
    }

    prevMessagesLengthRef.current = newMessages.length
    setMessages(newMessages)
    setDbError(null)
    setConnectionFailed(false)
  }

  // Set up polling
  useEffect(() => {
    // Initial fetch on mount
    fetchMessages()

    // Only set up polling if not suspended
    if (!isPollingSuspended) {
      pollingIntervalRef.current = setInterval(() => {
        fetchMessages()
      }, 2000)

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    } else {
      // Clean up any existing interval when suspended
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollingSuspended])

  // When initial messages are updated from props
  useEffect(() => {
    const visibleInitialMessages = excludeClearedMessages(
      initialMessages,
      clearedThroughIdRef.current
    )
    if (visibleInitialMessages.length > 0 && messages.length === 0) {
      setMessages(visibleInitialMessages)
      prevMessagesLengthRef.current = visibleInitialMessages.length
      setShouldScrollToBottom(true)
    }
  }, [initialMessages, messages.length])

  const handleRefresh = () => {
    // Re-enable polling if it was suspended
    setIsPollingSuspended(false)
    setConnectionFailed(false)
    setShouldScrollToBottom(true)
    void fetchMessages({ force: true })
  }

  // Hides the conversation locally only; the messages stay in Twiga's database
  const handleClearChat = () => {
    const lastMessageId = getLastMessageId(messages)
    if (lastMessageId !== null) {
      clearedThroughIdRef.current = Math.max(
        lastMessageId,
        clearedThroughIdRef.current ?? lastMessageId
      )
    }
    prevMessagesLengthRef.current = 0
    setMessages([])
    setTempMessages([])
  }

  const handleSendMessage = (text: string) => {
    if (isReadOnly) {
      setDbError("Observe mode is read-only. Sending is disabled.")
      return
    }

    // If we have a connection error, prevent sending
    if (connectionFailed) {
      // Show a temporary error that sending is disabled
      setDbError(
        "Cannot send messages while disconnected from the database. Please restore connection and refresh."
      )
      setTimeout(() => {
        setDbError(
          "Database connection failed. Please check your database configuration."
        )
      }, 3000)
      return
    }

    // Set flag that user just sent a message to ensure scroll
    setUserJustSentMessage(true)

    // Always scroll to bottom when sending a new message
    setShouldScrollToBottom(true)

    const tempMessage: Message = {
      id: `temp-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      created_at: new Date(),
      timestamp: Math.floor(Date.now() / 1000),
      status: "sending",
      isTemp: true,
      sentAfterId:
        getLastMessageId(messages) ?? clearedThroughIdRef.current ?? 0,
    }

    setTempMessages((prev) => [...prev, tempMessage])
    setPendingInboundCount((count) => count + 1)
    void postInboundMessage(text)
      .then((result) => {
        if (!result.success) {
          throw new Error(
            result.error ?? "Failed to send message to WhatsApp API"
          )
        }

        setTempMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessage.id ? { ...msg, status: "sent" } : msg
          )
        )

        setTimeout(() => {
          setTempMessages((prev) =>
            prev.filter((msg) => msg.id !== tempMessage.id)
          )
        }, 10000)

        // Load the reply before the typing indicator hides
        return fetchMessages({ force: true })
      })
      .catch((error) => {
        console.error("Error sending message:", error)

        setTempMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessage.id ? { ...msg, status: "error" } : msg
          )
        )

        setTimeout(() => {
          setTempMessages((prev) =>
            prev.filter((msg) => msg.id !== tempMessage.id)
          )
        }, 5000)
      })
      .finally(() => {
        setPendingInboundCount((count) => count - 1)
      })
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
  const filteredMessages =
    messages.length > 0 ? filterAllowedRoles(messages) : []
  const filteredTempMessages =
    tempMessages.length > 0 ? filterAllowedRoles(tempMessages) : []
  const combinedMessages = [...filteredMessages, ...filteredTempMessages]
  const isTyping = pendingInboundCount > 0
  const hasChatContent = combinedMessages.length > 0 || isTyping

  return (
    <div className="mx-auto flex h-screen min-w-[500px] max-w-2xl flex-col rounded-lg bg-primary-foreground shadow-lg">
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
            <div>
              <p className="font-medium">Database Connection Error</p>
              <p className="text-xs">
                Please check your database configuration and ensure PostgreSQL
                is running.
              </p>
            </div>
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
            {dbError && !connectionFailed && (
              <div className="absolute bottom-4 left-4 rounded bg-red-100 px-3 py-1 text-xs text-red-800">
                {dbError}
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
                ? "Database connection required to send messages"
                : "Type a message..."
            }
          />
        </div>
      )}
    </div>
  )
}
